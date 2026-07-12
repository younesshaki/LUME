import { describe, expect, it, vi } from "vitest";
import {
  getTenantCustomDomainLimit,
  reserveTenantDomain,
  resolveCustomDomainLimit,
} from "./domainLimits";

describe("custom domain plan limits", () => {
  it("maps free/trial, Pro, Enterprise, and explicit plan limits", () => {
    expect(resolveCustomDomainLimit({ subscriptionStatus: null, planName: null, limits: null })).toBe(0);
    expect(resolveCustomDomainLimit({ subscriptionStatus: "trialing", planName: "Pro", limits: { custom_domains: 5 } })).toBe(0);
    expect(resolveCustomDomainLimit({ subscriptionStatus: "active", planName: "Pro", limits: {} })).toBe(1);
    expect(resolveCustomDomainLimit({ subscriptionStatus: "active", planName: "Enterprise", limits: {} })).toBe(-1);
    expect(resolveCustomDomainLimit({ subscriptionStatus: "active", planName: "Custom", limits: { custom_domains: 3 } })).toBe(3);
    expect(resolveCustomDomainLimit({ subscriptionStatus: "active", planName: "Unknown", limits: {} })).toBe(0);
    expect(resolveCustomDomainLimit({ subscriptionStatus: "active", planName: "Pro", limits: { custom_domains: 10_001 } })).toBe(1);
  });

  it("normalizes an atomic reservation response", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ outcome: "created", domain_id: "domain-1", domain_limit: 1, domain_count: 1 }],
      error: null,
    });
    const client = { rpc } as unknown as Parameters<typeof reserveTenantDomain>[0];
    await expect(reserveTenantDomain(client, {
      tenantId: "tenant-1",
      domain: "cars.example.com",
      vercelConfig: {},
      verified: false,
      verificationStatus: "pending",
      verificationCheckedAt: null,
    })).resolves.toEqual({ outcome: "created", domainId: "domain-1", limit: 1, count: 1 });
  });

  it("loads the authoritative database allowance", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: -1, error: null });
    const client = { rpc } as unknown as Parameters<typeof getTenantCustomDomainLimit>[0];
    await expect(getTenantCustomDomainLimit(client, "tenant-1")).resolves.toBe(-1);
  });
});
