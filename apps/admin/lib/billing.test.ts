import { describe, expect, it } from "vitest";
import {
  buildBillingUsageMeter,
  canManageBilling,
  findPlanAllowance,
  formatBillingAmount,
  isBillingPlanId,
  isManualPlanChangeAllowed,
  invoicePageCount,
  normalizeInvoicePage,
  planLimitEntries,
  selectPrimarySubscription,
  type BillingSubscriptionSummary,
} from "./billing";

const subscription = (
  overrides: Partial<BillingSubscriptionSummary> = {},
): BillingSubscriptionSummary => ({
  id: "subscription-1",
  status: "inactive",
  planId: "plan-1",
  currentPeriodEnd: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("billing presentation", () => {
  it("selects active status before newer inactive history", () => {
    expect(selectPrimarySubscription([
      subscription({ id: "inactive", createdAt: "2026-07-01T00:00:00.000Z" }),
      subscription({ id: "active", status: "active", createdAt: "2026-01-01T00:00:00.000Z" }),
    ])?.id).toBe("active");
    expect(selectPrimarySubscription([])).toBeNull();
  });

  it("breaks same-status ties by period end then creation time", () => {
    expect(selectPrimarySubscription([
      subscription({ id: "older", status: "canceled", currentPeriodEnd: "2026-02-01T00:00:00Z" }),
      subscription({ id: "later", status: "canceled", currentPeriodEnd: "2026-03-01T00:00:00Z" }),
    ])?.id).toBe("later");
  });

  it("formats valid monetary values and rejects invalid cents", () => {
    expect(formatBillingAmount(0)).toBe("$0");
    expect(formatBillingAmount(1299)).toBe("$12.99");
    expect(formatBillingAmount(-1)).toBe("—");
    expect(formatBillingAmount(Number.NaN)).toBe("—");
  });

  it("renders sorted scalar plan limits and hides nested metadata", () => {
    expect(planLimitEntries({
      storage_bytes: -1,
      vehicles: 250,
      custom_domain: true,
      internal: { provider: "stripe" },
      blank: "   ",
    })).toEqual([
      { key: "custom_domain", label: "Custom domain", value: "Included" },
      { key: "storage_bytes", label: "Storage bytes", value: "Unlimited" },
      { key: "vehicles", label: "Vehicles", value: "250" },
    ]);
  });

  it("resolves known allowance aliases without interpreting provider metadata", () => {
    const limits = { monthly_leads: 50, chat_requests: "1000" };
    expect(findPlanAllowance(limits, ["leads", "monthly_leads"])).toBe(50);
    expect(findPlanAllowance(limits, ["chat_requests"])).toBeNull();
  });

  it("builds clamped, unlimited, and unavailable usage meters", () => {
    expect(buildBillingUsageMeter(25, 100)).toMatchObject({
      state: "tracked",
      percentage: 25,
    });
    expect(buildBillingUsageMeter(125, 100).percentage).toBe(100);
    expect(buildBillingUsageMeter(5, -1)).toMatchObject({
      state: "unlimited",
      percentage: 0,
    });
    expect(buildBillingUsageMeter(null, 10).state).toBe("untracked");
    expect(buildBillingUsageMeter(4, null).state).toBe("unconfigured");
  });

  it("normalizes invoice pages and billing roles", () => {
    expect(normalizeInvoicePage("3")).toBe(3);
    expect(normalizeInvoicePage("-2")).toBe(1);
    expect(normalizeInvoicePage("garbage")).toBe(1);
    expect(invoicePageCount(21, 10)).toBe(3);
    expect(invoicePageCount(0, 10)).toBe(1);
    expect(invoicePageCount(10, 0)).toBe(1);
    expect(canManageBilling("owner")).toBe(true);
    expect(canManageBilling("admin")).toBe(true);
    expect(canManageBilling("editor")).toBe(false);
    expect(isBillingPlanId("e89b6ac8-6e2f-42d4-9016-ede0950e77d2")).toBe(true);
    expect(isBillingPlanId("not-a-plan")).toBe(false);
    expect(isManualPlanChangeAllowed(null)).toBe(true);
    expect(isManualPlanChangeAllowed("sub_provider_1")).toBe(false);
  });
});
