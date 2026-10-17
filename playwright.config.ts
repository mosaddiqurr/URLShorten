import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { existsSync } from "node:fs";

const localBrowsers = path.resolve(".cache/ms-playwright");
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync(localBrowsers)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsers;
}
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5190",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1024 },
      },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js --host 127.0.0.1 --configLoader runner --port 5190",
    url: "http://127.0.0.1:5190",
    env: { URLSHORTEN_DATA_DIR: ".data/e2e" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
