import { defineConfig, devices } from "@playwright/test";

// UI tests for the desktop app's screens (apps/desktop/ui), run in Chromium at desktop window sizes.
// The built app itself is tested by tests/desktop/run.mjs (real WebView). Phone browsers and the mobile
// gate belong to the web companion on the WebApp branch.
// PW_CHROMIUM_PATH lets a sandbox use a preinstalled Chromium; CI uses Playwright's own browsers.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const chromium = executablePath ? { launchOptions: { executablePath } } : {};

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview -w apps/desktop/ui",
    cwd: "../..",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "window-1440", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...chromium } },
    { name: "window-1024", use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 700 }, ...chromium } },
    { name: "window-narrow-480", use: { ...devices["Desktop Chrome"], viewport: { width: 480, height: 760 }, ...chromium } },
  ],
});
