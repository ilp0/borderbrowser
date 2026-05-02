/**
 * Playwright spec stub for /atlas.
 *
 * Not wired into a test runner yet — Playwright isn't a dep of this
 * package. Once we add it (`npm i -D -w @borderbrowser/homepage @playwright/test`),
 * these checks should pass against `npm run dev` / `npm run preview`.
 */

import { expect, test } from "@playwright/test";

test.describe("/atlas", () => {
  test("loads with the expected title and map", async ({ page }) => {
    await page.goto("/atlas");
    await expect(page).toHaveTitle(/Atlas · BorderBrowser/);
    await expect(page.locator("svg.atlas-map")).toBeVisible();
  });

  test("renders one marker per country in the directory", async ({ page }) => {
    await page.goto("/atlas");
    // Each country in `countries.ts` is one .atlas-marker <g>.
    const markers = page.locator(".atlas-marker");
    // We currently track 20 countries. If this changes, update the data,
    // not the test.
    await expect(markers).toHaveCount(20);
  });

  test("clicking a marker opens the country modal", async ({ page }) => {
    await page.goto("/atlas");
    await page.locator('.atlas-marker[data-code="fr"]').click();

    const modal = page.locator("#atlas-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator("#atlas-modal-title")).toHaveText("France");
    await expect(modal.locator(".site-row").first()).toBeVisible();
  });

  test('"see in directory" link points at the country anchor', async ({ page }) => {
    await page.goto("/atlas");
    await page.locator('.atlas-marker[data-code="jp"]').click();
    await expect(page.locator("#atlas-modal-jump")).toHaveAttribute(
      "href",
      "/#country-jp",
    );
  });

  test("escape closes the modal", async ({ page }) => {
    await page.goto("/atlas");
    await page.locator('.atlas-marker[data-code="de"]').click();
    await expect(page.locator("#atlas-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#atlas-modal")).toBeHidden();
  });

  test("nav has an Atlas link from anywhere", async ({ page }) => {
    await page.goto("/");
    await page.locator('a[href="/atlas"]').first().click();
    await expect(page).toHaveURL(/\/atlas$/);
  });
});
