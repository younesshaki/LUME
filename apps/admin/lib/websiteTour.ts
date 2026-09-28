/**
 * The first Website tour is deliberately limited to the three demo tenants.
 * Keep this server-owned decision here rather than spreading tenant checks
 * through client components. A broader rollout needs an explicit product
 * decision and a different eligibility source.
 */
export const WEBSITE_TOUR_VERSION = 1;
export const WEBSITE_TOUR_NAME = "website-hub-v1";

const WEBSITE_TOUR_DEMO_TENANTS = new Set([
  "demo-arash",
  "demo-max",
  "demo-sean",
]);

export const WEBSITE_TOUR_TARGETS = {
  overview: '[data-tour="website-overview"]',
  templates: '[data-tour="website-templates"]',
  pages: '[data-tour="website-pages"]',
  visualManagement: '[data-tour="website-design"]',
  navigation: '[data-tour="website-navigation"]',
  launchReadiness: '[data-tour="website-launch-readiness"]',
  publishedPreview: '[data-tour="website-published-preview"]',
} as const;

/**
 * Framework-neutral step data. `nextstepjs` accepts the same selector/title/
 * content primitives once its client-only wrapper is mounted. Keeping this
 * here makes the product copy and target contract testable without importing
 * a browser-only overlay into server or public-site code.
 */
export type WebsiteHubTourStep = {
  id: string;
  selector: string;
  side: "top" | "bottom" | "left" | "right";
  title: string;
  content: string;
  disableInteraction: true;
  pointerPadding: number;
  pointerRadius: number;
};

export const WEBSITE_HUB_TOUR_STEPS: readonly WebsiteHubTourStep[] = [
  {
    id: "overview",
    selector: WEBSITE_TOUR_TARGETS.overview,
    side: "bottom",
    title: "Your dealership website",
    content: "Manage the pages, visual identity, navigation, and launch checks for your public site here.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
  {
    id: "templates",
    selector: WEBSITE_TOUR_TARGETS.templates,
    side: "bottom",
    title: "Choose a template",
    content: "Preview and prepare a versioned visual starting point without changing the live site.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
  {
    id: "pages",
    selector: WEBSITE_TOUR_TARGETS.pages,
    side: "bottom",
    title: "Manage pages",
    content: "Add, edit, and publish pages, then arrange the blocks that make up each page.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
  {
    id: "visual-management",
    selector: WEBSITE_TOUR_TARGETS.visualManagement,
    side: "bottom",
    title: "Shape your visual identity",
    content: "Website design manages shared visual settings. Logo & favicons and Media assets keep dealership identity and page images organized separately.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
  {
    id: "navigation",
    selector: WEBSITE_TOUR_TARGETS.navigation,
    side: "bottom",
    title: "Set your header",
    content: "Choose which pages appear in the header and how the top bar behaves.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
  {
    id: "launch-readiness",
    selector: WEBSITE_TOUR_TARGETS.launchReadiness,
    side: "top",
    title: "Check launch readiness",
    content: "Review what remains before your site can go live. This section never publishes changes for you.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
  {
    id: "published-preview",
    selector: WEBSITE_TOUR_TARGETS.publishedPreview,
    side: "top",
    title: "View the published site",
    content: "Draft template and design changes appear here only after publishing. You can replay this tour anytime from Website.",
    disableInteraction: true,
    pointerPadding: 8,
    pointerRadius: 12,
  },
];

/**
 * Explicit rather than relying on NextStep defaults: the tour is view-only and
 * must intercept clicks outside its own card. This protects Hub controls that
 * persist immediately, including the Loading animation switch.
 */
export const WEBSITE_HUB_TOUR_OVERLAY_OPTIONS = {
  clickThroughOverlay: false,
  displayArrow: false,
  scrollToTop: false,
  overlayZIndex: 999,
} as const;

export type WebsiteTourPreference = {
  websiteTourVersion: number | null;
  websiteTourCompletedAt: string | null;
  websiteTourSkippedAt: string | null;
};

export type WebsiteTourStart = "automatic" | "manual" | "none";

export function isWebsiteTourEligibleTenant(tenantSlug: string): boolean {
  return WEBSITE_TOUR_DEMO_TENANTS.has(tenantSlug);
}

export function websiteTourStartMode(input: {
  tenantSlug: string;
  preference: WebsiteTourPreference | null;
  replayRequested: boolean;
}): WebsiteTourStart {
  if (!isWebsiteTourEligibleTenant(input.tenantSlug)) return "none";
  if (input.replayRequested) return "manual";

  const preference = input.preference;
  const settledCurrentVersion = preference?.websiteTourVersion === WEBSITE_TOUR_VERSION
    && (preference.websiteTourCompletedAt !== null || preference.websiteTourSkippedAt !== null);

  return settledCurrentVersion ? "none" : "automatic";
}

/**
 * The only supported client-visible trigger is a Hub-local query parameter.
 * It can bypass prior completion only; server eligibility still applies.
 */
export function hasWebsiteTourReplayRequest(value: string | string[] | undefined): boolean {
  return value === "website";
}

export function websiteTourOutcomeUpdate(
  previous: WebsiteTourPreference | null,
  outcome: "completed" | "skipped",
  at: string,
): Required<WebsiteTourPreference> {
  return {
    websiteTourVersion: WEBSITE_TOUR_VERSION,
    // A replay must not erase historical completion merely because it is later skipped.
    websiteTourCompletedAt:
      outcome === "completed" ? at : previous?.websiteTourCompletedAt ?? null,
    websiteTourSkippedAt:
      outcome === "skipped" ? at : previous?.websiteTourSkippedAt ?? null,
  };
}
