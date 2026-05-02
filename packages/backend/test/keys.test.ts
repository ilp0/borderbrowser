/**
 * Unit tests for src/keys.ts. Pure functions — no mocks needed. We rely on
 * the global Web Crypto API (available on Node 22+ and Cloudflare Workers).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateApiKey,
  hashKey,
  isWellFormed,
  keyPrefix,
} from "../src/keys.ts";

test("generateApiKey produces well-formed bb_live_ keys", () => {
  for (let i = 0; i < 32; i++) {
    const key = generateApiKey();
    assert.ok(
      isWellFormed(key),
      `expected well-formed key, got ${JSON.stringify(key)}`,
    );
    assert.equal(key.length, "bb_live_".length + 24);
    assert.ok(key.startsWith("bb_live_"));
  }
});

test("generateApiKey collisions are vanishingly rare", () => {
  // 24 chars from 57-symbol alphabet ≈ 140 bits. Spot-check uniqueness across
  // a small sample so a regression to e.g. Math.random() is caught fast.
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(generateApiKey());
  assert.equal(seen.size, 1000);
});

test("isWellFormed accepts the canonical shape", () => {
  assert.equal(
    isWellFormed("bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e"),
    true,
  );
});

test("isWellFormed rejects malformed keys", () => {
  const bad = [
    "",
    "bb_live_",
    "bb_test_aB3kQ8wRp9zNvXm2yP4cTd5e",  // wrong env tag
    "bb_live_aB3kQ8wRp9zNvXm2yP4cTd5",   // 23 chars
    "bb_live_aB3kQ8wRp9zNvXm2yP4cTd5ee", // 25 chars
    "bb_live_aB3kQ8wRp9zNvXm2yP4cTd5!",  // invalid char
    "BB_LIVE_aB3kQ8wRp9zNvXm2yP4cTd5e",  // case mismatch on prefix
    "Bearer bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e", // includes auth header noise
  ];
  for (const s of bad) {
    assert.equal(isWellFormed(s), false, `expected reject: ${JSON.stringify(s)}`);
  }
});

test("keyPrefix returns the first 12 chars", () => {
  const key = "bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e";
  assert.equal(keyPrefix(key), "bb_live_aB3k");
  assert.equal(keyPrefix(key).length, 12);
});

test("keyPrefix on a freshly generated key is 12 chars and starts with bb_live_", () => {
  const key = generateApiKey();
  const prefix = keyPrefix(key);
  assert.equal(prefix.length, 12);
  assert.ok(prefix.startsWith("bb_live_"));
  assert.ok(key.startsWith(prefix));
});

test("hashKey returns a 64-char lowercase hex SHA-256", async () => {
  const hash = await hashKey("bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e");
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test("hashKey is deterministic for the same input", async () => {
  const a = await hashKey("bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e");
  const b = await hashKey("bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e");
  assert.equal(a, b);
});

test("hashKey differs across different inputs", async () => {
  const a = await hashKey("bb_live_aB3kQ8wRp9zNvXm2yP4cTd5e");
  const b = await hashKey("bb_live_aB3kQ8wRp9zNvXm2yP4cTd5f");
  assert.notEqual(a, b);
});

test("hashKey matches a known SHA-256 vector", async () => {
  // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
  const got = await hashKey("abc");
  assert.equal(
    got,
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

test("round-trip: generate → hash → prefix is stable", async () => {
  const key = generateApiKey();
  const h1 = await hashKey(key);
  const h2 = await hashKey(key);
  const p1 = keyPrefix(key);
  const p2 = keyPrefix(key);
  assert.equal(h1, h2);
  assert.equal(p1, p2);
  assert.ok(isWellFormed(key));
});
