import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAN_ID,
  PLAN_CATALOG,
  PLAN_FEATURES,
  PLAN_IDS,
  listPlans,
  planCatalogEntry,
  planEntitlements,
  planHasFeature,
  resolvePlanId,
} from "./plans";

describe("plan catalog", () => {
  it("defines exactly the Basic/Pro/Ultra tiers in display order", () => {
    expect(PLAN_IDS).toEqual(["basic", "pro", "ultra"]);
    expect(listPlans().map((plan) => plan.id)).toEqual(["basic", "pro", "ultra"]);
    expect(PLAN_CATALOG).toHaveLength(3);
  });

  it("marks Pro as the single highlighted tier with a badge", () => {
    const highlighted = PLAN_CATALOG.filter((plan) => plan.highlighted);
    expect(highlighted.map((plan) => plan.id)).toEqual(["pro"]);
    expect(highlighted[0]?.badge).toBeTruthy();
    expect(PLAN_CATALOG.filter((plan) => !plan.highlighted).every((plan) => plan.badge === null))
      .toBe(true);
  });

  it("declares every canonical feature on every tier", () => {
    for (const plan of PLAN_CATALOG) {
      for (const feature of PLAN_FEATURES) {
        expect(typeof plan.entitlements[feature]).toBe("boolean");
      }
    }
  });

  it("gates chat.actions: Basic off, Pro and Ultra on", () => {
    expect(planHasFeature("basic", "chat.actions")).toBe(false);
    expect(planHasFeature("pro", "chat.actions")).toBe(true);
    expect(planHasFeature("ultra", "chat.actions")).toBe(true);
  });

  it("defaults to Basic so paid capabilities are never granted by default", () => {
    expect(DEFAULT_PLAN_ID).toBe("basic");
    expect(planHasFeature(DEFAULT_PLAN_ID, "chat.actions")).toBe(false);
  });

  it("keeps pricing placeholder-only until billing launches", () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan.price).not.toMatch(/\d/);
      expect(plan.ctaHref).toMatch(/^\//);
    }
  });

  it("returns defensive entitlement copies that cannot mutate the catalog", () => {
    const entitlements = planEntitlements("pro");
    entitlements["chat.actions"] = false;
    expect(planHasFeature("pro", "chat.actions")).toBe(true);
  });

  it("resolves catalog entries by id", () => {
    expect(planCatalogEntry("ultra").name).toBe("Ultra");
  });
});

describe("resolvePlanId", () => {
  it("matches catalog ids case-insensitively and trims whitespace", () => {
    expect(resolvePlanId("basic")).toBe("basic");
    expect(resolvePlanId(" Pro ")).toBe("pro");
    expect(resolvePlanId("ULTRA")).toBe("ultra");
  });

  it("returns null for unknown or missing names so callers fall back safely", () => {
    expect(resolvePlanId("enterprise")).toBeNull();
    expect(resolvePlanId("pro-plan")).toBeNull();
    expect(resolvePlanId("")).toBeNull();
    expect(resolvePlanId("   ")).toBeNull();
    expect(resolvePlanId(null)).toBeNull();
    expect(resolvePlanId(undefined)).toBeNull();
  });
});
