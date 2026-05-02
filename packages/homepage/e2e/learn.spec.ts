import { expect, test } from "@playwright/test";

// Stub spec for the /learn landing page.
// Wire up once a homepage Playwright runner is configured at the workspace level.

test.describe("/learn landing", () => {
  test("hero, features, and side-by-side sample render", async ({ page }) => {
    await page.goto("/learn");

    // Hero
    await expect(
      page.getByRole("heading", {
        name: /Read foreign-language news as a learning loop\./i,
        level: 1,
      }),
    ).toBeVisible();

    // Three feature cards
    await expect(
      page.getByRole("heading", { name: /Side-by-side reading/i, level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Frequency-based vocabulary/i, level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Spaced-repetition export/i, level: 2 }),
    ).toBeVisible();

    // Static FR/EN sample is present and lang-tagged.
    const fr = page.locator(".learn-col-source");
    const en = page.locator(".learn-col-target");
    await expect(fr).toHaveAttribute("lang", "fr");
    await expect(en).toHaveAttribute("lang", "en");
    await expect(fr).toContainText("Le Premier ministre");
    await expect(en).toContainText("The Prime Minister");

    // CTA links into the install page.
    const installCta = page.getByRole("link", { name: /Install BorderBrowser/i });
    await expect(installCta.first()).toHaveAttribute("href", "/install");
  });

  test("nav exposes the Learn link", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator(".topbar nav a", { hasText: "Learn" }),
    ).toHaveAttribute("href", "/learn");
  });
});
