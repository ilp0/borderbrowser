/**
 * Unit test for the IndexedDB persistent translation cache.
 *
 * Uses `fake-indexeddb` to simulate the browser's IndexedDB so the cache
 * module can be exercised in plain Node. The fake-indexeddb shims must be
 * installed BEFORE we import the cache module — the module captures the
 * `indexedDB` global on first use.
 *
 * crypto.subtle is available natively in Node 22.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

import "fake-indexeddb/auto";

import {
  type CacheKey,
  clearCache,
  computeContentHash,
  getCached,
  putCached,
  totalSize,
} from "../src/lib/cache.ts";

const baseKey = (overrides: Partial<CacheKey> = {}): CacheKey => ({
  url: "https://example.com/",
  contentHash: "abc",
  targetLang: "English",
  modelTier: "standard",
  ...overrides,
});

describe("cache", () => {
  beforeEach(async () => {
    await clearCache();
  });

  it("returns null on miss", async () => {
    const got = await getCached(baseKey());
    assert.equal(got, null);
  });

  it("round-trips a translation list", async () => {
    const translations = [
      { id: 1, text: "Hei" },
      { id: 2, text: "Maailma" },
    ];
    await putCached(baseKey(), translations);
    const got = await getCached(baseKey());
    assert.deepEqual(got, translations);
  });

  it("partitions by every key field", async () => {
    await putCached(baseKey(), [{ id: 1, text: "v1" }]);
    assert.equal(await getCached(baseKey({ url: "https://other.com/" })), null);
    assert.equal(await getCached(baseKey({ contentHash: "different" })), null);
    assert.equal(await getCached(baseKey({ targetLang: "Suomi" })), null);
    assert.equal(await getCached(baseKey({ modelTier: "premium" })), null);
  });

  it("computeContentHash is stable and order-sensitive", async () => {
    const a = await computeContentHash([{ text: "hello" }, { text: "world" }]);
    const b = await computeContentHash([{ text: "hello" }, { text: "world" }]);
    const c = await computeContentHash([{ text: "world" }, { text: "hello" }]);
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^[0-9a-f]{64}$/);
  });

  it("tracks size via totalSize", async () => {
    const before = await totalSize();
    await putCached(baseKey(), [{ id: 1, text: "x".repeat(100) }]);
    const after = await totalSize();
    assert.ok(after > before);
  });
});
