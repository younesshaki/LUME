import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;
type SubscriptionStatus = Database["public"]["Tables"]["subscriptions"]["Row"]["status"];

export const CUSTOM_DOMAIN_LIMIT_KEYS = [
  "custom_domains",
  "custom_domain_limit",
  "domains",
] as const;

export type DomainReservation = {
  outcome: "created" | "limit_exceeded" | "domain_conflict";
  domainId: string | null;
  limit: number;
  count: number;
};

export function resolveCustomDomainLimit(input: {
  subscriptionStatus: SubscriptionStatus | null;
  planName: string | null;
  limits: Record<string, unknown> | null;
}): number {
  if (!input.subscriptionStatus || input.subscriptionStatus === "trialing" ||
    input.subscriptionStatus === "inactive" || input.subscriptionStatus === "canceled") return 0;
  for (const key of CUSTOM_DOMAIN_LIMIT_KEYS) {
    const value = input.limits?.[key];
    if (typeof value === "number" && Number.isSafeInteger(value) &&
      value >= -1 && value <= 10_000) {
      return value;
    }
  }
  const name = input.planName?.trim().toLowerCase() ?? "";
  if (name.includes("enterprise")) return -1;
  if (/(^|[^a-z])pro([^a-z]|$)/.test(name)) return 1;
  return 0;
}

export async function getTenantCustomDomainLimit(
  client: DbClient,
  tenantId: string,
): Promise<number> {
  const { data, error } = await client.rpc("tenant_custom_domain_limit", {
    p_tenant_id: tenantId,
  });
  if (error || !Number.isSafeInteger(data)) {
    throw new Error(`Unable to load custom-domain allowance: ${error?.message ?? "invalid response"}`);
  }
  return data;
}

export async function reserveTenantDomain(
  client: DbClient,
  input: {
    tenantId: string;
    domain: string;
    vercelConfig: Record<string, unknown>;
    verified: boolean;
    verificationStatus: "pending" | "verified";
    verificationCheckedAt: string | null;
  },
): Promise<DomainReservation> {
  const { data, error } = await client.rpc("create_tenant_domain_with_limit", {
    p_tenant_id: input.tenantId,
    p_domain: input.domain,
    p_vercel_config: input.vercelConfig,
    p_verified: input.verified,
    p_verification_status: input.verificationStatus,
    p_verification_checked_at: input.verificationCheckedAt,
  });
  if (error) throw new Error(`Unable to reserve custom domain: ${error.message}`);
  const row = data?.[0];
  if (!row || !isOutcome(row.outcome) || !Number.isSafeInteger(row.domain_limit) ||
    !Number.isSafeInteger(row.domain_count)) {
    throw new Error("Unable to reserve custom domain: invalid database response");
  }
  return {
    outcome: row.outcome,
    domainId: row.domain_id,
    limit: row.domain_limit,
    count: row.domain_count,
  };
}

function isOutcome(value: string): value is DomainReservation["outcome"] {
  return value === "created" || value === "limit_exceeded" || value === "domain_conflict";
}
