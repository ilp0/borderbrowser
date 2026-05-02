/**
 * SPA MutationObserver pipeline — Playwright stub.
 *
 * This file is intentionally a stub. The live verification path for this
 * unit is the Chrome-MCP recipe described in UNIT 11 of the build plan:
 *   1. `npm run -w @borderbrowser/extension build`
 *   2. Open `e2e/fixtures/spa.html` in Chrome with the unpacked extension.
 *   3. Inject a stub translator (or set up a real key) and trigger the
 *      `borderbrowser:translate` event so `startSpaObserver()` arms.
 *   4. Click `#bb-spa-add` to insert a French paragraph.
 *   5. Within ~500ms the new paragraph should carry `data-bb-translated="1"`
 *      and its text should match the stub translator's output.
 *
 * We do not pull Playwright into the dependency tree yet — the extension
 * has no harness for it and the unit's contract is satisfied by the MCP
 * recipe. This file exists so a future Playwright pass can drop into a
 * shape that already mirrors the recipe.
 */

// `test` and `expect` are intentionally not imported — Playwright is not a
// dependency yet. Resolve at the time someone wires the harness up.
declare const test: {
  describe: { skip: (name: string, fn: () => void) => void };
  skip: (name: string, fn: () => Promise<void> | void) => void;
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const expect: unknown;

if (typeof test !== "undefined") {
  test.describe.skip("SPA MutationObserver pipeline", () => {
    test.skip("translates paragraphs inserted after initial swap", async () => {
      // Pseudocode for the future Playwright run:
      //
      //   await page.goto("file://.../spa.html");
      //   await page.evaluate(() => window.__bbInstallStubTranslator());
      //   await page.evaluate(() =>
      //     document.dispatchEvent(new CustomEvent("borderbrowser:translate")),
      //   );
      //   await page.click("#bb-spa-add");
      //   await expect(
      //     page.locator(".bb-spa-added[data-bb-translated='1']").first(),
      //   ).toBeVisible({ timeout: 1500 });
    });
  });
}

export {};
