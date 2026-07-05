import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke suite for the admin app. Runs against the local dev server
 * (started automatically below) but against the REAL Supabase project —
 * global setup/teardown create and destroy a throwaway user + tenant via
 * the service role, so runs are self-cleaning.
 *
 * Run with `npm run test:e2e` (repo root or apps/admin). Not part of
 * `npm test` on purpose: it needs a browser, the dev server, and network.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // Dev-server cold compiles are slow; keep generous per-test budgets.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  // The suite is one serial user journey — parallelism would race it.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
