import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTenantPlanCache,
  resolveTenantPlan,
} from "./entitlements";

type SubscriptionFixture = { plan_id: string };

type ClientFixture = {
  subscription?: SubscriptionFixture | null;
  subscriptionError?: unknown;
  planName?: string | null;
  planError?: unknown;
};

beforeEach(() => {
  clearTenantPlanCache();
});

describe("resolveTenantPlan", () => {
  it("resolves an operational subscription to its catalog plan and entitlements", async () => {
    const fixture = mockClient({ subscription: { plan_id: "plan-1" }, planName: "pro" });

    await expect(resolveTenantPlan(fixture.client, "tenant-1")).resolves.toEqual({
      planId: "pro",
      entitlements: { "chat.actions": true },
      source: "subscription",
    });
    expect(fixture.subscriptionReads).toHaveBeenCalledTimes(1);
    expect(fixture.planReads).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["basic", false],
    ["ultra", true],
  ] as const)("resolves plan name %s with chat.actions=%s", async (name, actions) => {
    const fixture = mockClient({ subscription: { plan_id: "plan-1" }, planName: name });
    const resolution = await resolveTenantPlan(fixture.client, "tenant-1");
    expect(resolution.planId).toBe(name);
    expect(resolution.entitlements["chat.actions"]).toBe(actions);
    expect(resolution.source).toBe("subscription");
  });

  it("tolerates plan-name casing differences from the database", async () => {
    const fixture = mockClient({ subscription: { plan_id: "plan-1" }, planName: " Pro " });
    await expect(resolveTenantPlan(fixture.client, "tenant-1"))
      .resolves.toMatchObject({ planId: "pro", source: "subscription" });
  });

  it("defaults to Basic when the tenant has no operational subscription", async () => {
    const fixture = mockClient({ subscription: null });

    await expect(resolveTenantPlan(fixture.client, "tenant-1")).resolves.toEqual({
      planId: "basic",
      entitlements: { "chat.actions": false },
      source: "default",
    });
    expect(fixture.planReads).not.toHaveBeenCalled();
  });

  it("defaults to Basic for an unknown plan name instead of guessing", async () => {
    const fixture = mockClient({ subscription: { plan_id: "plan-1" }, planName: "enterprise" });
    const resolution = await resolveTenantPlan(fixture.client, "tenant-1");
    expect(resolution).toEqual({
      planId: "basic",
      entitlements: { "chat.actions": false },
      source: "default",
    });
  });

  it("defaults to Basic when the plan row is missing", async () => {
    const fixture = mockClient({ subscription: { plan_id: "plan-1" }, planName: null });
    await expect(resolveTenantPlan(fixture.client, "tenant-1"))
      .resolves.toMatchObject({ planId: "basic", source: "default" });
  });

  it("fails closed to Basic on read errors — never granting paid tools by accident", async () => {
    const fixture = mockClient({
      subscription: { plan_id: "plan-1" },
      planError: { message: "temporarily unavailable" },
    });
    await expect(resolveTenantPlan(fixture.client, "tenant-1"))
      .resolves.toMatchObject({ planId: "basic", source: "default" });

    const subscriptionFixture = mockClient({
      subscriptionError: { message: "connection reset" },
    });
    await expect(resolveTenantPlan(subscriptionFixture.client, "tenant-1"))
      .resolves.toMatchObject({ planId: "basic", source: "default" });
  });

  it("does not cache transient read errors", async () => {
    const fixture = mockClient({
      subscription: { plan_id: "plan-1" },
      planError: { message: "temporarily unavailable" },
    });
    await resolveTenantPlan(fixture.client, "tenant-1");
    await resolveTenantPlan(fixture.client, "tenant-1");
    expect(fixture.planReads).toHaveBeenCalledTimes(2);
  });

  it("caches successful resolutions per tenant", async () => {
    const fixture = mockClient({ subscription: { plan_id: "plan-1" }, planName: "pro" });
    await resolveTenantPlan(fixture.client, "tenant-1");
    await resolveTenantPlan(fixture.client, "tenant-1");
    await resolveTenantPlan(fixture.client, "tenant-2");
    // Repeat for tenant-1 is served from cache; tenant-2 is a fresh read.
    expect(fixture.subscriptionReads).toHaveBeenCalledTimes(2);
    expect(fixture.planReads).toHaveBeenCalledTimes(2);
  });

  it("defaults to Basic for a blank tenant id without touching the database", async () => {
    const fixture = mockClient({});
    await expect(resolveTenantPlan(fixture.client, "   "))
      .resolves.toMatchObject({ planId: "basic", source: "default" });
    expect(fixture.subscriptionReads).not.toHaveBeenCalled();
  });
});

function mockClient(fixture: ClientFixture) {
  const subscriptionReads = vi.fn(async () => ({
    data: fixture.subscription === undefined ? { plan_id: "plan-1" } : fixture.subscription,
    error: fixture.subscriptionError ?? null,
  }));
  const planReads = vi.fn(async () => ({
    data: fixture.planError || fixture.planName === null
      ? null
      : { name: fixture.planName ?? "pro" },
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

  return {
    client: { from } as never,
    planReads,
    subscriptionReads,
  };
}
