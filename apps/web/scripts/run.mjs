import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  previewEnvironment,
  databaseConfiguration,
} from "../config/environment.ts";

const command = process.argv[2];
if (!["dev", "build", "start"].includes(command))
  throw new Error("Unsupported web command");
// Next auto-loads .env files after process sanitization; disallow that bypass.
for (const name of [
  ".env",
  ".env.local",
  ".env.development",
  ".env.development.local",
  ".env.production",
  ".env.production.local",
]) {
  if (existsSync(name))
    throw new Error(
      "Supply web preview configuration through isolated process bindings, not .env files",
    );
}
const env = previewEnvironment(process.env);
if (command !== "build") databaseConfiguration(env);
const require = createRequire(import.meta.url);
const next = require.resolve("next/dist/bin/next");
const args =
  command === "build"
    ? ["build", "--webpack"]
    : [
        command,
        ...(command === "dev" ? ["--webpack"] : []),
        "--hostname",
        "127.0.0.1",
        "--port",
        env.PORT ?? "3200",
      ];
const audit =
  env.WEB_PREVIEW_TEST_MODE === "1"
    ? [
        "--import",
        fileURLToPath(new URL("./runtime-audit.mjs", import.meta.url)),
      ]
    : [];
const child = spawn(process.execPath, [...audit, next, ...args], {
  env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
