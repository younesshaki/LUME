import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnv } from "node:util";

import {
  supabaseProjectRef,
  validateDeploymentEnvironment,
} from "./verify-deployment-env.mjs";
import { mergeParityRuntimeEnvironment } from "./local-parity-env.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const adminDirectory = path.join(root, "apps/admin");
const branch = "staging";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function validateStagingEnvironment() {
  const errors = validateDeploymentEnvironment(process.env, "staging");
  if (errors.length > 0) {
    console.error(`[local-parity] ${errors.join("; ")}`);
    process.exit(1);
  }
}

function runService(service) {
  validateStagingEnvironment();
  if (service === "admin") {
    run("npm", ["run", "build"], { cwd: adminDirectory });
    const next = path.join(root, "node_modules/next/dist/bin/next");
    const child = spawn(process.execPath, [next, "start", "--port", "3100"], {
      cwd: adminDirectory,
      env: process.env,
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  if (service === "public") {
    const environment = {
      ...process.env,
      VITE_ADMIN_API_HOST: "http://127.0.0.1:3100",
    };
    run("npm", ["run", "build"], { env: environment });
    const child = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1"], {
      cwd: root,
      env: environment,
      stdio: "inherit",
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }
  throw new Error(`Unknown parity service: ${service}`);
}

async function pullEnvironment(cwd, label) {
  const directory = await mkdtemp(path.join(os.tmpdir(), `lume-parity-${label}-`));
  const destination = path.join(directory, ".env");
  try {
    const result = spawnSync(
      "vercel",
      [
        "env",
        "pull",
        destination,
        "--yes",
        "--environment",
        "preview",
        "--git-branch",
        branch,
      ],
      { cwd, stdio: ["ignore", "ignore", "inherit"] },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Unable to pull ${label} staging environment`);
    const remoteEnvironment = parseEnv(await readFile(destination, "utf8"));
    try {
      const localOverrides = parseEnv(
        await readFile(path.join(cwd, ".env.staging.local"), "utf8"),
      );
      return { ...remoteEnvironment, ...localOverrides };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return remoteEnvironment;
      }
      throw error;
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function waitFor(url, child, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`${url} process exited before becoming ready`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runParityStack() {
  const publicEnvironment = await pullEnvironment(root, "public");
  const adminEnvironment = await pullEnvironment(adminDirectory, "admin");
  const publicErrors = validateDeploymentEnvironment(publicEnvironment, "staging");
  const adminErrors = validateDeploymentEnvironment(adminEnvironment, "staging");
  const publicRef = supabaseProjectRef(publicEnvironment.SUPABASE_URL);
  const adminRef = supabaseProjectRef(adminEnvironment.SUPABASE_URL);
  if (publicRef && adminRef && publicRef !== adminRef) {
    adminErrors.push("Public and admin staging environments target different Supabase projects");
  }
  const errors = [...publicErrors, ...adminErrors];
  if (errors.length > 0) {
    console.error(`[local-parity] ${[...new Set(errors)].join("; ")}`);
    process.exit(1);
  }

  const currentScript = fileURLToPath(import.meta.url);
  const admin = spawn(process.execPath, [currentScript, "--service=admin"], {
    cwd: adminDirectory,
    env: mergeParityRuntimeEnvironment(process.env, adminEnvironment),
    stdio: "inherit",
  });
  const children = [admin];
  const stop = () => {
    for (const child of children) {
      if (child.exitCode === null) child.kill("SIGTERM");
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await waitFor("http://127.0.0.1:3100/api/health", admin);
    const publicSite = spawn(process.execPath, [currentScript, "--service=public"], {
      cwd: root,
      env: mergeParityRuntimeEnvironment(process.env, publicEnvironment),
      stdio: "inherit",
    });
    children.push(publicSite);
    await waitFor("http://127.0.0.1:5173", publicSite);
    console.log("[local-parity] public: http://127.0.0.1:5173");
    console.log("[local-parity] admin:  http://127.0.0.1:3100");
    await new Promise((resolve) => {
      admin.once("exit", resolve);
      publicSite.once("exit", resolve);
    });
  } finally {
    stop();
  }
}

const serviceArgument = process.argv.find((argument) => argument.startsWith("--service="));
if (serviceArgument) {
  runService(serviceArgument.slice("--service=".length));
} else {
  await runParityStack();
}
