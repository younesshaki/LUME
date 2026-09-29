/**
 * Reset a single demo tenant's Website tutorial state before a presentation.
 *
 * Dry run (default): npm run reset:website-tour -- --tenant demo-sean
 * Apply:             npm run reset:website-tour -- --tenant demo-sean --apply
 *
 * The script refuses a tenant with zero or more than one member to avoid
 * clearing a colleague's state by accident. It never changes website content.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseResetWebsiteTourArgs } from "./reset-website-tour-lib";

const SCRIPT_DIR = fileURLToPath(new URL(".", import.meta.url));

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined) process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

function requiredEnv(name: "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY"): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing from apps/admin/.env.local.`);
  return value;
}

async function main() {
  const args = parseResetWebsiteTourArgs(process.argv.slice(2));
  const repoRoot = resolve(SCRIPT_DIR, "..");
  loadEnvFile(resolve(repoRoot, "apps/admin/.env.local"));

  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", args.tenantSlug)
    .maybeSingle();
  if (tenantError || !tenant) throw new Error("Eligible demo tenant was not found.");

  const { data: members, error: memberError } = await supabase
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", tenant.id)
    .limit(2);
  if (memberError) throw new Error("Unable to inspect tenant membership.");
  if (!members || members.length !== 1) {
    throw new Error("Reset refused: the demo tenant must have exactly one member.");
  }

  if (!args.apply) {
    console.log(`Dry run: would reset Website tutorial state for tenant "${tenant.slug}".`);
    console.log("Re-run with --apply to make this one preference-row change.");
    return;
  }

  const { error: updateError } = await supabase
    .from("tenant_member_preferences")
    .update({
      website_tour_version: null,
      website_tour_completed_at: null,
      website_tour_skipped_at: null,
      website_tour_dismissed_at: null,
      website_section_tour_dismissals: {},
    })
    .eq("tenant_id", tenant.id)
    .eq("user_id", members[0].user_id);
  if (updateError) throw new Error("Unable to reset Website tutorial state.");
  console.log(`Reset Website tutorial state for tenant "${tenant.slug}".`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `✖ ${error.message}` : "✖ Reset failed.");
  process.exitCode = 1;
});
