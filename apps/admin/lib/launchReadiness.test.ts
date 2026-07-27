import { describe, expect, it } from "vitest";
import {
  evaluateLaunchReadiness,
  launchCheckCategoryTitle,
  launchReadinessSummary,
  type TenantLaunchSnapshot,
} from "./launchReadiness";

/** A fully-ready tenant; individual tests vary one fact at a time. */
function readySnapshot(): TenantLaunchSnapshot {
  return {
    tenant: { id: "tenant-1", slug: "acme", name: "Acme Motors", status: "active" },
    ownerCount: 1,
    memberCount: 2,
    pendingInviteCount: 0,
    subscriptionStatus: "active",
    homePage: {
      exists: true,
      archived: false,
      hasPublishedRevision: true,
      publishedBlockCount: 3,
      publishedDocumentValid: true,
      hasUnpublishedDraftChanges: false,
    },
    vehicles: {
      live: 20,
      withPrice: 20,
      withMileage: 20,
      withIdentity: 20,
      withDisplayImage: 20,
    },
    hasLogo: true,
    verifiedDomainCount: 1,
    customDomainsEnabled: true,
    personaConfigured: true,
    conciergeLeadCaptureEnabled: true,
    knowledgeChunkCount: 12,
    leadEmailEnabled: true,
    leadNotificationFallbackConfigured: false,
    draftOnlyPageCount: 0,
  };
}

function check(snapshot: TenantLaunchSnapshot, id: string, profile: "pilot" | "public" = "public") {
  const report = evaluateLaunchReadiness(snapshot, profile, "2026-07-24T00:00:00.000Z");
  const found = report.checks.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`check ${id} missing`);
  return { report, found };
}

describe("launch readiness — a fully configured tenant", () => {
  it("is ready for pilot and public launch with correct counts", () => {
    for (const profile of ["pilot", "public"] as const) {
      const report = evaluateLaunchReadiness(readySnapshot(), profile, "2026-07-24T00:00:00.000Z");
      expect(report.ready).toBe(true);
      expect(report.blockerCount).toBe(0);
      expect(report.warningCount).toBe(0);
      expect(report.passedCount).toBe(report.checks.length);
      expect(launchReadinessSummary(report)).toBe(
        profile === "pilot" ? "Ready for pilot" : "Ready for public launch",
      );
    }
  });

  it("never claims 'production ready' in any user-facing string", () => {
    const report = evaluateLaunchReadiness(readySnapshot(), "public");
    const allText = [
      launchReadinessSummary(report),
      ...report.checks.flatMap((item) => [item.title, item.explanation]),
    ].join(" ");
    expect(allText).not.toMatch(/production ready/i);
  });
});

describe("launch readiness — pilot vs public profile differences", () => {
  it("custom domain: warning for pilot, blocker for public", () => {
    const snapshot = { ...readySnapshot(), verifiedDomainCount: 0 };
    expect(check(snapshot, "domain.verified", "pilot").found.status).toBe("warning");
    expect(check(snapshot, "domain.verified", "public").found.status).toBe("blocker");
    expect(check(snapshot, "domain.verified", "pilot").report.ready).toBe(true);
    expect(check(snapshot, "domain.verified", "public").report.ready).toBe(false);
  });

  it("custom domain check passes when the platform does not configure domains", () => {
    const snapshot = { ...readySnapshot(), verifiedDomainCount: 0, customDomainsEnabled: false };
    expect(check(snapshot, "domain.verified", "public").found.status).toBe("pass");
  });

  it("logo: warning for pilot, blocker for public", () => {
    const snapshot = { ...readySnapshot(), hasLogo: false };
    expect(check(snapshot, "branding.logo", "pilot").found.status).toBe("warning");
    expect(check(snapshot, "branding.logo", "public").found.status).toBe("blocker");
  });

  it("conversion path: warning for pilot, blocker for public", () => {
    const snapshot = { ...readySnapshot(), conciergeLeadCaptureEnabled: false };
    expect(check(snapshot, "website.conversion-path", "pilot").found.status).toBe("warning");
    expect(check(snapshot, "website.conversion-path", "public").found.status).toBe("blocker");
  });

  it("lead destination: fallback inbox is only a warning, nothing configured blocks public", () => {
    const fallback = { ...readySnapshot(), leadEmailEnabled: false, leadNotificationFallbackConfigured: true };
    expect(check(fallback, "operations.lead-destination", "public").found.status).toBe("warning");
    const none = { ...readySnapshot(), leadEmailEnabled: false, leadNotificationFallbackConfigured: false };
    expect(check(none, "operations.lead-destination", "pilot").found.status).toBe("warning");
    expect(check(none, "operations.lead-destination", "public").found.status).toBe("blocker");
  });

  it("zero price/image coverage blocks public launch but only warns pilot", () => {
    const snapshot = readySnapshot();
    snapshot.vehicles = { live: 10, withPrice: 0, withMileage: 10, withIdentity: 10, withDisplayImage: 0 };
    expect(check(snapshot, "inventory.price-coverage", "public").found.status).toBe("blocker");
    expect(check(snapshot, "inventory.image-coverage", "public").found.status).toBe("blocker");
    expect(check(snapshot, "inventory.price-coverage", "pilot").found.status).toBe("warning");
    expect(check(snapshot, "inventory.image-coverage", "pilot").found.status).toBe("warning");
  });
});

describe("launch readiness — account and website blockers", () => {
  it("blocks with no owner (invited-but-unaccepted does not count)", () => {
    const snapshot = { ...readySnapshot(), ownerCount: 0, pendingInviteCount: 3 };
    expect(check(snapshot, "account.owner-present").found.status).toBe("blocker");
    expect(check(snapshot, "account.owner-present").report.ready).toBe(false);
  });

  it("blocks when the tenant is suspended, warns on trial", () => {
    expect(check({ ...readySnapshot(), tenant: { ...readySnapshot().tenant, status: "suspended" } },
      "account.tenant-active").found.status).toBe("blocker");
    expect(check({ ...readySnapshot(), tenant: { ...readySnapshot().tenant, status: "trial" } },
      "account.tenant-active").found.status).toBe("warning");
  });

  it("warns when there is no operational subscription", () => {
    expect(check({ ...readySnapshot(), subscriptionStatus: null }, "account.subscription").found.status)
      .toBe("warning");
  });

  it("blocks when home is missing or archived", () => {
    const missing = readySnapshot();
    missing.homePage.exists = false;
    expect(check(missing, "website.home-exists").found.status).toBe("blocker");
    const archived = readySnapshot();
    archived.homePage.archived = true;
    expect(check(archived, "website.home-exists").found.status).toBe("blocker");
  });

  it("blocks when home has no published revision", () => {
    const snapshot = readySnapshot();
    snapshot.homePage.hasPublishedRevision = false;
    expect(check(snapshot, "website.home-published").found.status).toBe("blocker");
  });

  it("blocks an empty published document instead of counting it as published", () => {
    const snapshot = readySnapshot();
    snapshot.homePage.publishedBlockCount = 0;
    expect(check(snapshot, "website.home-content-valid").found.status).toBe("blocker");
    const invalid = readySnapshot();
    invalid.homePage.publishedDocumentValid = false;
    expect(check(invalid, "website.home-content-valid").found.status).toBe("blocker");
  });

  it("warns on draft-only changes, never silently ignores them", () => {
    const home = readySnapshot();
    home.homePage.hasUnpublishedDraftChanges = true;
    expect(check(home, "website.no-stale-drafts").found.status).toBe("warning");
    const drafts = { ...readySnapshot(), draftOnlyPageCount: 2 };
    expect(check(drafts, "website.no-stale-drafts").found.status).toBe("warning");
  });
});

describe("launch readiness — inventory coverage", () => {
  it("blocks with no live vehicles", () => {
    const snapshot = readySnapshot();
    snapshot.vehicles = { live: 0, withPrice: 0, withMileage: 0, withIdentity: 0, withDisplayImage: 0 };
    expect(check(snapshot, "inventory.has-vehicles").found.status).toBe("blocker");
    expect(check(snapshot, "website.inventory-path").found.status).toBe("blocker");
    expect(check(snapshot, "inventory.price-coverage").found.status).toBe("blocker");
  });

  it("warns on partial coverage with actionable evidence", () => {
    const snapshot = readySnapshot();
    snapshot.vehicles = { live: 20, withPrice: 20, withMileage: 15, withIdentity: 20, withDisplayImage: 14 };
    const { found } = check(snapshot, "inventory.image-coverage");
    expect(found.status).toBe("warning");
    expect(found.explanation).toBe("14/20 live vehicles covered (70%).");
    expect(found.evidence).toEqual({ covered: 14, total: 20, percent: 70 });
  });

  it("passes only on exact 100% — 19/20 rounds down to a warning, with no fix link on pass", () => {
    const snapshot = readySnapshot();
    snapshot.vehicles = { live: 20, withPrice: 20, withMileage: 19, withIdentity: 20, withDisplayImage: 20 };
    const { found } = check(snapshot, "inventory.mileage-coverage");
    expect(found.status).toBe("warning");
    expect(found.explanation).toBe("19/20 live vehicles covered (95%).");
    const { report } = check(readySnapshot(), "inventory.price-coverage");
    const passing = report.checks.filter((item) => item.status === "pass");
    expect(passing.length).toBeGreaterThan(0);
    for (const item of passing) expect(item.remediationHref).toBeNull();
  });
});

describe("launch readiness — concierge and operations", () => {
  it("warns on default persona and missing knowledge without blocking", () => {
    const snapshot = { ...readySnapshot(), personaConfigured: false, knowledgeChunkCount: 0 };
    expect(check(snapshot, "concierge.persona-configured").found.status).toBe("warning");
    expect(check(snapshot, "concierge.knowledge").found.status).toBe("warning");
    expect(check(snapshot, "concierge.knowledge").report.ready).toBe(true);
  });

  it("warns when a single person runs the dealership", () => {
    const snapshot = { ...readySnapshot(), memberCount: 1, pendingInviteCount: 0 };
    expect(check(snapshot, "operations.team-coverage").found.status).toBe("warning");
    const invited = { ...readySnapshot(), memberCount: 1, pendingInviteCount: 1 };
    expect(check(invited, "operations.team-coverage").found.status).toBe("pass");
  });
});

describe("launch readiness — determinism and safety", () => {
  it("does not mutate the snapshot and produces a deterministic ordering", () => {
    const snapshot = readySnapshot();
    const before = JSON.stringify(snapshot);
    const first = evaluateLaunchReadiness(snapshot, "public", "2026-07-24T00:00:00.000Z");
    const second = evaluateLaunchReadiness(snapshot, "public", "2026-07-24T00:00:00.000Z");
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(first).toEqual(second);
    // Category-grouped order (account → website → … → operations), ids sorted
    // within each category.
    const categories = first.checks.map((item) => item.category);
    const categoryRank = (category: string) =>
      ["account", "website", "inventory", "branding", "domain", "concierge", "operations"]
        .indexOf(category);
    for (let index = 1; index < first.checks.length; index += 1) {
      const prev = first.checks[index - 1]!;
      const next = first.checks[index]!;
      const categoryDelta = categoryRank(next.category) - categoryRank(prev.category);
      expect(categoryDelta).toBeGreaterThanOrEqual(0);
      if (categoryDelta === 0) expect(next.id.localeCompare(prev.id)).toBeGreaterThan(0);
    }
    expect(new Set(categories).size).toBe(7);
  });

  it("evidence carries only safe scalars — no strings with emails, URLs, or text", () => {
    const report = evaluateLaunchReadiness(readySnapshot(), "public");
    for (const item of report.checks) {
      for (const value of Object.values(item.evidence)) {
        expect(["string", "number", "boolean"].includes(typeof value) || value === null).toBe(true);
        if (typeof value === "string") {
          expect(value).not.toMatch(/@|http|Bearer|sk-/);
        }
      }
    }
  });

  it("groups category titles for the admin UI", () => {
    expect(launchCheckCategoryTitle("account")).toBe("Account and access");
    expect(launchCheckCategoryTitle("operations")).toBe("Operations");
  });
});
