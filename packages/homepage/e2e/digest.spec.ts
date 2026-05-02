// Playwright spec stub for /digest opt-in landing.
// The Playwright runner is not wired up at the workspace root yet; this file
// captures the intended assertions so it can be plugged in once @playwright/test
// is installed.
import { test, expect } from "@playwright/test";

test.describe("/digest opt-in landing", () => {
  test("renders hero, sample digest card, and signup form", async ({ page }) => {
    await page.goto("/digest");

    // Hero pitch
    await expect(page.locator("h1")).toContainText("front pages");

    // Sample digest card lists 8 country rows
    const rows = page.locator(".digest-row");
    await expect(rows).toHaveCount(8);

    // Form has email + optional API key fields, plus submit button
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#apiKey")).toBeVisible();
    await expect(page.locator("button[type=submit]")).toContainText("Subscribe");

    // Form posts to backend stub
    const action = await page.locator("#digest-form").getAttribute("action");
    expect(action).toBe("/digest/subscribe");
  });
});
