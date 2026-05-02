/**
 * Edge cache for paid users (Vision §8: opt-in shared cache).
 *
 * Privacy invariants:
 *  - We hash content only. No URLs, no API keys, no user identifiers go into
 *    the key or the value.
 *  - The value is the upstream response body verbatim — same bytes the LLM
 *    produced for the first user who paid.
 *
 * The key is derived from (model, target language, message content). Two
 * requests that ask the same model to translate the same messages into the
 * same language collide on the same key, regardless of which user issued them.
 */

import type { Env } from "./types.ts";

/** A chat message as it appears in /v1/chat/completions. */
export type ChatMessage = {
  role?: string;
  content?: unknown;
  [k: string]: unknown;
};

/** Default TTL: 7 days. News pages drift; stale-while-revalidate is the next layer. */
export const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

/**
 * Build a cache key.
 *
 * `targetLang` may be empty — callers that don't track it pass "". The model
 * and message content alone usually disambiguate (the target language is
 * baked into the system prompt), but including it explicitly lets clients
 * partition the cache when they want to.
 */
export async function cacheKey(
  model: string,
  targetLang: string,
  messages: readonly ChatMessage[],
): Promise<string> {
  // Deterministic message encoding: each message serialized with sorted keys,
  // joined in original order. Order matters semantically, so we don't sort
  // messages — only their property keys.
  const encoded = messages.map(stableStringify).join("\n");
  const input = `${model}:${targetLang}:${encoded}`;
  return await sha256Hex(input);
}

/** Read a cached response body. Returns null on miss or KV unavailable. */
export async function cacheGet(env: Env, key: string): Promise<string | null> {
  const kv = env.TRANSLATION_CACHE;
  if (!kv) return null;
  return await kv.get(key);
}

/** Write a response body. Silently no-ops if KV is not bound. */
export async function cachePut(
  env: Env,
  key: string,
  value: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const kv = env.TRANSLATION_CACHE;
  if (!kv) return;
  // Cloudflare KV requires expirationTtl >= 60.
  const ttl = Math.max(60, Math.floor(ttlSeconds));
  await kv.put(key, value, { expirationTtl: ttl });
}

/** sha256 → lowercase hex. Available in Workers via SubtleCrypto. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < view.length; i++) {
    hex += view[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * JSON.stringify with deterministic key ordering. Two objects that are deeply
 * equal but whose properties were inserted in different orders produce the
 * same string — important for cache key stability across clients.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(stableStringify).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts: string[] = [];
  for (const k of keys) {
    parts.push(JSON.stringify(k) + ":" + stableStringify(obj[k]));
  }
  return "{" + parts.join(",") + "}";
}
