import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";
import { recordUsageEvent, type UsageEventType } from "./usage";

type DbClient = SupabaseClient<Database, "public">;

export type QuotaEventType = Exclude<UsageEventType, "bot_action_requests">;
export type QuotaDecisionReason =
  | "within_limit"
  | "quota_exceeded"
  | "unlimited"
  | "unconfigured"
  | "fail_open";

export type QuotaDecision = {
  allowed: boolean;
  reason: QuotaDecisionReason;
  warning: boolean;
  limitType: QuotaEventType;
  used: number | null;
  limit: number | null;
  resetsAt: string | null;
};

export type CheckQuotaInput = {
  tenantId: string;
  eventType: QuotaEventType;
  now?: Date;
};

type OperationalSubscription = {
  planId: string;
  periodStart: string | null;
  periodEnd: string | null;
};

type QuotaConfiguration = {
  state: "configured" | "unlimited" | "unconfigured" | "fail_open";
  limit: number | null;
  periodStart: string | null;
  resetsAt: string | null;
};

type UsageReservation = {
  allowed: boolean;
  used: number;
};

type PlanCacheEntry = {
  expiresAt: number;
  limits: Record<string, unknown>;
};

export const QUOTA_PLAN_CACHE_TTL_MS = 5 * 60 * 1_000;

export const QUOTA_LIMIT_KEYS: Record<QuotaEventType, readonly string[]> = {
  chat_requests: [
    "chat_requests",
    "monthly_chat_requests",
    "chat_requests_per_month",
  ],
  vehicle_requests: [
    "vehicle_requests",
    "monthly_vehicle_requests",
    "vehicle_requests_per_month",
  ],
  lead_requests: [
    "lead_requests",
    "monthly_lead_requests",
    "lead_requests_per_month",
  ],
};

const planLimitCache = new Map<string, PlanCacheEntry>();
const inFlightPlanLimits = new Map<string, Promise<Record<string, unknown>>>();

/**
 * Atomically reserves one public API request and returns the plan decision.
 * Configuration and metering failures are deliberately fail-open so billing
 * infrastructure cannot take down an otherwise healthy tenant site.
 */
export async function checkQuota(
  client: DbClient,
  input: CheckQuotaInput,
): Promise<QuotaDecision> {
  const tenantId = input.tenantId.trim();
  const now = input.now ?? new Date();
  if (!tenantId || Number.isNaN(now.getTime())) {
    return failOpenQuotaDecision(input.eventType);
  }

  const configuration = await loadQuotaConfiguration(client, tenantId, input.eventType, now);
  const reservation = await reserveUsage(client, {
    tenantId,
    eventType: input.eventType,
    limit: configuration.state === "configured" || configuration.state === "unlimited"
      ? configuration.limit
      : null,
    periodStart: configuration.periodStart,
  });

  if (!reservation) {
    return {
      ...failOpenQuotaDecision(input.eventType),
      limit: configuration.limit,
      resetsAt: configuration.resetsAt,
    };
  }

  if (configuration.state === "configured" && configuration.limit !== null) {
    if (!reservation.allowed) {
      return {
        allowed: false,
        reason: "quota_exceeded",
        warning: false,
        limitType: input.eventType,
        used: reservation.used,
        limit: configuration.limit,
        resetsAt: configuration.resetsAt,
      };
    }
    return {
      allowed: true,
      reason: "within_limit",
      warning: isQuotaWarning(reservation.used, configuration.limit),
      limitType: input.eventType,
      used: reservation.used,
      limit: configuration.limit,
      resetsAt: configuration.resetsAt,
    };
  }

  // Null and negative limits never deny in the RPC. Treat an unexpected denial
  // as unavailable enforcement instead of blocking a tenant incorrectly.
  if (!reservation.allowed) {
    return {
      ...failOpenQuotaDecision(input.eventType),
      used: reservation.used,
      limit: configuration.limit,
      resetsAt: configuration.resetsAt,
    };
  }

  return {
    allowed: true,
    reason: configuration.state === "unlimited"
      ? "unlimited"
      : configuration.state === "unconfigured"
        ? "unconfigured"
        : "fail_open",
    warning: false,
    limitType: input.eventType,
    used: reservation.used,
    limit: configuration.limit,
    resetsAt: configuration.resetsAt,
  };
}

export function resolveQuotaLimit(
  limits: Record<string, unknown>,
  eventType: QuotaEventType,
): number | null {
  for (const key of QUOTA_LIMIT_KEYS[eventType]) {
    const value = limits[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  }
  return null;
}

/** The accepted request that reaches 80% is warned; the request after N blocks. */
export function isQuotaWarning(used: number, limit: number): boolean {
  if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(limit) || limit <= 0) {
    return false;
  }
  const warningThreshold = limit - Math.floor(limit / 5);
  return used >= warningThreshold;
}

export function quotaWarningHeader(decision: QuotaDecision): string | null {
  if (!decision.allowed || !decision.warning || decision.used === null || decision.limit === null) {
    return null;
  }
  const remaining = Math.max(0, decision.limit - decision.used);
  const reset = decision.resetsAt ? `; resets_at=${decision.resetsAt}` : "";
  return `${decision.limitType}; remaining=${remaining}; limit=${decision.limit}${reset}`;
}

export function quotaResponseHeaders(decision: QuotaDecision): Record<string, string> {
  const warning = quotaWarningHeader(decision);
  return warning ? { "X-Lume-Quota-Warning": warning } : {};
}

export function quotaExceededPayload(decision: QuotaDecision): {
  error: "quota_exceeded";
  limit_type: QuotaEventType;
  resets_at: string | null;
} {
  return {
    error: "quota_exceeded",
    limit_type: decision.limitType,
    resets_at: decision.resetsAt,
  };
}

export function failOpenQuotaDecision(eventType: QuotaEventType): QuotaDecision {
  return {
    allowed: true,
    reason: "fail_open",
    warning: false,
    limitType: eventType,
    used: null,
    limit: null,
    resetsAt: null,
  };
}

/** Clears only process-local plan configuration; intended for deterministic tests. */
export function clearQuotaPlanCache(): void {
  planLimitCache.clear();
  inFlightPlanLimits.clear();
}

async function loadQuotaConfiguration(
  client: DbClient,
  tenantId: string,
  eventType: QuotaEventType,
  now: Date,
): Promise<QuotaConfiguration> {
  let subscription: OperationalSubscription | null;
  try {
    subscription = await loadOperationalSubscription(client, tenantId);
  } catch {
    return { state: "fail_open", limit: null, periodStart: null, resetsAt: null };
  }
  if (!subscription) {
    return { state: "unconfigured", limit: null, periodStart: null, resetsAt: null };
  }

  const periodStart = normalizePeriodStart(subscription.periodStart);
  const resetsAt = quotaResetAt(subscription.periodStart, subscription.periodEnd, now);
  let limits: Record<string, unknown>;
  try {
    limits = await loadPlanLimitsCached(client, subscription.planId, now.getTime());
  } catch {
    return { state: "fail_open", limit: null, periodStart, resetsAt };
  }

  const limit = resolveQuotaLimit(limits, eventType);
  if (limit === null) {
    return { state: "unconfigured", limit: null, periodStart, resetsAt: null };
  }
  if (limit < 0) {
    return { state: "unlimited", limit, periodStart, resetsAt: null };
  }
  if (hasUnsafeFiniteQuotaPeriod(subscription.periodStart, subscription.periodEnd, now)) {
    // Never create a permanent lockout from partially provisioned billing
    // metadata. The request remains metered but enforcement waits for a real
    // future period end.
    return { state: "fail_open", limit, periodStart, resetsAt: null };
  }
  return { state: "configured", limit, periodStart, resetsAt };
}

async function loadOperationalSubscription(
  client: DbClient,
  tenantId: string,
): Promise<OperationalSubscription | null> {
  const { data, error } = await client
    .from("subscriptions")
    .select("plan_id, current_period_start, current_period_end")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trialing", "past_due", "incomplete"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    planId: data.plan_id,
    periodStart: data.current_period_start,
    periodEnd: data.current_period_end,
  };
}

async function loadPlanLimitsCached(
  client: DbClient,
  planId: string,
  nowMs: number,
): Promise<Record<string, unknown>> {
  const cached = planLimitCache.get(planId);
  if (cached && nowMs < cached.expiresAt) return cached.limits;

  const existing = inFlightPlanLimits.get(planId);
  if (existing) return existing;

  const loading = loadPlanLimits(client, planId);
  inFlightPlanLimits.set(planId, loading);
  try {
    const limits = await loading;
    planLimitCache.set(planId, {
      expiresAt: nowMs + QUOTA_PLAN_CACHE_TTL_MS,
      limits,
    });
    return limits;
  } finally {
    if (inFlightPlanLimits.get(planId) === loading) inFlightPlanLimits.delete(planId);
  }
}

async function loadPlanLimits(
  client: DbClient,
  planId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await client
    .from("plans")
    .select("limits")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Subscription plan is unavailable");
  return isRecord(data.limits) ? { ...data.limits } : {};
}

async function reserveUsage(
  client: DbClient,
  input: {
    tenantId: string;
    eventType: QuotaEventType;
    limit: number | null;
    periodStart: string | null;
  },
): Promise<UsageReservation | null> {
  try {
    const { data, error } = await client.rpc("consume_usage_event", {
      p_tenant_id: input.tenantId,
      p_event_type: input.eventType,
      p_limit: input.limit,
      p_period_start: input.periodStart,
    });
    if (error) {
      if (isMissingQuotaFunctionError(error)) {
        await recordUsageEvent(client, {
          tenantId: input.tenantId,
          eventType: input.eventType,
        });
      }
      return null;
    }
    return normalizeReservation(data);
  } catch {
    // A transport error may occur after the transaction commits. Never retry
    // an ambiguous reservation because that could count the request twice.
    return null;
  }
}

function normalizeReservation(value: unknown): UsageReservation | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const allowed = value[0].allowed;
  const used = nonnegativeSafeInteger(value[0].usage_count);
  return typeof allowed === "boolean" && used !== null ? { allowed, used } : null;
}

function nonnegativeSafeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function normalizePeriodStart(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function quotaResetAt(
  periodStart: string | null,
  periodEnd: string | null,
  now: Date,
): string | null {
  if (periodEnd) {
    const parsedEnd = new Date(periodEnd);
    if (!Number.isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > now.getTime()) {
      return parsedEnd.toISOString();
    }
  }
  // The database uses a calendar-month bucket only when no valid subscription
  // period start exists. A manual subscription with a start but no end has no
  // truthful reset time until billing provisioning supplies one.
  if (normalizePeriodStart(periodStart)) return null;
  return nextUtcMonth(now).toISOString();
}

function hasUnsafeFiniteQuotaPeriod(
  periodStart: string | null,
  periodEnd: string | null,
  now: Date,
): boolean {
  if (!normalizePeriodStart(periodStart)) return false;
  if (!periodEnd) return true;
  const parsedEnd = new Date(periodEnd);
  return Number.isNaN(parsedEnd.getTime()) || parsedEnd.getTime() <= now.getTime();
}

function nextUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

function isMissingQuotaFunctionError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return message.includes("consume_usage_event") &&
    (message.includes("not find") || message.includes("does not exist"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
