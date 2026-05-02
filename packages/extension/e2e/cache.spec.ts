/**
 * Playwright E2E stub — IndexedDB persistent translation cache.
 *
 * This file is a STUB / scaffolding. The harness for loading the unpacked
 * Chromium extension and driving it from Playwright is not yet wired into
 * this monorepo (Unit 9 of 30 — the runner lives elsewhere in the batch).
 *
 * It documents the verification flow so a later unit can drop in the actual
 * `@playwright/test` import + `chromium.launchPersistentContext` boilerplate
 * without rewriting the assertions.
 *
 * Manual verification (works today, no harness needed):
 *   1. Build the extension and load `dist/` as an unpacked extension.
 *   2. Configure an OpenRouter API key in the options page.
 *   3. Visit a foreign-language page and trigger BorderBrowser. Wait for
 *      the atomic swap, then close the tab.
 *   4. Re-open the same URL and trigger BorderBrowser again. The translated
 *      DOM should appear without a network round-trip — `lastStats.elapsedMs`
 *      drops to single-digit ms and `inputTokens` is 0.
 *   5. DevTools → Application → IndexedDB → `borderbrowser_cache_v1` →
 *      `translations` shows the cached record.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */
type StubTest = (name: string, fn: () => Promise<void> | void) => void;
const test: StubTest = (_name, _fn) => {
  // Intentionally a no-op until the e2e runner is wired in.
};

test("first visit translates and persists; second visit hits the cache", async () => {
  // Pseudocode for the eventual implementation:
  //
  // const ctx = await launchExtension();
  // const page = await ctx.newPage();
  //
  // await page.goto(`file://${path.resolve(__dirname, "fixtures/cached.html")}`);
  // await page.evaluate(() => {
  //   document.dispatchEvent(new CustomEvent("borderbrowser:translate"));
  // });
  // await page.waitForFunction(() => /* translated state visible */ true);
  //
  // // First visit should have written a cache record.
  // const sizeAfterFirst = await page.evaluate(async () => {
  //   const db = await new Promise<IDBDatabase>((res, rej) => {
  //     const r = indexedDB.open("borderbrowser_cache_v1");
  //     r.onsuccess = () => res(r.result);
  //     r.onerror = () => rej(r.error);
  //   });
  //   return await new Promise<number>((res) => {
  //     const tx = db.transaction("translations", "readonly");
  //     const req = tx.objectStore("translations").count();
  //     req.onsuccess = () => res(req.result);
  //   });
  // });
  // expect(sizeAfterFirst).toBeGreaterThan(0);
  //
  // // Second visit: instrument the bg.translate IPC and verify it isn't called.
  // await page.reload();
  // await page.evaluate(() => {
  //   document.dispatchEvent(new CustomEvent("borderbrowser:translate"));
  // });
  // // Translation must apply without going to the network.
});

test("cache key partitions by url, contentHash, targetLang, modelTier", async () => {
  // Stub: same content under two URLs should yield two separate cache
  // entries. Same URL with two target languages should yield two entries.
});

test("LRU eviction keeps total bytes under the 500MB cap", async () => {
  // Stub: synthetically write fake records totalling >500MB and assert
  // that the oldest entries are dropped first.
});
