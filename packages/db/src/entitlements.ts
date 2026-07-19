/**
 * Resolves a tenant's plan from billing data (subscriptions → plans,
 * migration 030) into the typed catalog entitlements (packages/types/plans).
 *
 * Unlike quota — which fails open so billing hiccups can't take down a
 * healthy site — plan resolution fails CLOSED to DEFAULT_PLAN_ID (Basic):
 * paid capabilities such as action-capable chat must never be granted
 * because billing storage errored or a subscription is missing.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PLAN_ID,
  planEntitlements,
  resolvePlanId,
  type PlanEntitlements,
  type PlanId,
} from "@lume/types";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export type TenantPlanSource =
  /** A valid operational subscription named a catalog plan. */
  | "subscription"
  /** No usable subscription/plan row, an unknown plan name, or a read error. */
  | "default";

export type TenantPlanResolution = {
  planId: PlanId;
  entitlements: PlanEntitlements;
  source: TenantPlanSource;
};

/** Mirrors quota.ts: subscriptions in these states count as operational. */
const OPERATIONAL_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
] as const;

export const TENANT_PLAN_CACHE_TTL_MS = 5 * 60 * 1_000;

type CacheEntry = {
  expiresAt: number;
  resolution: TenantPlanResolution;
};

const planCache = new Map<string, CacheEntry>();
const inFlightResolutions = new Map<string, Promise<TenantPlanResolution>>();

export async function resolveTenantPlan(
  client: DbClient,
  tenantId: string,
  nowMs: number = Date.now(),
): Promise<TenantPlanResolution> {
  const key = tenantId.trim();
  if (!key) return defaultResolution();

  const cached = planCache.get(key);
  if (cached && nowMs < cached.expiresAt) return cached.resolution;

  const existing = inFlightResolutions.get(key);
  if (existing) return existing;

  // Only successful reads are cached — a transient error must not pin a
  // tenant to the default plan for the whole TTL (mirrors quota.ts).
  const loading = loadTenantPlan(client, key).then(({ readOk, ...resolution }) => {
    if (readOk) {
      planCache.set(key, {
        expiresAt: nowMs + TENANT_PLAN_CACHE_TTL_MS,
        resolution,
      });
    }
    return resolution;
  });
  inFlightResolutions.set(key, loading);
  try {
    return await loading;
  } finally {
    if (inFlightResolutions.get(key) === loading) inFlightResolutions.delete(key);
  }
}

/** Clears only process-local plan resolution state; intended for deterministic tests. */
export function clearTenantPlanCache(): void {
  planCache.clear();
  inFlightResolutions.clear();
}

type InternalResolution = TenantPlanResolution & { readOk: boolean };

async function loadTenantPlan(
  client: DbClient,
  tenantId: string,
): Promise<InternalResolution> {
  let planId: string | null = null;
  try {
    const { data, error } = await client
      .from("subscriptions")
      .select("plan_id")
      .eq("tenant_id", tenantId)
      .in("status", OPERATIONAL_SUBSCRIPTION_STATUSES)
      .limit(1)
      .maybeSingle();
    if (error) return { ...defaultResolution(), readOk: false };
    planId = data?.plan_id ?? null;
  } catch {
    return { ...defaultResolution(), readOk: false };
  }
  if (!planId) return { ...defaultResolution(), readOk: true };

  let planName: string | null = null;
  try {
    const { data, error } = await client
      .from("plans")
      .select("name")
      .eq("id", planId)
      .maybeSingle();
    if (error) return { ...defaultResolution(), readOk: false };
    planName = typeof data?.name === "string" ? data.name : null;
  } catch {
    return { ...defaultResolution(), readOk: false };
  }

  const resolved = resolvePlanId(planName);
  if (!resolved) return { ...defaultResolution(), readOk: true };
  return {
    planId: resolved,
    entitlements: planEntitlements(resolved),
    source: "subscription",
    readOk: true,
  };
}

function defaultResolution(): TenantPlanResolution {
  return {
    planId: DEFAULT_PLAN_ID,
    entitlements: planEntitlements(DEFAULT_PLAN_ID),
    source: "default",
  };
}
