/**
 * SPA MutationObserver pipeline.
 *
 * After the user has explicitly translated a page, dynamically-inserted DOM
 * (SPA route changes, infinite scroll, lazy-rendered comments, etc.) needs
 * the same treatment. We watch `document.body` for `childList` mutations,
 * debounce by 300ms, then send each batch through the translate pipeline
 * and apply the results in a single atomic swap.
 *
 * Invariants the rest of the codebase relies on:
 *
 *   - Atomic per-batch swap. Pre-compute all { el, html } updates from the
 *     bg response before touching the DOM, then write them in one tight loop
 *     wrapped in a `requestAnimationFrame`. No half-translated UI.
 *   - Translated subtrees are marked with `data-bb-translated="1"` and skipped
 *     on subsequent passes (mutations inside those subtrees from our own
 *     `innerHTML` writes are not re-translated).
 *   - The observer stays connected throughout the flush. Self-mutations
 *     from `applyTranslated` (innerHTML + the `data-bb-translated` attr) are
 *     filtered by the ancestor walk in `isUnderTranslated`, because the
 *     attribute is set BEFORE the innerHTML write in the same synchronous
 *     task — so when the observer callback runs as a microtask, every
 *     newly-inserted child already has a translated ancestor.
 *   - The observer pauses (via `isBusy()`) while a translation pass is in
 *     flight from any source — including the initial `translatePage` call —
 *     so we never overlap two LLM round-trips on the same tab. Mutations
 *     that arrive during a pass accumulate in `pending` and flush as soon
 *     as the pass clears, so SPA inserts during the bg round-trip aren't
 *     lost.
 *
 * No telemetry, no network calls live in this module. It is glue between the
 * DOM and the existing translate pipeline owned by `content.ts`.
 */
import { extractFromNode } from "@borderbrowser/translator/browser/dom";
import type { LiveExtractResult } from "@borderbrowser/translator/browser/dom";

/**
 * Marker attribute set on every element whose `innerHTML` we have replaced
 * with a translation. The observer skips any subtree rooted at one of these.
 */
export const TRANSLATED_ATTR = "data-bb-translated";

export type SpaObserverOptions = {
  /**
   * Returns true if a translation pass is already in flight. The observer
   * holds new batches in a queue while busy and flushes once it clears.
   */
  isBusy(): boolean;

  /**
   * Translate + apply a batch atomically. Implementations must:
   *   1. Snapshot extracted units before any DOM writes.
   *   2. Ship them through the existing bg.translate path.
   *   3. Pre-compute all (el, html) pairs.
   *   4. Apply them in one synchronous write loop, marking each root with
   *      `data-bb-translated="1"`.
   */
  runBatch(extract: LiveExtractResult): Promise<void>;

  /**
   * Debounce window in milliseconds. Defaults to 300ms (the unit spec).
   * Exposed so the e2e harness can shorten it for fast assertions.
   */
  debounceMs?: number;

  /**
   * Optional debug hook — mirrors the `debug()` helper in content.ts.
   * Off in production.
   */
  onDebug?: (phase: string, data: unknown) => void;
};

type Handle = {
  observer: MutationObserver;
  timer: ReturnType<typeof setTimeout> | null;
  pending: Set<Element>;
  disposed: boolean;
};

let active: Handle | null = null;

/**
 * Start observing `document.body` for newly-inserted nodes.
 * Idempotent: a second call is a no-op while one is already active.
 */
export function startSpaObserver(opts: SpaObserverOptions): void {
  if (active) return;

  const debounceMs = opts.debounceMs ?? 300;
  const debug = opts.onDebug ?? (() => {});

  const handle: Handle = {
    observer: new MutationObserver((records) => onMutations(records)),
    timer: null,
    pending: new Set<Element>(),
    disposed: false,
  };

  function onMutations(records: MutationRecord[]): void {
    for (const r of records) {
      if (r.type !== "childList") continue;
      r.addedNodes.forEach((node) => {
        if (node.nodeType !== 1 /* ELEMENT_NODE */) return;
        const el = node as Element;
        // Cheap upfront skip: anything inside an already-translated subtree
        // is one of our own writes (or content we'll re-handle if its root
        // gets re-translated explicitly).
        if (isUnderTranslated(el)) return;
        handle.pending.add(el);
      });
    }
    if (handle.pending.size === 0) return;
    armTimer();
  }

  function armTimer(): void {
    if (handle.disposed) return;
    if (handle.timer !== null) clearTimeout(handle.timer);
    handle.timer = setTimeout(() => {
      handle.timer = null;
      void tryFlush();
    }, debounceMs);
  }

  async function tryFlush(): Promise<void> {
    if (handle.disposed) return;
    if (opts.isBusy()) {
      // A translation pass is already running. Re-arm so we flush as soon
      // as the next mutation arrives after the current pass settles.
      armTimer();
      return;
    }
    if (handle.pending.size === 0) return;

    // Drain pending into this batch's candidate list. The observer stays
    // connected; any mutations that arrive during the bg round-trip below
    // refill `pending` and trigger another flush after this one settles.
    const candidates = Array.from(handle.pending);
    handle.pending.clear();

    // Drop any records that arrived while the timer was pending — they
    // describe DOM we're about to walk. Without this, `pending` could
    // re-collect descendants of nodes we just took.
    handle.observer.takeRecords();

    const roots = dedupeRoots(candidates);
    debug("spa.batch", { candidates: candidates.length, roots: roots.length });

    if (roots.length === 0) return;

    // Compose a single extract result spanning every root, threading ids so
    // they stay unique across roots. This lets `runBatch` send one bg call
    // and apply one atomic swap for the whole batch.
    const merged: LiveExtractResult = { units: [], refs: new Map() };
    let nextId = 1;
    for (const root of roots) {
      const got = extractFromNode(root, nextId);
      for (const u of got.units) merged.units.push(u);
      for (const [id, el] of got.refs) merged.refs.set(id, el);
      nextId = got.nextId;
    }

    if (merged.units.length === 0) return;

    try {
      await opts.runBatch(merged);
    } catch (err) {
      debug("spa.error", { msg: err instanceof Error ? err.message : String(err) });
    } finally {
      // Anything the page inserted during the await is already in `pending`
      // (the observer stayed connected). Re-arm so it flushes next.
      if (handle.pending.size > 0) armTimer();
    }
  }

  active = handle;
  handle.observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  debug("spa.start", { debounceMs });
}

/**
 * Stop observing and discard any pending mutations. Idempotent.
 */
export function stopSpaObserver(): void {
  if (!active) return;
  active.disposed = true;
  if (active.timer !== null) clearTimeout(active.timer);
  active.observer.disconnect();
  active.pending.clear();
  active = null;
}

/** True when the element is inside (or is) a translated root. */
function isUnderTranslated(el: Element): boolean {
  let cur: Element | null = el;
  while (cur) {
    if (cur.nodeType === 1 && cur.hasAttribute?.(TRANSLATED_ATTR)) return true;
    cur = cur.parentElement;
  }
  return false;
}

/**
 * Drop nodes that:
 *   - Are no longer attached to the document.
 *   - Are descendants of another candidate (covered by their ancestor).
 *   - Are inside a translated subtree (re-checked, since the page can mutate
 *     between observation and flush).
 */
function dedupeRoots(candidates: Element[]): Element[] {
  const attached = candidates.filter(
    (el) => el.isConnected && !isUnderTranslated(el),
  );
  const out: Element[] = [];
  for (const el of attached) {
    let covered = false;
    for (const other of attached) {
      if (other === el) continue;
      if (other.contains(el)) {
        covered = true;
        break;
      }
    }
    if (!covered) out.push(el);
  }
  return out;
}
