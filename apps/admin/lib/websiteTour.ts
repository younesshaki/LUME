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
} as const;

/**
 * Targets that may be hidden, so the tour never waits for them: the sidebar's
 * View website link is off-canvas on small screens. Steps using them list a
 * full-width Hub fallback (a card centred on a small control near the screen
 * edge would spill off a phone screen).
 */
export const WEBSITE_TOUR_OPTIONAL_TARGETS = {
  viewWebsite: '[data-tour="website-view-site"]',
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
  /**
   * Used in order when `selector` is missing or not visible on this screen;
   * the card then sits below the fallback (it is laid out for the Hub, not
   * beside the sidebar).
   */
  fallbackSelectors?: readonly string[];
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
    id: "view-website",
    selector: WEBSITE_TOUR_OPTIONAL_TARGETS.viewWebsite,
    // On a phone the sidebar is hidden: the Hub header holds Open live site.
    fallbackSelectors: [WEBSITE_TOUR_TARGETS.overview],
    side: "right",
    title: "View your website",
    content: "Open your live website in a new tab to see exactly what visitors see. Replay this tour anytime with the Tutorial button at the top.",
    disableInteraction: true,
    pointerPadding: 6,
    pointerRadius: 10,
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

/**
 * Room a step needs besides its target: the tour card, its gap and the
 * scroll offset. A target taller than the viewport minus this would push the
 * card off-screen (the card sits above or below the target), so such steps
 * point at a compact anchor inside the target instead.
 */
export const WEBSITE_TOUR_CARD_CLEARANCE = 320;

type TourDocument = Pick<Document, "querySelector">;

/**
 * The first of a step's selectors whose element is on the page and visible
 * (has a size). Falls back to the step's own selector.
 */
export function visibleTourSelector(
  step: Pick<WebsiteHubTourStep, "selector" | "fallbackSelectors">,
  doc: TourDocument = document,
): string {
  for (const selector of [step.selector, ...(step.fallbackSelectors ?? [])]) {
    const rect = doc.querySelector(selector)?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) return selector;
  }
  return step.selector;
}

/**
 * The selector a step should use right now so its card stays on screen.
 * Tall targets resolve to an explicit `[data-tour-anchor]` inside them, else
 * their first heading; the anchor is tagged so the tour can select it.
 */
export function compactTourSelector(
  selector: string,
  stepId: string,
  viewportHeight: number,
  doc: TourDocument = document,
): string {
  const target = doc.querySelector(selector);
  if (!target) return selector;
  if (target.getBoundingClientRect().height + WEBSITE_TOUR_CARD_CLEARANCE <= viewportHeight) return selector;
  const anchor = target.querySelector("[data-tour-anchor]") ?? target.querySelector("h1, h2, h3, header");
  if (!anchor) return selector;
  anchor.setAttribute("data-tour-anchor-for", stepId);
  return `[data-tour-anchor-for="${stepId}"]`;
}

/** Window event the Tutorial buttons fire to (re)start the tour in place. */
export const WEBSITE_TOUR_START_EVENT = "lume:start-website-tour";

/** Opens the Website Hub and starts the tour there (from any admin page). */
export function websiteTourHref(tenantSlug: string): string {
  return `/admin/${tenantSlug}/website?tour=website`;
}

export function isWebsiteTourEligibleTenant(tenantSlug: string): boolean {
  return WEBSITE_TOUR_DEMO_TENANTS.has(tenantSlug);
}

export function websiteTourStartMode(input: {
  tenantSlug: string;
  preference: WebsiteTourPreference | null;
  replayRequested: boolean;
}): WebsiteTourStart {
  // Anyone can start the tutorial on demand; only the demo cohort gets it
  // automatically on a first visit.
  if (input.replayRequested) return "manual";
  if (!isWebsiteTourEligibleTenant(input.tenantSlug)) return "none";

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
