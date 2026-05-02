/**
 * E2E for the accessibility polish (Unit 7).
 *
 * SKIPPED until Unit 1 lands the Playwright + extension-loader harness.
 * Once that exists, this spec asserts:
 *   - every translated block element has a `lang="<target>"` attribute
 *   - the overlay's shadow root contains exactly ONE `[role=status]`
 *     announcement after the atomic swap
 *   - when emulating `prefers-reduced-motion: reduce`, the overlay shows/hides
 *     instantly (computed transition-duration === 0s)
 */
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = `file://${path.join(here, "fixtures", "accessibility.html")}`;

test.describe.skip("accessibility polish", () => {
  test("sets lang on every translated element", async ({ page }) => {
    await page.goto(FIXTURE);
    await page.evaluate(() =>
      document.dispatchEvent(
        new CustomEvent("borderbrowser:translate", {
          detail: { targetLang: "English" },
        }),
      ),
    );
    await expect(page.locator("h1")).toHaveAttribute("lang", "en");
    const langAttrs = await page
      .locator("p, h1, nav")
      .evaluateAll((els) => els.map((e) => e.getAttribute("lang")));
    expect(langAttrs.every((l) => l === "en")).toBe(true);
  });

  test("announces the translation once via aria-live", async ({ page }) => {
    await page.goto(FIXTURE);
    await page.evaluate(() =>
      document.dispatchEvent(
        new CustomEvent("borderbrowser:translate", {
          detail: { targetLang: "English" },
        }),
      ),
    );
    const announcements = await page.evaluate(() => {
      const host = document.getElementById("__borderbrowser_overlay__");
      const root = (host as unknown as { shadowRoot: ShadowRoot | null })
        ?.shadowRoot;
      return root
        ? Array.from(root.querySelectorAll('[role="status"]')).map(
            (n) => n.textContent ?? "",
          )
        : [];
    });
    expect(announcements).toHaveLength(1);
    expect(announcements[0]).toMatch(/Page translated to English/);
  });

  test("respects prefers-reduced-motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(FIXTURE);
    const transitionDuration = await page.evaluate(() => {
      const host = document.getElementById("__borderbrowser_overlay__");
      const root = (host as unknown as { shadowRoot: ShadowRoot | null })
        ?.shadowRoot;
      const overlay = root?.querySelector(".root") as HTMLElement | null;
      return overlay ? getComputedStyle(overlay).transitionDuration : "";
    });
    expect(transitionDuration).toBe("0s");
    await context.close();
  });
});
