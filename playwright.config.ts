import { defineConfig, devices } from "@playwright/test";

/**
 * Root Playwright config for BorderBrowser e2e tests.
 *
 * Two projects:
 *   - `homepage`   — exercises the Astro site at http://localhost:4321
 *   - `extension`  — loads the built MV3 extension from packages/extension/dist
 *
 * The homepage project starts an Astro `preview` server via `webServer` so the
 * suite is self-contained. CI builds the homepage before running e2e (see
 * .github/workflows/ci.yml), so `preview` finds the pre-built output.
 */

const HOMEPAGE_PORT = 4321;
const HOMEPAGE_BASE_URL = `http://localhost:${HOMEPAGE_PORT}`;
const EXTENSION_DIST = "packages/extension/dist";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      // Tests directly under e2e/ exercise the static homepage at baseURL.
      // Tests under e2e/extension/ are scoped to the extension project below.
      name: "homepage",
      testDir: "./e2e",
      testIgnore: /[\\/]extension[\\/]/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: HOMEPAGE_BASE_URL,
      },
    },
    {
      // MV3 extensions only load in a headed (or new-headless) Chromium
      // launched with persistent context. Future extension tests should use
      // `chromium.launchPersistentContext` directly rather than `page` from
      // these defaults; the launchOptions here document the canonical args.
      name: "extension",
      testDir: "./e2e/extension",
      use: {
        ...devices["Desktop Chrome"],
        headless: false,
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_DIST}`,
            `--load-extension=${EXTENSION_DIST}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run -w @borderbrowser/homepage preview -- --host 127.0.0.1 --port 4321",
    url: HOMEPAGE_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
