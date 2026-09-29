import {
  WEBSITE_TOUR_CARD_CLEARANCE,
  isWebsiteTourEligibleTenant,
  type WebsiteTourStart,
} from "./websiteTour";
import type { Step } from "nextstepjs";

export const WEBSITE_SECTION_TOUR_KEYS = ["pages", "templates", "design", "navigation"] as const;
export type WebsiteSectionTourKey = (typeof WEBSITE_SECTION_TOUR_KEYS)[number];

export type WebsiteSectionTourStep = {
  id: string;
  selector: string;
  side: NonNullable<Step["side"]>;
  title: string;
  content: string;
  disableInteraction: true;
  pointerPadding: number;
  pointerRadius: number;
};

export type WebsiteSectionTourDefinition = {
  key: WebsiteSectionTourKey;
  name: `website-${WebsiteSectionTourKey}-v1`;
  label: string;
  path: (tenantSlug: string) => string;
  steps: readonly WebsiteSectionTourStep[];
};

const step = (
  id: string,
  selector: string,
  side: WebsiteSectionTourStep["side"],
  title: string,
  content: string,
): WebsiteSectionTourStep => ({
  id,
  selector,
  side,
  title,
  content,
  disableInteraction: true,
  pointerPadding: 8,
  pointerRadius: 12,
});

export const WEBSITE_SECTION_TOURS: Record<WebsiteSectionTourKey, WebsiteSectionTourDefinition> = {
  pages: {
    key: "pages",
    name: "website-pages-v1",
    label: "Pages tutorial",
    path: (tenantSlug) => `/admin/${tenantSlug}/pages`,
    steps: [
      step("overview", '[data-tour="website-pages-overview"]', "bottom", "Manage your pages", "Create, edit, publish, and organize the public pages that make up your dealership website."),
      step("create", '[data-tour="website-pages-create"]', "left-top", "Create a page", "Use New Page to begin a new page. This tutorial will not create or change anything."),
      step("order", '[data-tour="website-pages-order"]', "bottom", "Order your navigation", "Drag rows to set the order of public navigation. Reserved pages cannot be deleted."),
      step("status", '[data-tour="website-pages-status"]', "top", "Check page status", "Use each row to see whether a page is a draft, published, archived, or has unpublished work."),
      step("vehicle-layout", '[data-tour="website-pages-vehicle-layout"]', "bottom", "Design every vehicle page", "This layout applies to every vehicle in your inventory. Keep its copy general rather than describing one specific car."),
    ],
  },
  templates: {
    key: "templates",
    name: "website-templates-v1",
    label: "Templates tutorial",
    path: (tenantSlug) => `/admin/${tenantSlug}/templates`,
    steps: [
      step("overview", '[data-tour="website-templates-overview"]', "bottom", "Choose a visual direction", "Templates change visual design and conversion emphasis. They do not replace your inventory, pages, contact details, or navigation."),
      step("template-grid", '[data-tour="website-templates-grid"]', "top", "Compare templates", "Live marks the current published template. Draft saved means a separate working design is ready to continue."),
      step("preview", '[data-tour="website-templates-preview"]', "bottom", "Preview safely", "Open Preview to inspect a template in dark and light modes without changing your public website."),
      step("draft", '[data-tour="website-templates-draft"]', "bottom", "Prepare a working draft", "Use template or Customize opens a working draft in Website Design. Nothing becomes public until you explicitly publish there."),
    ],
  },
  design: {
    key: "design",
    name: "website-design-v1",
    label: "Design tutorial",
    path: (tenantSlug) => `/admin/${tenantSlug}/design`,
    steps: [
      step("overview", '[data-tour="website-design-overview"]', "bottom", "Design your public site", "These controls change the dealership website, never the Admin dashboard."),
      step("publish", '[data-tour="website-design-publish"]', "bottom", "Work in drafts", "Changes save as a working draft. Publish website design is the explicit step that makes the draft live."),
      step("modes", '[data-tour="website-design-modes"]', "bottom", "Choose a design scope", "Shared settings affect both website modes. Dark and light tabs let you tune each mode separately."),
      step("settings", '[data-tour="website-design-settings"]', "top", "Adjust the visual details", "Set backgrounds, colors, typography, and shared presentation settings here. The tutorial does not change them."),
      step("preview", '[data-tour="website-design-preview"]', "left", "Compare draft and live", "The design preview reflects your current draft. The published preview below it shows only what visitors can see today."),
    ],
  },
  navigation: {
    key: "navigation",
    name: "website-navigation-v1",
    label: "Navigation tutorial",
    path: (tenantSlug) => `/admin/${tenantSlug}/navigation`,
    steps: [
      step("overview", '[data-tour="website-navigation-overview"]', "bottom", "Guide your visitors", "This page controls how your public header and footer present the dealership website."),
      step("header", '[data-tour="website-navigation-header"]', "right-top", "Set the header", "Choose how many published pages appear, the header layout, sticky behavior, visitor access, and the contact call to action."),
      step("footer", '[data-tour="website-navigation-footer"]', "top", "Set the footer", "Choose its layout, optional columns, and whether social links appear."),
      step("preview", '[data-tour="website-navigation-preview"]', "top", "Review what fits", "This preview lists pages shown in the header and clearly identifies pages beyond the current limit."),
      step("save", '[data-tour="website-navigation-save"]', "bottom", "Save when ready", "Save changes writes the header and footer settings. Page order and visibility still come from Pages."),
    ],
  },
};

export type WebsiteSectionTourDismissals = Partial<Record<WebsiteSectionTourKey, string>>;

export const WEBSITE_SECTION_TOUR_OVERLAY_OPTIONS = {
  clickThroughOverlay: false,
  displayArrow: false,
  scrollToTop: false,
  overlayZIndex: 999,
} as const;

export function isWebsiteSectionTourKey(value: string): value is WebsiteSectionTourKey {
  return (WEBSITE_SECTION_TOUR_KEYS as readonly string[]).includes(value);
}

export function websiteSectionTourDismissalsFromRow(value: unknown): WebsiteSectionTourDismissals {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    WEBSITE_SECTION_TOUR_KEYS.flatMap((key) => typeof record[key] === "string" ? [[key, record[key]]] : []),
  ) as WebsiteSectionTourDismissals;
}

export function websiteSectionTourStartMode(input: {
  tenantSlug: string;
  tourKey: WebsiteSectionTourKey;
  dismissals: WebsiteSectionTourDismissals;
  replayRequested: boolean;
}): WebsiteTourStart {
  if (input.replayRequested) return "manual";
  return isWebsiteTourEligibleTenant(input.tenantSlug) && !input.dismissals[input.tourKey]
    ? "automatic"
    : "none";
}

export function hasWebsiteSectionTourReplayRequest(
  value: string | string[] | undefined,
  key: WebsiteSectionTourKey,
): boolean {
  return value === key;
}

export function websiteSectionTourHref(tenantSlug: string, key: WebsiteSectionTourKey): string {
  return `${WEBSITE_SECTION_TOURS[key].path(tenantSlug)}?tour=${key}`;
}

export function dismissWebsiteSectionTour(
  previous: WebsiteSectionTourDismissals,
  key: WebsiteSectionTourKey,
  at: string,
): WebsiteSectionTourDismissals {
  return { ...previous, [key]: at };
}

export function sectionTourCompactSelector(selector: string, stepId: string, viewportHeight: number, doc: Pick<Document, "querySelector"> = document): string {
  const target = doc.querySelector(selector);
  if (!target) return selector;
  if (target.getBoundingClientRect().height + WEBSITE_TOUR_CARD_CLEARANCE <= viewportHeight) return selector;
  const anchor = target.querySelector("[data-tour-anchor]") ?? target.querySelector("h1, h2, h3, header");
  if (!anchor) return selector;
  anchor.setAttribute("data-tour-anchor-for", stepId);
  return `[data-tour-anchor-for="${stepId}"]`;
}

const TOUR_CARD_WIDTH = 352;
const TOUR_CARD_HEIGHT = WEBSITE_TOUR_CARD_CLEARANCE - 16;
const TOUR_CARD_OFFSET = 16;
const TOUR_VIEWPORT_GUTTER = 16;

type TourViewport = { width: number; height: number };
type TourRect = Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">;

/**
 * NextStep's built-in collision helper measures against the document height,
 * which can place a card below the browser's visible edge on long Admin pages.
 * Resolve the placement against the actual viewport before starting each tour
 * instead. The final card CSS also caps its height for very short windows.
 */
export function sectionTourViewportPlacement(
  selector: string,
  stepId: string,
  preferredSide: NonNullable<Step["side"]>,
  viewport: TourViewport,
  doc: Pick<Document, "querySelector"> = document,
): { selector: string; side: NonNullable<Step["side"]> } {
  const compactSelector = sectionTourCompactSelector(selector, stepId, viewport.height, doc);
  const target = doc.querySelector(compactSelector);
  if (!target) return { selector: compactSelector, side: preferredSide };

  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { selector: compactSelector, side: preferredSide };

  const candidates = placementCandidates(preferredSide);
  const visible = candidates.find((side) => placementFitsViewport(side, rect, viewport));
  return { selector: compactSelector, side: visible ?? candidates[0] };
}

function placementCandidates(preferred: NonNullable<Step["side"]>): NonNullable<Step["side"]>[] {
  const base: NonNullable<Step["side"]>[] = [
    preferred,
    "top",
    "bottom",
    "left",
    "right",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "left-top",
    "left-bottom",
    "right-top",
    "right-bottom",
  ];
  return [...new Set(base)];
}

function placementFitsViewport(
  side: NonNullable<Step["side"]>,
  rect: TourRect,
  viewport: TourViewport,
): boolean {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  let left: number;
  let top: number;

  switch (side) {
    case "top":
      left = centerX - TOUR_CARD_WIDTH / 2;
      top = rect.top - TOUR_CARD_OFFSET - TOUR_CARD_HEIGHT;
      break;
    case "bottom":
      left = centerX - TOUR_CARD_WIDTH / 2;
      top = rect.bottom + TOUR_CARD_OFFSET;
      break;
    case "left":
      left = rect.left - TOUR_CARD_OFFSET - TOUR_CARD_WIDTH;
      top = centerY - TOUR_CARD_HEIGHT / 2;
      break;
    case "right":
      left = rect.right + TOUR_CARD_OFFSET;
      top = centerY - TOUR_CARD_HEIGHT / 2;
      break;
    case "top-left":
      left = rect.left;
      top = rect.top - TOUR_CARD_OFFSET - TOUR_CARD_HEIGHT;
      break;
    case "top-right":
      left = rect.right - TOUR_CARD_WIDTH;
      top = rect.top - TOUR_CARD_OFFSET - TOUR_CARD_HEIGHT;
      break;
    case "bottom-left":
      left = rect.left;
      top = rect.bottom + TOUR_CARD_OFFSET;
      break;
    case "bottom-right":
      left = rect.right - TOUR_CARD_WIDTH;
      top = rect.bottom + TOUR_CARD_OFFSET;
      break;
    case "left-top":
      left = rect.left - TOUR_CARD_OFFSET - TOUR_CARD_WIDTH;
      top = rect.top;
      break;
    case "left-bottom":
      left = rect.left - TOUR_CARD_OFFSET - TOUR_CARD_WIDTH;
      top = rect.bottom - TOUR_CARD_HEIGHT;
      break;
    case "right-top":
      left = rect.right + TOUR_CARD_OFFSET;
      top = rect.top;
      break;
    case "right-bottom":
      left = rect.right + TOUR_CARD_OFFSET;
      top = rect.bottom - TOUR_CARD_HEIGHT;
      break;
  }

  return left >= TOUR_VIEWPORT_GUTTER
    && top >= TOUR_VIEWPORT_GUTTER
    && left + TOUR_CARD_WIDTH <= viewport.width - TOUR_VIEWPORT_GUTTER
    && top + TOUR_CARD_HEIGHT <= viewport.height - TOUR_VIEWPORT_GUTTER;
}
