import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;
export type ClaimedTenantDomain = Database["public"]["Tables"]["tenant_domains"]["Row"];
export type DomainVerificationState = "pending" | "verified" | "failed";

export async function claimTenantDomainsForVerification(
  client: DbClient,
  limit = 50,
): Promise<ClaimedTenantDomain[]> {
  const { data, error } = await client.rpc("claim_tenant_domains_for_verification", {
    p_limit: Math.min(100, Math.max(1, Math.trunc(limit))),
  });
  if (error) throw new Error(`Unable to claim domains for verification: ${error.message}`);
  return data ?? [];
}

export function resolveDomainVerificationState(
  providerVerified: boolean,
  createdAt: string,
  nowMs = Date.now(),
): DomainVerificationState {
  if (providerVerified) return "verified";
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return "pending";
  return nowMs - createdMs >= 24 * 60 * 60_000 ? "failed" : "pending";
}
