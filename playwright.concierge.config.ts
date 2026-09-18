import { defineConfig, devices } from "@playwright/test";

/**
 * Concierge browser verification.
 *
 * A separate config from playwright.public.config.ts on purpose. These specs
 * need the chat widget mounted (`VITE_ENABLE_LOCAL_CHAT=true`), which the
 * other public specs deliberately run without — enabling it there would add a
 * chat surface, and its network traffic, to tests that are measuring
 * something else. A distinct port keeps `reuseExistingServer` from handing
 * this suite a server started without the flag.
 *
 * Every backend call these specs make is fulfilled by `page.route`. Nothing
 * here reaches Supabase, a model provider, or any tenant data: the point is
 * to verify what the BROWSER does with a stream, which does not require a
 * real one and must not cost provider spend to check.
 */
const externalBaseUrl = process.env.PLAYWRIGHT_CONCIERGE_BASE_URL;
const baseURL = externalBaseUrl ?? "http://127.0.0.1:5174";

export default defineConfig({
  testDir: "./e2e/concierge",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  // The chat launcher pulses continuously, so Playwright never sees it
  // "stable" enough to click. Reduced motion plus the stylesheet injected in
  // the spec makes these runs deterministic.
  use: { baseURL, trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "npm run dev -- --host 127.0.0.1 --port 5174",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...process.env,
          VITE_ENABLE_LOCAL_CHAT: "true",
          VITE_R2_PUBLIC_BASE_URL:
            process.env.VITE_R2_PUBLIC_BASE_URL ??
            "https://pub-da3069790c6443f883e3991be965f766.r2.dev",
        },
      },
});
