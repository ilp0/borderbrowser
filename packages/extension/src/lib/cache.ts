/**
 * Persistent translation cache (IndexedDB).
 *
 * Translations are deterministic for a given input + target language + model,
 * so we store the full translations array keyed by:
 *
 *     (url, contentHash, targetLang, modelTier)
 *
 * `contentHash` is SHA-256 of the concatenated original unit texts — the
 * structural fingerprint of the page's translatable content. The URL is part
 * of the key because two pages with identical content (e.g. an empty 404
 * shell) shouldn't poison each other's translations, and because future
 * features (per-domain throttles, deletion-by-site) need a URL handle.
 *
 * We cap the database at 500MB and evict in LRU order on insert. Only
 * extension-owned data (the user's own translations) is stored here; nothing
 * is sent off-device.
 *
 * Atomic-swap rule: callers receive the FULL translations array in one shot
 * so they can do a single synchronous DOM pass. We never stream entries.
 */
import type { SerializedUnit } from "./messages.ts";

const DB_NAME = "borderbrowser_cache_v1";
const DB_VERSION = 1;
const STORE = "translations";
const SIZE_CAP_BYTES = 500 * 1024 * 1024; // 500 MB

export type CachedTranslation = { id: number; text: string };

export type CacheKey = {
  url: string;
  contentHash: string;
  targetLang: string;
  modelTier: string;
};

type CacheRecord = CacheKey & {
  /** Composite primary key — `${url}|${contentHash}|${targetLang}|${modelTier}`. */
  pk: string;
  translations: CachedTranslation[];
  /** Approximate byte cost (JSON length of translations). */
  size: number;
  /** Last access (read or write) ms epoch. Updated on every hit. */
  lastAccess: number;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function pkOf(k: CacheKey): string {
  return `${k.url}|${k.contentHash}|${k.targetLang}|${k.modelTier}`;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "pk" });
        // LRU eviction scans by `lastAccess` ascending.
        store.createIndex("lastAccess", "lastAccess", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
  return dbPromise;
}

/**
 * SHA-256 of the concatenated original unit texts. We separate units with
 * a 0x1F unit-separator so adjacent text in different units cannot collide
 * with text inside a single unit.
 */
export async function computeContentHash(units: Pick<SerializedUnit, "text">[]): Promise<string> {
  const joined = units.map((u) => u.text).join("");
  const bytes = new TextEncoder().encode(joined);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) {
    const byte = arr[i] ?? 0;
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

/** Get a cached translations array, or `null` on miss. Bumps lastAccess on hit. */
export async function getCached(key: CacheKey): Promise<CachedTranslation[] | null> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return null;
  }
  const pk = pkOf(key);
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const getReq = store.get(pk);
    getReq.onsuccess = () => {
      const rec = getReq.result as CacheRecord | undefined;
      if (!rec) {
        resolve(null);
        return;
      }
      rec.lastAccess = Date.now();
      store.put(rec);
      resolve(rec.translations);
    };
    getReq.onerror = () => resolve(null);
    tx.onerror = () => resolve(null);
  });
}

/** Write a translation result. Triggers LRU eviction if over the size cap. */
export async function putCached(
  key: CacheKey,
  translations: CachedTranslation[],
): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  const json = JSON.stringify(translations);
  const rec: CacheRecord = {
    ...key,
    pk: pkOf(key),
    translations,
    size: json.length,
    lastAccess: Date.now(),
  };
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
  await evictIfOverCap(db);
}

/**
 * If total stored bytes exceed `SIZE_CAP_BYTES`, delete least-recently-used
 * records until we're back under the cap. Single readwrite transaction so an
 * interrupted eviction can't leave us in a half-evicted state.
 */
async function evictIfOverCap(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);

    // First pass: total size. Walk the lastAccess index because we'll reuse
    // the same index for the eviction cursor below.
    let total = 0;
    const records: { pk: string; size: number; lastAccess: number }[] = [];
    const sumReq = store.index("lastAccess").openCursor();
    sumReq.onsuccess = () => {
      const cursor = sumReq.result;
      if (cursor) {
        const v = cursor.value as CacheRecord;
        total += v.size;
        records.push({ pk: v.pk, size: v.size, lastAccess: v.lastAccess });
        cursor.continue();
        return;
      }
      // Records arrive in ascending lastAccess order, so the head of the
      // array is exactly the LRU eviction candidates.
      let i = 0;
      while (total > SIZE_CAP_BYTES && i < records.length) {
        const r = records[i++];
        if (!r) break;
        store.delete(r.pk);
        total -= r.size;
      }
    };
    sumReq.onerror = () => resolve();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** Test-only: drop the entire cache. Not exported through any UI. */
export async function clearCache(): Promise<void> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

/** Test-only: total bytes currently stored. */
export async function totalSize(): Promise<number> {
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return 0;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).openCursor();
    let total = 0;
    req.onsuccess = () => {
      const c = req.result;
      if (c) {
        total += (c.value as CacheRecord).size;
        c.continue();
      } else {
        resolve(total);
      }
    };
    req.onerror = () => resolve(total);
  });
}

