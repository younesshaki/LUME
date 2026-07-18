import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/public",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --host 127.0.0.1",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 120_000,
    // The head-level connection-hint tests need a deterministic cross-origin
    // public asset host. Real deployments provide this required value through
    // Vercel; use a harmless test-only host when a local .env is absent.
    env: {
      ...process.env,
      VITE_R2_PUBLIC_BASE_URL:
        process.env.VITE_R2_PUBLIC_BASE_URL ?? "https://pub-da3069790c6443f883e3991be965f766.r2.dev",
    },
  },
});
