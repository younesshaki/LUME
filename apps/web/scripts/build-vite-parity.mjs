import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";
import { previewEnvironment } from "../config/environment.ts";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const baseline = process.env.CONTENT_BASELINE_ROOT;
const work = process.env.LIVE_PARITY_WORK;
assert.ok(baseline && work, "Set CONTENT_BASELINE_ROOT and LIVE_PARITY_WORK");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: baseline,
    encoding: "utf8",
  }).trim(),
  "cff045f2479f4f8e6c741b3044af11356484ed6e",
);
const live = JSON.parse(
  fs.readFileSync(path.join(work, "vite-live-settings.json")),
);
const env = previewEnvironment(process.env);
assert.ok(env.WEB_PREVIEW_SUPABASE_URL && env.WEB_PREVIEW_SUPABASE_ANON_KEY);
Object.assign(env, {
  VITE_SUPABASE_URL: env.WEB_PREVIEW_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: env.WEB_PREVIEW_SUPABASE_ANON_KEY,
  VITE_R2_PUBLIC_BASE_URL:
    "https://pub-da3069790c6443f883e3991be965f766.r2.dev",
  VITE_LUME_TENANT: "demo",
  VITE_PAGE_RENDERER: String(live.pageRendererEnabled),
  VITE_USE_BACKEND: "true",
  VITE_ENABLE_LOCAL_CHAT: "false",
  VITE_POSTHOG_ENABLED: "false",
  VITE_ENABLE_GOOEY_NAV: "false",
});
for (const [name, cwd] of [
  ["before", baseline],
  ["after", root],
]) {
  const child = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "build",
      "--outDir",
      path.join(work, "vite-" + name),
      "--emptyOutDir",
    ],
    { cwd, env, stdio: "inherit" },
  );
  assert.equal(
    await new Promise((resolve) => child.on("exit", resolve)),
    0,
    name + " production build",
  );
}
