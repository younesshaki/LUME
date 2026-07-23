#!/usr/bin/env tsx
/**
 * Read-only operator CLI for Dealer Launch Certification.
 *
 *   npm run audit:tenant-launch -- --tenant demo --profile pilot
 *   npm run audit:tenant-launch -- --tenant demo --profile public --format json
 *
 * Exit codes: 0 = ready · 1 = readiness blockers · 2 = configuration/runtime error.
 * Uses the SAME evaluator as the Admin UI (apps/admin/lib/launchReadiness.ts)
 * and the same snapshot loader (apps/admin/lib/launchReadiness.server.ts).
 * Never writes tenant data; never prints credentials, emails, prompts, or
 * document content — the report's evidence is safe scalars by construction.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { evaluateLaunchReadiness } from "../apps/admin/lib/launchReadiness";
import { loadTenantLaunchSnapshot } from "../apps/admin/lib/launchReadiness.server";
import {
  formatLaunchAuditHuman,
  formatLaunchAuditJson,
  parseLaunchAuditArgs,
} from "./tenant-launch-audit-lib";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(2);
}

async function main(): Promise<void> {
  const parsed = parseLaunchAuditArgs(process.argv.slice(2));
  if (!parsed.ok) fail(parsed.error);
  const { tenant, profile, format } = parsed.args;

  loadEnvFile(resolve(REPO_ROOT, "apps/admin/.env.local"));
  loadEnvFile(resolve(REPO_ROOT, ".env.local"));
  const url = process.env.SUPABASE_URL ?? fail("SUPABASE_URL missing (apps/admin/.env.local).");
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    fail("SUPABASE_SERVICE_ROLE_KEY missing (apps/admin/.env.local).");

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let snapshot;
  try {
    snapshot = await loadTenantLaunchSnapshot(
      client as unknown as Parameters<typeof loadTenantLaunchSnapshot>[0],
      tenant,
    );
  } catch (error) {
    fail(`Failed to load tenant data: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!snapshot) fail(`Unknown tenant "${tenant}".`);

  const report = evaluateLaunchReadiness(snapshot, profile);
  console.log(format === "json" ? formatLaunchAuditJson(report) : formatLaunchAuditHuman(report));
  process.exit(report.ready ? 0 : 1);
}

void main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
