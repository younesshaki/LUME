import { describe, expect, it } from "vitest";
import type { TenantDomain } from "@lume/types";
import { domainDnsInstructions, domainDnsRecommendations } from "./domains";

const domain: TenantDomain = {
  id: "domain-1",
  tenantId: "tenant-1",
  domain: "cars.example.com",
  verified: false,
  verificationToken: "local-token",
  verificationStatus: "pending",
  verificationCheckedAt: null,
  verificationFailedAt: null,
  vercelConfig: {},
  createdAt: "2026-07-12T00:00:00.000Z",
};

describe("domain DNS presentation", () => {
  it("uses normalized Vercel challenges and recommendations when present", () => {
    const configured = {
      ...domain,
      vercelConfig: {
        verification: [{ type: "TXT", domain: "_vercel.example.com", value: "verify-me" }],
        recommendedCname: ["cname.vercel-dns.com", "cname.vercel-dns.com"],
        recommendedIpv4: ["76.76.21.21"],
      },
    };
    expect(domainDnsInstructions(configured)).toEqual([
      { type: "TXT", host: "_vercel.example.com", value: "verify-me" },
    ]);
    expect(domainDnsRecommendations(configured)).toEqual([
      "cname.vercel-dns.com",
      "76.76.21.21",
    ]);
  });

  it("keeps the legacy LUME TXT instruction when Vercel is not provisioned", () => {
    expect(domainDnsInstructions(domain)).toEqual([
      { type: "TXT", host: "_lume-verify.cars.example.com", value: "local-token" },
    ]);
  });
});
