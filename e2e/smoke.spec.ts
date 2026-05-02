import { expect, test } from "@playwright/test";

test.describe("homepage smoke", () => {
  test("/ loads and contains BorderBrowser", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok(), "homepage / should respond 2xx").toBeTruthy();

    // The brand text appears in the header, the <title>, and the lede.
    // Asserting against the rendered body keeps the test resilient to small
    // copy changes elsewhere on the page.
    await expect(page.locator("body")).toContainText("BorderBrowser");
  });
});
