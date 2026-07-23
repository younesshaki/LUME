/**
 * Dealer Launch Certification — the authoritative readiness evaluator.
 *
 * PURE module: no I/O, no imports from data layers, no globals. All facts
 * arrive as a TenantLaunchSnapshot (loaded server-side elsewhere); this
 * module turns them into a deterministic LaunchReadinessReport. The same
 * evaluator feeds the Admin Website Studio section, the tenant-overview
 * onboarding checklist, and the read-only operator CLI
 * (`npm run audit:tenant-launch`).
 *
 * Language contract: never "production ready" — only "Ready for pilot" or
 * "Ready for public launch". Readiness means `blockerCount === 0` for the
 * requested profile, nothing more.
 */

export type LaunchProfile = "pilot" | "public";
export type LaunchCheckStatus = "pass" | "warning" | "blocker";
export type LaunchCheckCategory =
  | "account"
  | "website"
  | "inventory"
  | "branding"
  | "domain"
  | "concierge"
  | "operations";

export const LAUNCH_CHECK_CATEGORY_ORDER: readonly LaunchCheckCategory[] = [
  "account",
  "website",
  "inventory",
  "branding",
  "domain",
  "concierge",
  "operations",
];

export type LaunchCheck = {
  id: string;
  category: LaunchCheckCategory;
  status: LaunchCheckStatus;
  title: string;
  explanation: string;
  remediationHref: string | null;
  /** Safe scalar facts only: counts, booleans, short status strings. */
  evidence: Record<string, string | number | boolean | null>;
};

export type LaunchReadinessReport = {
  tenantId: string;
  tenantSlug: string;
  profile: LaunchProfile;
  generatedAt: string;
  ready: boolean;
  blockerCount: number;
  warningCount: number;
  passedCount: number;
  checks: LaunchCheck[];
};

/** Raw, serializable facts. Loaded by launchReadiness.server.ts. */
export type TenantLaunchSnapshot = {
  tenant: { id: string; slug: string; name: string; status: string };
  /** Members with role "owner" (invited-but-unaccepted never counts). */
  ownerCount: number;
  memberCount: number;
  pendingInviteCount: number;
  /** Operational subscription status (active/trialing/past_due/incomplete) or null. */
  subscriptionStatus: string | null;
  homePage: {
    exists: boolean;
    archived: boolean;
    hasPublishedRevision: boolean;
    publishedBlockCount: number;
    publishedDocumentValid: boolean;
    hasUnpublishedDraftChanges: boolean;
  };
  vehicles: {
    live: number;
    withPrice: number;
    withMileage: number;
    withIdentity: number;
    withDisplayImage: number;
  };
  hasLogo: boolean;
  verifiedDomainCount: number;
  /** Platform capability: custom domains are configured deployment-side. */
  customDomainsEnabled: boolean;
  personaConfigured: boolean;
  conciergeLeadCaptureEnabled: boolean;
  knowledgeChunkCount: number;
  leadEmailEnabled: boolean;
  leadNotificationFallbackConfigured: boolean;
  draftOnlyPageCount: number;
};

const CATEGORY_TITLES: Record<LaunchCheckCategory, string> = {
  account: "Account and access",
  website: "Website",
  inventory: "Inventory",
  branding: "Branding",
  domain: "Domain",
  concierge: "Concierge",
  operations: "Operations",
};

export function launchCheckCategoryTitle(category: LaunchCheckCategory): string {
  return CATEGORY_TITLES[category];
}

export function evaluateLaunchReadiness(
  snapshot: TenantLaunchSnapshot,
  profile: LaunchProfile,
  generatedAt: string = new Date().toISOString(),
): LaunchReadinessReport {
  const adminBase = `/admin/${snapshot.tenant.slug}`;
  const checks: LaunchCheck[] = [];
  const push = (check: LaunchCheck) => checks.push(check);
  const evidence = (
    entries: Record<string, string | number | boolean | null>,
  ) => entries;

  // ── Account ─────────────────────────────────────────────────────────────
  push({
    id: "account.tenant-active",
    category: "account",
    status: snapshot.tenant.status === "active"
      ? "pass"
      : snapshot.tenant.status === "trial"
        ? "warning"
        : "blocker",
    title: "Tenant is operational",
    explanation: snapshot.tenant.status === "active"
      ? "The tenant account is active."
      : snapshot.tenant.status === "trial"
        ? "The tenant is still in trial state; activate it before customers rely on it."
        : `The tenant is ${snapshot.tenant.status}; visitors and admins may be blocked.`,
    remediationHref: snapshot.tenant.status === "active" ? null : `${adminBase}/settings`,
    evidence: evidence({ status: snapshot.tenant.status }),
  });

  push({
    id: "account.owner-present",
    category: "account",
    status: snapshot.ownerCount >= 1 ? "pass" : "blocker",
    title: "At least one owner",
    explanation: snapshot.ownerCount >= 1
      ? "The tenant has an accountable owner."
      : "No owner membership exists — invited users who never accepted do not count.",
    remediationHref: snapshot.ownerCount >= 1 ? null : `${adminBase}/team`,
    evidence: evidence({ owners: snapshot.ownerCount }),
  });

  push({
    id: "account.subscription",
    category: "account",
    status: snapshot.subscriptionStatus ? "pass" : "warning",
    title: "Subscription or trial in place",
    explanation: snapshot.subscriptionStatus
      ? `An operational subscription exists (${snapshot.subscriptionStatus}).`
      : "No operational subscription. Fine while billing is being finalized — required before charging.",
    remediationHref: snapshot.subscriptionStatus ? null : `${adminBase}/settings`,
    evidence: evidence({ subscription: snapshot.subscriptionStatus ?? "none" }),
  });

  // ── Website ─────────────────────────────────────────────────────────────
  push({
    id: "website.home-exists",
    category: "website",
    status: snapshot.homePage.exists && !snapshot.homePage.archived ? "pass" : "blocker",
    title: "Home page exists",
    explanation: snapshot.homePage.archived
      ? "The home page is archived; visitors get no site."
      : snapshot.homePage.exists
        ? "A home page exists."
        : "No home page exists yet.",
    remediationHref: `${adminBase}/pages`,
    evidence: evidence({
      exists: snapshot.homePage.exists,
      archived: snapshot.homePage.archived,
    }),
  });

  push({
    id: "website.home-published",
    category: "website",
    status: snapshot.homePage.hasPublishedRevision ? "pass" : "blocker",
    title: "Home page is published",
    explanation: snapshot.homePage.hasPublishedRevision
      ? "The home page has a published revision."
      : "The home page has never been published — visitors cannot see it.",
    remediationHref: `${adminBase}/pages`,
    evidence: evidence({ published: snapshot.homePage.hasPublishedRevision }),
  });

  push({
    id: "website.home-content-valid",
    category: "website",
    status: snapshot.homePage.publishedBlockCount >= 1 && snapshot.homePage.publishedDocumentValid
      ? "pass"
      : "blocker",
    title: "Published home renders real content",
    explanation: snapshot.homePage.publishedBlockCount < 1
      ? "The published home revision is empty — a blank page would go live."
      : snapshot.homePage.publishedDocumentValid
        ? "The published home revision contains valid, renderable blocks."
        : "The published home revision contains blocks that fail validation.",
    remediationHref: `${adminBase}/pages`,
    evidence: evidence({
      publishedBlocks: snapshot.homePage.publishedBlockCount,
      valid: snapshot.homePage.publishedDocumentValid,
    }),
  });

  push({
    id: "website.inventory-path",
    category: "website",
    status: snapshot.vehicles.live >= 1 ? "pass" : "blocker",
    title: "Inventory is reachable by visitors",
    explanation: snapshot.vehicles.live >= 1
      ? "The built-in /vehicles inventory path has live vehicles to show."
      : "The inventory path has no live vehicles — visitors see an empty lot.",
    remediationHref: `${adminBase}/vehicles`,
    evidence: evidence({ liveVehicles: snapshot.vehicles.live, path: "/vehicles" }),
  });

  push({
    id: "website.conversion-path",
    category: "website",
    status: snapshot.conciergeLeadCaptureEnabled
      ? "pass"
      : profile === "public"
        ? "blocker"
        : "warning",
    title: "A visitor conversion path exists",
    explanation: snapshot.conciergeLeadCaptureEnabled
      ? "Visitors can leave their details (lead capture is enabled)."
      : "No working way for a visitor to become a lead — every visit is lost traffic.",
    remediationHref: `${adminBase}/concierge-targets`,
    evidence: evidence({ leadCapture: snapshot.conciergeLeadCaptureEnabled }),
  });

  push({
    id: "website.no-stale-drafts",
    category: "website",
    status: snapshot.homePage.hasUnpublishedDraftChanges || snapshot.draftOnlyPageCount > 0
      ? "warning"
      : "pass",
    title: "No forgotten draft changes",
    explanation: snapshot.homePage.hasUnpublishedDraftChanges
      ? "The home page has draft edits that were never published."
      : snapshot.draftOnlyPageCount > 0
        ? `${snapshot.draftOnlyPageCount} page(s) exist only as drafts.`
        : "Published content and drafts are in sync.",
    remediationHref: `${adminBase}/pages`,
    evidence: evidence({
      homeDraftChanges: snapshot.homePage.hasUnpublishedDraftChanges,
      draftOnlyPages: snapshot.draftOnlyPageCount,
    }),
  });

  // ── Inventory ───────────────────────────────────────────────────────────
  push({
    id: "inventory.has-vehicles",
    category: "inventory",
    status: snapshot.vehicles.live >= 1 ? "pass" : "blocker",
    title: "At least one live vehicle",
    explanation: snapshot.vehicles.live >= 1
      ? `${snapshot.vehicles.live} live vehicle(s) in inventory.`
      : "No live vehicles — import inventory before launching.",
    remediationHref: `${adminBase}/vehicles`,
    evidence: evidence({ live: snapshot.vehicles.live }),
  });

  const coverage = (
    id: string,
    title: string,
    covered: number,
    blocksPublicAtZero: boolean,
    remediation: string,
  ): void => {
    const total = snapshot.vehicles.live;
    const pct = total === 0 ? 0 : Math.floor((covered / total) * 100);
    const complete = total > 0 && covered === total;
    const status: LaunchCheckStatus = total === 0
      ? "blocker"
      : complete
        ? "pass"
        : pct === 0 && blocksPublicAtZero
          ? profile === "public" ? "blocker" : "warning"
          : "warning";
    push({
      id,
      category: "inventory",
      status,
      title,
      explanation: total === 0
        ? "No live vehicles to evaluate."
        : complete
          ? `All ${total} live vehicles covered.`
          : `${covered}/${total} live vehicles covered (${pct}%).`,
      remediationHref: status === "pass" ? null : remediation,
      evidence: evidence({ covered, total, percent: pct }),
    });
  };

  coverage(
    "inventory.price-coverage",
    "Prices present",
    snapshot.vehicles.withPrice,
    true,
    `${adminBase}/vehicles`,
  );
  coverage(
    "inventory.image-coverage",
    "Display images present",
    snapshot.vehicles.withDisplayImage,
    true,
    `${adminBase}/vehicles`,
  );
  coverage(
    "inventory.mileage-coverage",
    "Mileage present",
    snapshot.vehicles.withMileage,
    false,
    `${adminBase}/vehicles`,
  );
  coverage(
    "inventory.identity-coverage",
    "Stable identity (VIN/feed id) present",
    snapshot.vehicles.withIdentity,
    false,
    `${adminBase}/vehicles`,
  );

  // ── Branding ────────────────────────────────────────────────────────────
  push({
    id: "branding.logo",
    category: "branding",
    status: snapshot.hasLogo
      ? "pass"
      : profile === "public"
        ? "blocker"
        : "warning",
    title: "Dealership logo is set",
    explanation: snapshot.hasLogo
      ? "A logo is available for the public site."
      : "No logo found in theme or tenant logo storage — the site ships without the dealer's identity.",
    remediationHref: `${adminBase}/branding`,
    evidence: evidence({ hasLogo: snapshot.hasLogo }),
  });

  // ── Domain ──────────────────────────────────────────────────────────────
  push({
    id: "domain.verified",
    category: "domain",
    status: snapshot.verifiedDomainCount >= 1
      ? "pass"
      : !snapshot.customDomainsEnabled
        ? "pass"
        : profile === "public"
          ? "blocker"
          : "warning",
    title: snapshot.verifiedDomainCount >= 1
      ? "Custom domain verified"
      : "Launch URL",
    explanation: snapshot.verifiedDomainCount >= 1
      ? "A verified custom domain points at the site."
      : !snapshot.customDomainsEnabled
        ? "Custom domains are not configured platform-side; the tenant-scoped preview URL is the launch path."
        : profile === "public"
          ? "Public launch requires a verified custom domain; the preview URL is not a public address."
          : "Pilot can run on the tenant-scoped preview URL; a custom domain is needed for public launch.",
    remediationHref: snapshot.verifiedDomainCount >= 1 || !snapshot.customDomainsEnabled
      ? null
      : `${adminBase}/domains`,
    evidence: evidence({
      verifiedDomains: snapshot.verifiedDomainCount,
      customDomainsEnabled: snapshot.customDomainsEnabled,
    }),
  });

  // ── Concierge ───────────────────────────────────────────────────────────
  push({
    id: "concierge.persona-configured",
    category: "concierge",
    status: snapshot.personaConfigured ? "pass" : "warning",
    title: "Concierge persona configured",
    explanation: snapshot.personaConfigured
      ? "The concierge has a tenant-specific persona."
      : "The concierge still runs the untouched default persona.",
    remediationHref: `${adminBase}/persona`,
    evidence: evidence({ configured: snapshot.personaConfigured }),
  });

  push({
    id: "concierge.knowledge",
    category: "concierge",
    status: snapshot.knowledgeChunkCount > 0 ? "pass" : "warning",
    title: "Tenant knowledge available",
    explanation: snapshot.knowledgeChunkCount > 0
      ? `${snapshot.knowledgeChunkCount} knowledge chunk(s) ground the concierge's answers.`
      : "No tenant knowledge yet — the concierge still answers from live inventory, but dealership-specific questions will miss.",
    remediationHref: `${adminBase}/knowledge`,
    evidence: evidence({ knowledgeChunks: snapshot.knowledgeChunkCount }),
  });

  // ── Operations ──────────────────────────────────────────────────────────
  push({
    id: "operations.lead-destination",
    category: "operations",
    status: snapshot.leadEmailEnabled
      ? "pass"
      : snapshot.leadNotificationFallbackConfigured
        ? "warning"
        : profile === "public"
          ? "blocker"
          : "warning",
    title: "Lead notifications reach the team",
    explanation: snapshot.leadEmailEnabled
      ? "Lead email notifications are enabled; owners are notified."
      : snapshot.leadNotificationFallbackConfigured
        ? "Lead emails are disabled, but a fallback destination is configured — verify it is monitored."
        : "Leads would be captured silently with no notification to anyone.",
    remediationHref: `${adminBase}/settings`,
    evidence: evidence({
      leadEmailEnabled: snapshot.leadEmailEnabled,
      fallbackConfigured: snapshot.leadNotificationFallbackConfigured,
    }),
  });

  push({
    id: "operations.team-coverage",
    category: "operations",
    status: snapshot.memberCount > 1 || snapshot.pendingInviteCount > 0 ? "pass" : "warning",
    title: "Team coverage beyond one person",
    explanation: snapshot.memberCount > 1
      ? `${snapshot.memberCount} team members can work leads.`
      : snapshot.pendingInviteCount > 0
        ? "A team invite is pending acceptance."
        : "A single person runs this dealership's LUME — invite teammates for coverage.",
    remediationHref: `${adminBase}/team`,
    evidence: evidence({
      members: snapshot.memberCount,
      pendingInvites: snapshot.pendingInviteCount,
    }),
  });

  const ordered = checks
    .sort(
      (left, right) =>
        LAUNCH_CHECK_CATEGORY_ORDER.indexOf(left.category) -
          LAUNCH_CHECK_CATEGORY_ORDER.indexOf(right.category) ||
        left.id.localeCompare(right.id),
    )
    // Passing checks never show a remediation link — there is nothing to fix.
    .map((check) =>
      check.status === "pass" && check.remediationHref !== null
        ? { ...check, remediationHref: null }
        : check,
    );
  const blockerCount = ordered.filter((check) => check.status === "blocker").length;
  const warningCount = ordered.filter((check) => check.status === "warning").length;

  return {
    tenantId: snapshot.tenant.id,
    tenantSlug: snapshot.tenant.slug,
    profile,
    generatedAt,
    ready: blockerCount === 0,
    blockerCount,
    warningCount,
    passedCount: ordered.filter((check) => check.status === "pass").length,
    checks: ordered,
  };
}

/** Machine- and human-safe one-line summary, e.g. the CLI header and admin badge. */
export function launchReadinessSummary(report: LaunchReadinessReport): string {
  if (report.ready) {
    return report.warningCount > 0
      ? `Ready for ${report.profile === "pilot" ? "pilot" : "public launch"} with ${report.warningCount} warning(s)`
      : `Ready for ${report.profile === "pilot" ? "pilot" : "public launch"}`;
  }
  return `Not ready for ${report.profile === "pilot" ? "pilot" : "public launch"} — ${report.blockerCount} blocker(s)`;
}
