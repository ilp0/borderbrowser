import { expect, test } from "@playwright/test";

/**
 * Stub spec for editorial metadata rendering on the homepage directory.
 *
 * Verifies that:
 *  - Each non-mainstream site renders an editorial chip with the right label.
 *  - Site descriptions render as muted secondary text under the link.
 *  - State-media labels are honest (e.g., RT-grade outlets carry "State media").
 */

test.describe("homepage editorial metadata", () => {
  test("renders state-media chip on Xinhua (China)", async ({ page }) => {
    await page.goto("/");
    const xinhua = page.locator(".site-row", { hasText: "新华网" });
    await expect(xinhua).toBeVisible();
    await expect(xinhua.locator(".chip-state")).toContainText("State media");
  });

  test("renders independent-in-exile chip on Meduza (Russia)", async ({ page }) => {
    await page.goto("/");
    const meduza = page.locator(".site-row", { hasText: "Meduza" });
    await expect(meduza).toBeVisible();
    await expect(meduza.locator(".chip-independent-in-exile")).toBeVisible();
  });

  test("renders a description for every site row", async ({ page }) => {
    await page.goto("/");
    const rows = page.locator(".site-row");
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).locator(".site-desc")).not.toHaveText("");
    }
  });

  test("does not render a chip for plain mainstream sites", async ({ page }) => {
    await page.goto("/");
    const lemonde = page.locator(".site-row", { hasText: "Le Monde" });
    await expect(lemonde).toBeVisible();
    await expect(lemonde.locator(".chip")).toHaveCount(0);
  });
});
