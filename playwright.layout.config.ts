import { defineConfig, devices } from "@playwright/test";

/**
 * Header/footer stress matrix (sprint task A1).
 *
 * Tenant config normally comes from Supabase. Here the app is pointed at a
 * fake Supabase host that the spec intercepts, so every combination of header
 * variant, logo placement, nav length, footer variant and colour mode runs
 * through the real loading path (tenant_by_slug → get_tenant_theme →
 * list_published_nav_pages → normalizeSiteDesign) with no network and no
 * production data. Run against both desktop navs, like the header suite.
 */
export const STUB_SUPABASE_URL = "http://supabase.stub.test";

const R2 =
  process.env.VITE_R2_PUBLIC_BASE_URL ?? "https://pub-da3069790c6443f883e3991be965f766.r2.dev";

function server(port: number, gooey: boolean) {
  return {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/home`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_R2_PUBLIC_BASE_URL: R2,
      VITE_ENABLE_LOCAL_CHAT: "true",
      VITE_ENABLE_GOOEY_NAV: gooey ? "true" : "false",
      VITE_SUPABASE_URL: STUB_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: "stub-anon-key",
      VITE_LUME_TENANT: "matrix",
      VITE_TURNSTILE_SITE_KEY: "",
    },
  };
}

export default defineConfig({
  testDir: "./e2e/layout",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "gooey-nav", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5188" } },
    { name: "classic-nav", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5189" } },
  ],
  webServer: [server(5188, true), server(5189, false)],
});
