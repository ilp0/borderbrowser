/**
 * Playwright spec stub: keyboard shortcuts via the `commands` API.
 *
 * Status: stub. The full extension E2E harness (loading the unpacked
 * `dist/` build in a persistent context, stubbing the OpenRouter
 * round-trip, dispatching the global accelerators) is a sibling unit;
 * once that lands, fill in the steps below.
 *
 * Suggested key bindings (manifest.json `commands`):
 *   - translate-page  → Alt+T          (Ctrl+T is reserved for new-tab)
 *   - toggle-original → Alt+O
 *   - premium-retry   → Alt+Shift+P    (Ctrl+Shift+T is reopen-closed-tab)
 *
 * Users can rebind these at chrome://extensions/shortcuts.
 */

import { test } from "@playwright/test";

test.describe("keyboard shortcuts", () => {
  test.skip("Alt+T triggers translate-page", async () => {
    // 1. Launch persistent context with --load-extension=<dist>
    // 2. Open a fixture page in a known foreign language.
    // 3. Stub bg.translate to return canned units.
    // 4. await page.keyboard.press("Alt+T")
    // 5. Expect the atomic swap: original → translated in one frame.
  });

  test.skip("Alt+O toggles between original and translated", async () => {
    // 1. After a successful translation, press Alt+O.
    // 2. Expect content to flip back to original.
    // 3. Press Alt+O again → translated again.
  });

  test.skip("Alt+Shift+P re-translates with the premium model", async () => {
    // 1. Translate once with the standard model.
    // 2. Press Alt+Shift+P.
    // 3. Expect a fresh bg.translate call with model = config.premiumModel.
  });
});
