/**
 * Playwright spec stub: attribute & meta translation.
 *
 * Loads the BorderBrowser extension against `fixtures/attrs.html`, dispatches
 * `borderbrowser:translate`, then asserts that user-facing attribute strings
 * (alt, title, placeholder, aria-label, aria-description, input value) and
 * meta tag content (description, og:*, twitter:*) are no longer in French.
 *
 * Marked `test.fixme` until the full Playwright + extension harness lands in a
 * later unit. Run-shape mirrors the convention sketched in docs/VISION.md so
 * future units can flip `fixme` → real assertions without churning structure.
 */
import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = `file://${resolve(here, "fixtures/attrs.html").replace(/\\/g, "/")}`;

test.fixme("translates user-facing attributes and meta tags", async ({ page }) => {
  await page.goto(fixtureUrl);

  // Trigger translation via the same CustomEvent the content script listens for.
  await page.evaluate(() => {
    document.dispatchEvent(
      new CustomEvent("borderbrowser:translate", {
        detail: { targetLang: "English" },
      }),
    );
  });

  // Wait for the overlay to come and go.
  await page.waitForFunction(() => {
    const host = document.getElementById("__borderbrowser_overlay__");
    if (!host?.shadowRoot) return false;
    return !host.shadowRoot.querySelector(".root.show");
  });

  // Generic element attrs.
  await expect(page.locator("img")).toHaveAttribute("alt", /photo/i);
  await expect(page.locator("img")).toHaveAttribute("title", /detail|hover/i);
  await expect(page.locator('input[type="search"]')).toHaveAttribute(
    "placeholder",
    /search/i,
  );
  await expect(page.locator("button")).toHaveAttribute("aria-label", /close/i);
  await expect(page.locator('input[type="submit"]')).toHaveAttribute(
    "value",
    /send|submit/i,
  );
  await expect(page.locator('input[type="button"]')).toHaveAttribute(
    "value",
    /cancel/i,
  );
  await expect(page.locator('a[href="/about"]')).toHaveAttribute("title", /about/i);
  await expect(page.locator("div[aria-description]")).toHaveAttribute(
    "aria-description",
    /information|additional/i,
  );

  // Meta tags.
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /demonstration|test/i,
  );
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /opengraph/i,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    "content",
    /opengraph|preview/i,
  );
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute(
    "content",
    /twitter/i,
  );
  await expect(page.locator('meta[name="twitter:description"]')).toHaveAttribute(
    "content",
    /twitter|card/i,
  );
});
