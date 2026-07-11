import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUOTA_PLAN_CACHE_TTL_MS,
  checkQuota,
  clearQuotaPlanCache,
  isQuotaWarning,
  quotaExceededPayload,
  quotaResponseHeaders,
  quotaWarningHeader,
  resolveQuotaLimit,
} from "./quota";

type SubscriptionFixture = {
  plan_id: string;
  current_period_start: string | null;
  current_period_end: string | null;
};

type RpcResult = { data: unknown; error: unknown };

type ClientFixture = {
  subscription?: SubscriptionFixture | null;
  subscriptionError?: unknown;
  planLimits?: Record<string, unknown>;
  planError?: unknown;
  rpc?: (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
};

beforeEach(() => {
  clearQuotaPlanCache();
});

describe("quota limit policy", () => {
  it("resolves request aliases without treating inventory or outcomes as traffic", () => {
    expect(resolveQuotaLimit({ monthly_chat_requests: 100 }, "chat_requests")).toBe(100);
    expect(resolveQuotaLimit({ vehicle_requests_per_month: 200 }, "vehicle_requests")).toBe(200);
    expect(resolveQuotaLimit({ monthly_lead_requests: 30 }, "lead_requests")).toBe(30);
    expect(resolveQuotaLimit({ vehicles: 5 }, "vehicle_requests")).toBeNull();
    expect(resolveQuotaLimit({ leads: 5, monthly_leads: 30 }, "lead_requests")).toBeNull();
  });

  it("uses the first valid numeric alias and rejects unsafe or ambiguous values", () => {
    expect(resolveQuotaLimit({ chat_requests: "10", monthly_chat_requests: 20 }, "chat_requests"))
      .toBe(20);
    expect(resolveQuotaLimit({ chat_requests: 1.5 }, "chat_requests")).toBeNull();
    expect(resolveQuotaLimit({ chat_requests: Number.MAX_SAFE_INTEGER + 1 }, "chat_requests"))
      .toBeNull();
    expect(resolveQuotaLimit({ lead_requests: 0 }, "lead_requests")).toBe(0);
    expect(resolveQuotaLimit({ lead_requests: -1 }, "lead_requests")).toBe(-1);
  });

  it("warns inclusively at the final 20 percent without floating-point multiplication", () => {
    expect(isQuotaWarning(79, 100)).toBe(false);
    expect(isQuotaWarning(80, 100)).toBe(true);
    expect(isQuotaWarning(100, 100)).toBe(true);
    expect(isQuotaWarning(1, 1)).toBe(true);
    expect(isQuotaWarning(0, 0)).toBe(false);
  });

  it("builds deterministic warning headers and the exact quota error payload", () => {
    const decision = {
      allowed: true,
      reason: "within_limit" as const,
      warning: true,
      limitType: "chat_requests" as const,
      used: 8,
      limit: 10,
      resetsAt: "2026-08-01T00:00:00.000Z",
    };
    expect(quotaWarningHeader(decision)).toBe(
      "chat_requests; remaining=2; limit=10; resets_at=2026-08-01T00:00:00.000Z",
    );
    expect(quotaResponseHeaders(decision)).toEqual({
      "X-Lume-Quota-Warning": expect.stringContaining("remaining=2"),
    });
    expect(quotaExceededPayload({ ...decision, allowed: false, warning: false })).toEqual({
      error: "quota_exceeded",
      limit_type: "chat_requests",
      resets_at: "2026-08-01T00:00:00.000Z",
    });
    expect(quotaWarningHeader({ ...decision, warning: false })).toBeNull();
  });
});

describe("checkQuota", () => {
  it("reserves configured usage atomically and warns on the request reaching 80 percent", async () => {
    const { client, rpc } = mockClient({
      subscription: subscription({
        current_period_start: "2026-07-01T23:00:00-02:00",
        current_period_end: "2026-08-01T00:00:00Z",
      }),
      planLimits: { chat_requests: 10 },
      rpc: async () => ({
        data: [{ allowed: true, usage_count: 8, period_start: "2026-07-02" }],
        error: null,
      }),
    });

    await expect(checkQuota(client, {
      tenantId: " tenant-1 ",
      eventType: "chat_requests",
      now: new Date("2026-07-11T12:00:00Z"),
    })).resolves.toEqual({
      allowed: true,
      reason: "within_limit",
      warning: true,
      limitType: "chat_requests",
      used: 8,
      limit: 10,
      resetsAt: "2026-08-01T00:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledWith("consume_usage_event", {
      p_tenant_id: "tenant-1",
      p_event_type: "chat_requests",
      p_limit: 10,
      p_period_start: "2026-07-02",
    });
  });

  it("fails open instead of permanently blocking an open-ended finite period", async () => {
    const { client, rpc } = mockClient({
      subscription: subscription({ current_period_end: null }),
      planLimits: { lead_requests: 0 },
      rpc: async () => ({
        data: [{ allowed: true, usage_count: "1", period_start: "2026-07-01" }],
        error: null,
      }),
    });
    const decision = await checkQuota(client, {
      tenantId: "tenant-1",
      eventType: "lead_requests",
      now: new Date("2026-07-11T12:00:00Z"),
    });
    expect(decision).toMatchObject({
      allowed: true,
      reason: "fail_open",
      limit: 0,
      resetsAt: null,
    });
    expect(rpc).toHaveBeenCalledWith("consume_usage_event", expect.objectContaining({
      p_limit: null,
    }));
  });

  it("blocks limit zero when the finite subscription period is complete", async () => {
    const { client } = mockClient({
      subscription: subscription(),
      planLimits: { lead_requests: 0 },
      rpc: async () => ({
        data: [{ allowed: false, usage_count: 0, period_start: "2026-07-01" }],
        error: null,
      }),
    });
    await expect(checkQuota(client, {
      tenantId: "tenant-1",
      eventType: "lead_requests",
      now: new Date("2026-07-11T12:00:00Z"),
    })).resolves.toMatchObject({
      allowed: false,
      reason: "quota_exceeded",
      used: 0,
      limit: 0,
      resetsAt: "2026-08-01T00:00:00.000Z",
    });
  });

  it("uses the next UTC month only when the database also uses its calendar fallback", async () => {
    const { client } = mockClient({
      subscription: subscription({ current_period_start: null, current_period_end: null }),
      planLimits: { vehicle_requests: 2 },
    });
    const decision = await checkQuota(client, {
      tenantId: "tenant-1",
      eventType: "vehicle_requests",
      now: new Date("2026-12-31T23:30:00Z"),
    });
    expect(decision.resetsAt).toBe("2027-01-01T00:00:00.000Z");
  });

  it("meters unlimited and unconfigured plans without ever blocking", async () => {
    const unlimited = mockClient({
      subscription: subscription(),
      planLimits: { chat_requests: -1 },
    });
    await expect(checkQuota(unlimited.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
    })).resolves.toMatchObject({ allowed: true, reason: "unlimited", limit: -1 });
    expect(unlimited.rpc).toHaveBeenCalledWith("consume_usage_event", expect.objectContaining({
      p_limit: -1,
    }));

    clearQuotaPlanCache();
    const unconfigured = mockClient({ subscription: null });
    await expect(checkQuota(unconfigured.client, {
      tenantId: "tenant-2",
      eventType: "vehicle_requests",
    })).resolves.toMatchObject({ allowed: true, reason: "unconfigured", limit: null });
    expect(unconfigured.rpc).toHaveBeenCalledWith("consume_usage_event", expect.objectContaining({
      p_limit: null,
      p_period_start: null,
    }));
  });

  it("fails open on configuration and ambiguous reservation failures", async () => {
    const queryFailure = mockClient({
      subscriptionError: { message: "billing unavailable" },
    });
    await expect(checkQuota(queryFailure.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
    })).resolves.toMatchObject({ allowed: true, reason: "fail_open" });

    const reservationFailure = mockClient({
      subscription: subscription(),
      planLimits: { chat_requests: 1 },
      rpc: async () => ({ data: null, error: { code: "57014", message: "timeout" } }),
    });
    await expect(checkQuota(reservationFailure.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
    })).resolves.toMatchObject({ allowed: true, reason: "fail_open", limit: 1 });
    expect(reservationFailure.rpc).toHaveBeenCalledTimes(1);

    clearQuotaPlanCache();
    const malformedReservation = mockClient({
      subscription: subscription(),
      planLimits: { chat_requests: 1 },
      rpc: async () => ({ data: [], error: null }),
    });
    await expect(checkQuota(malformedReservation.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
    })).resolves.toMatchObject({ allowed: true, reason: "fail_open", limit: 1 });
    expect(malformedReservation.rpc).toHaveBeenCalledTimes(1);
  });

  it("falls back to legacy metering only when the new function is definitely missing", async () => {
    const { client, rpc } = mockClient({
      subscription: subscription(),
      planLimits: { chat_requests: 5 },
      rpc: async (name) => name === "consume_usage_event"
        ? { data: null, error: { code: "PGRST202", message: "function not found" } }
        : { data: 1, error: null },
    });
    await expect(checkQuota(client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
    })).resolves.toMatchObject({ allowed: true, reason: "fail_open" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "consume_usage_event", {
      p_tenant_id: "tenant-1",
      p_event_type: "chat_requests",
      p_limit: 5,
      p_period_start: "2026-07-01",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "increment_usage_event", {
      p_tenant_id: "tenant-1",
      p_event_type: "chat_requests",
      p_period_start: null,
      p_increment: 1,
    });
  });

  it("caches only plan limits for exactly five minutes", async () => {
    const fixture = mockClient({
      subscription: subscription(),
      planLimits: { chat_requests: 100 },
    });
    const first = new Date("2026-07-11T12:00:00.000Z");
    await checkQuota(fixture.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
      now: first,
    });
    await checkQuota(fixture.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
      now: new Date(first.getTime() + QUOTA_PLAN_CACHE_TTL_MS - 1),
    });
    expect(fixture.planReads).toHaveBeenCalledTimes(1);
    expect(fixture.subscriptionReads).toHaveBeenCalledTimes(2);
    expect(fixture.rpc).toHaveBeenCalledTimes(2);

    await checkQuota(fixture.client, {
      tenantId: "tenant-1",
      eventType: "chat_requests",
      now: new Date(first.getTime() + QUOTA_PLAN_CACHE_TTL_MS),
    });
    expect(fixture.planReads).toHaveBeenCalledTimes(2);
  });

  it("does not cache plan-load errors", async () => {
    const fixture = mockClient({
      subscription: subscription(),
      planError: { message: "temporarily unavailable" },
    });
    await checkQuota(fixture.client, { tenantId: "tenant-1", eventType: "chat_requests" });
    await checkQuota(fixture.client, { tenantId: "tenant-1", eventType: "chat_requests" });
    expect(fixture.planReads).toHaveBeenCalledTimes(2);
  });
});

function subscription(
  overrides: Partial<SubscriptionFixture> = {},
): SubscriptionFixture {
  return {
    plan_id: "plan-1",
    current_period_start: "2026-07-01T00:00:00Z",
    current_period_end: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function mockClient(fixture: ClientFixture) {
  const subscriptionReads = vi.fn(async () => ({
    data: fixture.subscription === undefined ? subscription() : fixture.subscription,
    error: fixture.subscriptionError ?? null,
  }));
  const planReads = vi.fn(async () => ({
    data: fixture.planError ? null : { limits: fixture.planLimits ?? {} },
    error: fixture.planError ?? null,
  }));

  const from = vi.fn((table: string) => {
    if (table === "subscriptions") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        limit: () => builder,
        maybeSingle: subscriptionReads,
      };
      return builder;
    }
    if (table === "plans") {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: planReads,
      };
      return builder;
    }
    throw new Error(`Unexpected table ${table}`);
  });

  let usage = 0;
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    if (fixture.rpc) return fixture.rpc(name, args);
    usage += 1;
    return {
      data: [{ allowed: true, usage_count: usage, period_start: "2026-07-01" }],
      error: null,
    };
  });

  return {
    client: { from, rpc } as never,
    planReads,
    subscriptionReads,
    rpc,
  };
}
