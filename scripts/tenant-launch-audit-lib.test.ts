import { describe, expect, it } from "vitest";
import { evaluateLaunchReadiness } from "../apps/admin/lib/launchReadiness";
import {
  formatLaunchAuditHuman,
  formatLaunchAuditJson,
  parseLaunchAuditArgs,
} from "./tenant-launch-audit-lib";

describe("parseLaunchAuditArgs", () => {
  it("parses a full valid invocation", () => {
    expect(parseLaunchAuditArgs(["--tenant", "demo", "--profile", "public", "--format", "json"]))
      .toEqual({ ok: true, args: { tenant: "demo", profile: "public", format: "json" } });
  });

  it("defaults to pilot profile and human format", () => {
    expect(parseLaunchAuditArgs(["--tenant", "acme-motors"]))
      .toEqual({ ok: true, args: { tenant: "acme-motors", profile: "pilot", format: "human" } });
  });

  it("rejects missing tenant, bad slugs, and unknown or valueless flags", () => {
    expect(parseLaunchAuditArgs([]).ok).toBe(false);
    expect(parseLaunchAuditArgs(["--tenant"]).ok).toBe(false);
    expect(parseLaunchAuditArgs(["--tenant", "Bad Slug!"]).ok).toBe(false);
    expect(parseLaunchAuditArgs(["--tenant", "demo", "--profile", "enterprise"]).ok).toBe(false);
    expect(parseLaunchAuditArgs(["--tenant", "demo", "--format", "xml"]).ok).toBe(false);
    expect(parseLaunchAuditArgs(["--bogus"]).ok).toBe(false);
  });
});

describe("output serialization", () => {
  const report = evaluateLaunchReadiness({
    tenant: { id: "t-1", slug: "acme", name: "Acme Motors", status: "active" },
    ownerCount: 0,
    memberCount: 1,
    pendingInviteCount: 0,
    subscriptionStatus: null,
    homePage: {
      exists: true,
      archived: false,
      hasPublishedRevision: true,
      publishedBlockCount: 2,
      publishedDocumentValid: true,
      hasUnpublishedDraftChanges: false,
    },
    vehicles: { live: 4, withPrice: 4, withMileage: 3, withIdentity: 4, withDisplayImage: 4 },
    hasLogo: true,
    verifiedDomainCount: 0,
    customDomainsEnabled: true,
    personaConfigured: true,
    conciergeLeadCaptureEnabled: true,
    knowledgeChunkCount: 0,
    leadEmailEnabled: true,
    leadNotificationFallbackConfigured: false,
    draftOnlyPageCount: 0,
  }, "pilot", "2026-07-24T00:00:00.000Z");

  it("json output round-trips the exact report shape", () => {
    const parsed = JSON.parse(formatLaunchAuditJson(report));
    expect(parsed).toEqual(report);
    expect(parsed.ready).toBe(false);
  });

  it("human output has a header, counts, glyphs, evidence, and remediation", () => {
    const text = formatLaunchAuditHuman(report);
    expect(text).toContain("tenant acme (pilot)");
    expect(text).toContain("Not ready for pilot — 1 blocker(s)");
    expect(text).toContain("Account and access");
    expect(text).toContain("✗ At least one owner");
    expect(text).toContain("evidence: owners=0");
    expect(text).toContain("→ fix: /admin/acme/team");
    expect(text).toContain("! Tenant knowledge available");
  });

  it("never prints credential-shaped strings", () => {
    const text = `${formatLaunchAuditHuman(report)}\n${formatLaunchAuditJson(report)}`;
    expect(text).not.toMatch(/service_role|Bearer|SUPABASE_SERVICE_ROLE_KEY/i);
  });
});
