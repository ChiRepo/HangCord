import { defineConfig, devices } from "@playwright/test";

// Every e2e runs on desktop AND phones (MASTER_PLAN §15.1).
// PW_CHROMIUM_PATH lets a sandbox use a preinstalled Chromium; CI uses Playwright's own browsers.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
const chromium = executablePath ? { launchOptions: { executablePath } } : {};
// PW_NO_WEBKIT=1 is ONLY for sandboxes that can't download WebKit: the iPhone projects then run the
// iPhone 15 viewport/touch profile on Chromium and say so in their name. CI never sets it, so real
// WebKit (Safari engine) always runs there. Never set it in CI.
const noWebkit = process.env.PW_NO_WEBKIT === "1" && !process.env.CI;
const safari = (name: string, device: (typeof devices)[string]) =>
  noWebkit ? { name: `${name}-viewport-on-chromium`, use: { ...device, browserName: "chromium" as const, defaultBrowserType: "chromium" as const, ...chromium } } : { name, use: { ...device } };

export default defineConfig({
  testDir: "./specs",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run preview -w apps/web",
    cwd: "../..",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, ...chromium } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], ...chromium } },
    safari("mobile-safari", devices["iPhone 15"]),
    { name: "mobile-chrome-landscape", use: { ...devices["Pixel 7 landscape"], ...chromium } },
    safari("mobile-safari-landscape", devices["iPhone 15 landscape"]),
    { name: "small-phone-360", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 }, ...chromium } },
    { name: "tablet-touch", use: { viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, ...chromium } },
  ],
});
