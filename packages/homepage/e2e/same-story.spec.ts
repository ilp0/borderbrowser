/**
 * Stub Playwright spec for the /same-story killer-feature page.
 *
 * NOTE: Playwright is not yet wired into the homepage package — there is
 * no playwright.config and `@playwright/test` is not a declared dependency
 * yet. This spec is intentionally a SCAFFOLD that documents the assertions
 * we want once the test runner is set up. It uses a soft import so that
 * the file is still parseable in editors / typecheckers and the bare
 * `describe`/`test` calls below can be filled in when we install
 * `@playwright/test` and add a config.
 */

// @ts-expect-error — `@playwright/test` is not installed yet; see file header.
import { test, expect } from "@playwright/test";

test.describe("/same-story (killer feature scaffold)", () => {
  test("renders the page heading", async ({ page }) => {
    await page.goto("/same-story");
    await expect(
      page.getByRole("heading", { level: 1, name: /same story, many countries/i }),
    ).toBeVisible();
  });

  test("shows multiple source cards", async ({ page }) => {
    await page.goto("/same-story");
    const cards = page.locator(".story-card");
    await expect(cards).toHaveCount(8);
  });

  test("each source card links out to the outlet", async ({ page }) => {
    await page.goto("/same-story");
    const links = page.locator(".story-card-link");
    const count = await links.count();
    expect(count).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < count; i++) {
      await expect(links.nth(i)).toHaveAttribute("href", /^https?:\/\//);
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
    }
  });

  test("nav exposes the Same story link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Same story" })).toBeVisible();
  });
});
