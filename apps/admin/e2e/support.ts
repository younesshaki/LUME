/**
 * Shared plumbing for the e2e suite's Node-side hooks (global setup/teardown).
 *
 * These run outside Next.js, so .env.local is not loaded for us — we parse it
 * here. The service-role client is confined to creating/destroying the
 * throwaway smoke-test user and its tenants; tests themselves only ever talk
 * to the app through the browser.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Fixed identity for the smoke run; teardown deletes everything it owns. */
export const E2E_EMAIL = "lume-e2e-smoke@example.com";
export const E2E_SITE_NAME = "E2E Smoke Motors";
/** Set by global setup (random per run); readable from tests via process.env. */
export const E2E_PASSWORD_ENV = "LUME_E2E_PASSWORD";

const envDir = path.dirname(fileURLToPath(import.meta.url));

/** Minimal .env.local parser — KEY=VALUE lines, optional surrounding quotes. */
export function loadAdminEnvLocal(): void {
  const envPath = path.resolve(envDir, "..", ".env.local");
  let text: string;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(
      `apps/admin/.env.local not found (${envPath}) — the e2e suite needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`
    );
  }
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }
}

export function createE2EServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — check apps/admin/.env.local.");
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findUserIdByEmail(service: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
}

/**
 * Delete the smoke user and every tenant it OWNS (tenant delete cascades to
 * members, pages, vehicles, personas, rag rows via FK). Scoped strictly to
 * the fixed E2E_EMAIL so it can never touch real data.
 */
export async function destroyE2EUser(service: SupabaseClient): Promise<void> {
  const userId = await findUserIdByEmail(service, E2E_EMAIL);
  if (!userId) return;

  const { data: memberships, error: membershipError } = await service
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("user_id", userId);
  if (membershipError) {
    throw new Error(`tenant_members lookup failed: ${membershipError.message}`);
  }

  const ownedTenantIds = (memberships ?? [])
    .filter((membership) => membership.role === "owner")
    .map((membership) => membership.tenant_id);
  if (ownedTenantIds.length > 0) {
    // Delete vehicles (and their images) BEFORE the tenant: the migration-061
    // inventory-version trigger inserts into tenant_inventory_versions on
    // every vehicle delete, and if it fires during the tenant's FK cascade —
    // after the version row is already gone — the insert violates the FK and
    // the whole cleanup fails. Deleting vehicles while the tenant exists
    // lets the trigger bump the version normally.
    const { error: vehiclesError } = await service
      .from("vehicles")
      .delete()
      .in("tenant_id", ownedTenantIds);
    if (vehiclesError) {
      throw new Error(`vehicle cleanup failed: ${vehiclesError.message}`);
    }
    const { error } = await service.from("tenants").delete().in("id", ownedTenantIds);
    if (error) throw new Error(`tenant cleanup failed: ${error.message}`);
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw new Error(`user cleanup failed: ${error.message}`);
}
