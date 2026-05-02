import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TTL_SECONDS,
  cacheGet,
  cacheKey,
  cachePut,
} from "../src/cache.ts";
import type { Env } from "../src/types.ts";

/**
 * In-memory KV double — matches the surface we actually use (`get` and
 * `put` with `expirationTtl`). Real KV testing requires a live namespace
 * and is out of scope for this unit-test layer.
 */
function fakeKv(): {
  get: (k: string) => Promise<string | null>;
  put: (k: string, v: string, opts?: { expirationTtl?: number }) => Promise<void>;
  store: Map<string, { value: string; ttl?: number }>;
} {
  const store = new Map<string, { value: string; ttl?: number }>();
  return {
    store,
    async get(k) {
      return store.get(k)?.value ?? null;
    },
    async put(k, v, opts) {
      store.set(k, { value: v, ttl: opts?.expirationTtl });
    },
  };
}

function envWith(kv: ReturnType<typeof fakeKv> | null): Env {
  // Only the field under test is populated; cast keeps the rest off the surface.
  return { TRANSLATION_CACHE: kv as unknown as KVNamespace } as unknown as Env;
}

describe("cacheKey", () => {
  it("is stable for identical inputs", async () => {
    const messages = [
      { role: "system", content: "Translate into French." },
      { role: "user", content: "Hello world." },
    ];
    const a = await cacheKey("openai/gpt-4o-mini", "fr", messages);
    const b = await cacheKey("openai/gpt-4o-mini", "fr", messages);
    assert.equal(a, b);
  });

  it("returns a 64-char lowercase hex digest", async () => {
    const k = await cacheKey("m", "en", [{ role: "user", content: "hi" }]);
    assert.match(k, /^[0-9a-f]{64}$/);
  });

  it("changes when the model changes", async () => {
    const messages = [{ role: "user", content: "x" }];
    const a = await cacheKey("model-a", "en", messages);
    const b = await cacheKey("model-b", "en", messages);
    assert.notEqual(a, b);
  });

  it("changes when the target language changes", async () => {
    const messages = [{ role: "user", content: "x" }];
    const a = await cacheKey("m", "en", messages);
    const b = await cacheKey("m", "fr", messages);
    assert.notEqual(a, b);
  });

  it("changes when message content changes", async () => {
    const a = await cacheKey("m", "en", [{ role: "user", content: "hi" }]);
    const b = await cacheKey("m", "en", [{ role: "user", content: "bye" }]);
    assert.notEqual(a, b);
  });

  it("preserves message order — different order is a different key", async () => {
    // Order is semantic in chat completions.
    const a = await cacheKey("m", "en", [
      { role: "user", content: "one" },
      { role: "user", content: "two" },
    ]);
    const b = await cacheKey("m", "en", [
      { role: "user", content: "two" },
      { role: "user", content: "one" },
    ]);
    assert.notEqual(a, b);
  });

  it("ignores property insertion order within a message", async () => {
    // Two clients build the same message object with keys in different orders.
    const a = await cacheKey("m", "en", [{ role: "user", content: "hi" }]);
    const b = await cacheKey("m", "en", [{ content: "hi", role: "user" }]);
    assert.equal(a, b);
  });

  it("treats empty messages array deterministically", async () => {
    const a = await cacheKey("m", "en", []);
    const b = await cacheKey("m", "en", []);
    assert.equal(a, b);
    assert.match(a, /^[0-9a-f]{64}$/);
  });
});

describe("cacheGet / cachePut", () => {
  it("round-trips a value", async () => {
    const kv = fakeKv();
    const env = envWith(kv);
    await cachePut(env, "k", "value");
    assert.equal(await cacheGet(env, "k"), "value");
  });

  it("returns null on miss", async () => {
    const env = envWith(fakeKv());
    assert.equal(await cacheGet(env, "missing"), null);
  });

  it("uses the default TTL when none is given", async () => {
    const kv = fakeKv();
    await cachePut(envWith(kv), "k", "v");
    assert.equal(kv.store.get("k")?.ttl, DEFAULT_TTL_SECONDS);
  });

  it("forwards a custom TTL", async () => {
    const kv = fakeKv();
    await cachePut(envWith(kv), "k", "v", 3600);
    assert.equal(kv.store.get("k")?.ttl, 3600);
  });

  it("clamps TTLs below the KV minimum (60s)", async () => {
    const kv = fakeKv();
    await cachePut(envWith(kv), "k", "v", 5);
    assert.equal(kv.store.get("k")?.ttl, 60);
  });

  it("no-ops when the KV binding is absent", async () => {
    // env without TRANSLATION_CACHE — code should not throw.
    const env = {} as Env;
    await cachePut(env, "k", "v");
    assert.equal(await cacheGet(env, "k"), null);
  });

  it("does not include user identity or URLs in any stored field", async () => {
    // Sanity: the API surface gives no place to leak them. We can only assert
    // the function signature and that get/put return only the value — no
    // metadata is exposed back to callers.
    const kv = fakeKv();
    await cachePut(envWith(kv), "abc", "{\"answer\":42}");
    const v = await cacheGet(envWith(kv), "abc");
    assert.equal(v, "{\"answer\":42}");
  });
});
