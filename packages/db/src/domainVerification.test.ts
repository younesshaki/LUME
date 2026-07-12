import { describe, expect, it, vi } from "vitest";
import {
  claimTenantDomainsForVerification,
  resolveDomainVerificationState,
} from "./domainVerification";

describe("domain verification polling", () => {
  it("resolves verified immediately and fails an unverified domain after 24 hours", () => {
    const now = Date.parse("2026-07-12T12:00:00.000Z");
    expect(resolveDomainVerificationState(true, "invalid", now)).toBe("verified");
    expect(resolveDomainVerificationState(false, "2026-07-11T12:00:01.000Z", now)).toBe("pending");
    expect(resolveDomainVerificationState(false, "2026-07-11T12:00:00.000Z", now)).toBe("failed");
    expect(resolveDomainVerificationState(false, "invalid", now)).toBe("pending");
  });

  it("bounds the service claim limit", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const client = { rpc } as unknown as Parameters<typeof claimTenantDomainsForVerification>[0];
    await claimTenantDomainsForVerification(client, 1_000);
    expect(rpc).toHaveBeenCalledWith("claim_tenant_domains_for_verification", { p_limit: 100 });
  });
});
