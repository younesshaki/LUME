import { defineConfig, devices } from "@playwright/test";

/**
 * Header navigation, verified against BOTH nav implementations.
 *
 * The desktop nav is chosen at build time (`VITE_ENABLE_GOOEY_NAV`), so each
 * style needs its own dev server: production runs the gooey nav, the classic
 * `DesktopNav` is the default elsewhere. Every backend call is stubbed in the
 * spec; with no Supabase env the header renders the built-in nav items, which
 * keeps the assertions deterministic.
 */
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
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
    },
  };
}

export default defineConfig({
  testDir: "./e2e/header",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { trace: "retain-on-failure", reducedMotion: "reduce" },
  projects: [
    { name: "gooey-nav", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5186" } },
    { name: "classic-nav", use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:5187" } },
  ],
  webServer: [server(5186, true), server(5187, false)],
});
