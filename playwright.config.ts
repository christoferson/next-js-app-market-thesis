import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests run against a production build in demo mode — no live
 * providers, no credentials, deterministic fixture data (SPEC §20.7).
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3210",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3210",
    url: "http://localhost:3210/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
