import { afterEach, describe, expect, it } from "vitest";
import {
  WEBSITE_TOUR_CARD_CLEARANCE,
  compactTourSelector,
  visibleTourSelector,
  WEBSITE_HUB_TOUR_STEPS,
  WEBSITE_HUB_TOUR_OVERLAY_OPTIONS,
  WEBSITE_TOUR_VERSION,
  hasWebsiteTourReplayRequest,
  isWebsiteTourEligibleTenant,
  websiteTourAutoStartEnabled,
  websiteTourHref,
  websiteTourOutcomeUpdate,
  websiteTourStartMode,
} from "./websiteTour";

describe("Website Hub tour eligibility and state", () => {
  it("defines six non-destructive Hub steps against stable controls", () => {
    expect(WEBSITE_HUB_TOUR_STEPS).toHaveLength(6);
    expect(WEBSITE_HUB_TOUR_STEPS.map((step) => step.id)).toEqual([
      "overview",
      "templates",
      "pages",
      "visual-management",
      "navigation",
      "view-website",
    ]);
    expect(WEBSITE_HUB_TOUR_STEPS.every((step) => step.disableInteraction)).toBe(true);
    expect(WEBSITE_HUB_TOUR_STEPS.map((step) => step.selector)).not.toContain(
      '[data-tour="site-nav-loader"]',
    );
    expect(WEBSITE_HUB_TOUR_STEPS.map((step) => step.content).join(" "))
      .not.toMatch(/footer|CTA|click|drag/i);
  });

  it("uses an explicitly modal overlay instead of allowing click-through", () => {
    expect(WEBSITE_HUB_TOUR_OVERLAY_OPTIONS).toMatchObject({
      clickThroughOverlay: false,
      scrollToTop: false,
    });
  });

  it.each(["demo-arash", "demo-max", "demo-sean"])("enables the demo rollout tenant %s", (tenantSlug) => {
    expect(isWebsiteTourEligibleTenant(tenantSlug)).toBe(true);
    expect(websiteTourStartMode({ tenantSlug, preference: null, replayRequested: false })).toBe("automatic");
  });

  it("does not automatically enable a different tenant", () => {
    expect(isWebsiteTourEligibleTenant("demo")).toBe(false);
    expect(websiteTourStartMode({ tenantSlug: "default", preference: null, replayRequested: false })).toBe("none");
  });

  it("opens every visit for the cohort, even after finishing or skipping", () => {
    for (const preference of [
      { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: "2026-09-28T12:00:00Z", websiteTourSkippedAt: null },
      { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: null, websiteTourSkippedAt: "2026-09-28T12:00:00Z" },
      null,
    ]) {
      expect(websiteTourStartMode({ tenantSlug: "demo-sean", preference, replayRequested: false })).toBe("automatic");
    }
  });

  it("stops opening by itself only after \"Don't show again\"", () => {
    const dismissed = {
      websiteTourVersion: WEBSITE_TOUR_VERSION,
      websiteTourCompletedAt: null,
      websiteTourSkippedAt: "2026-09-28T12:00:00Z",
      websiteTourDismissedAt: "2026-09-28T12:00:00Z",
    };
    expect(websiteTourStartMode({ tenantSlug: "demo-sean", preference: dismissed, replayRequested: false })).toBe("none");
    expect(websiteTourAutoStartEnabled("demo-sean", dismissed)).toBe(false);
    expect(websiteTourAutoStartEnabled("demo-sean", null)).toBe(true);
    expect(websiteTourAutoStartEnabled("default", null)).toBe(false);
    // The Tutorial button still works afterwards.
    expect(websiteTourStartMode({ tenantSlug: "demo-sean", preference: dismissed, replayRequested: true })).toBe("manual");
  });

  it("starts on demand for any tenant, automatically only for the cohort", () => {
    expect(hasWebsiteTourReplayRequest("website")).toBe(true);
    expect(hasWebsiteTourReplayRequest(["website"])).toBe(false);
    expect(hasWebsiteTourReplayRequest("other")).toBe(false);
    expect(websiteTourStartMode({
      tenantSlug: "demo-arash",
      preference: { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: "2026-09-28T12:00:00Z", websiteTourSkippedAt: null },
      replayRequested: true,
    })).toBe("manual");
    expect(websiteTourStartMode({ tenantSlug: "default", preference: null, replayRequested: true })).toBe("manual");
    expect(websiteTourHref("demo-max")).toBe("/admin/demo-max/website?tour=website");
  });

  it("keeps a prior completion when a replay is later skipped", () => {
    expect(websiteTourOutcomeUpdate({
      websiteTourVersion: WEBSITE_TOUR_VERSION,
      websiteTourCompletedAt: "2026-09-28T12:00:00Z",
      websiteTourSkippedAt: null,
    }, "skipped", "2026-09-28T13:00:00Z")).toEqual({
      websiteTourVersion: WEBSITE_TOUR_VERSION,
      websiteTourCompletedAt: "2026-09-28T12:00:00Z",
      websiteTourSkippedAt: "2026-09-28T13:00:00Z",
      websiteTourDismissedAt: null,
    });
  });

  it("records \"Don't show again\" and keeps it across later runs", () => {
    const dismissed = websiteTourOutcomeUpdate(null, "dismissed", "2026-09-29T09:00:00Z");
    expect(dismissed.websiteTourDismissedAt).toBe("2026-09-29T09:00:00Z");
    expect(websiteTourOutcomeUpdate(dismissed, "completed", "2026-09-29T10:00:00Z").websiteTourDismissedAt)
      .toBe("2026-09-29T09:00:00Z");
  });
});

describe("compactTourSelector (tour cards never scroll off-screen)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(targetHeight: number, inner: string) {
    document.body.innerHTML = `<section data-tour="tall">${inner}</section>`;
    const target = document.querySelector<HTMLElement>('[data-tour="tall"]')!;
    target.getBoundingClientRect = () => ({ height: targetHeight } as DOMRect);
    return target;
  }

  it("keeps a target that fits on screen with its card", () => {
    mount(400, "<h2>Title</h2>");
    expect(compactTourSelector('[data-tour="tall"]', "step", 400 + WEBSITE_TOUR_CARD_CLEARANCE)).toBe('[data-tour="tall"]');
  });

  it("points a too-tall target at its explicit anchor", () => {
    mount(1200, '<h2>Other</h2><div data-tour-anchor id="bar">Header bar</div>');
    const selector = compactTourSelector('[data-tour="tall"]', "published-preview", 900);
    expect(selector).toBe('[data-tour-anchor-for="published-preview"]');
    expect(document.querySelector(selector)?.id).toBe("bar");
  });

  it("falls back to the target's first heading", () => {
    mount(1200, "<p>Intro</p><h2 id='heading'>Launch readiness</h2>");
    const selector = compactTourSelector('[data-tour="tall"]', "future-step", 900);
    expect(document.querySelector(selector)?.id).toBe("heading");
  });

  it("leaves the selector alone when the target is missing or has no anchor", () => {
    expect(compactTourSelector('[data-tour="missing"]', "x", 900)).toBe('[data-tour="missing"]');
    mount(1200, "<p>No heading</p>");
    expect(compactTourSelector('[data-tour="tall"]', "x", 900)).toBe('[data-tour="tall"]');
  });
});

describe("visibleTourSelector (the last step points at the sidebar's View website)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const step = WEBSITE_HUB_TOUR_STEPS[WEBSITE_HUB_TOUR_STEPS.length - 1];
  function sized(selector: string, width: number) {
    const element = document.querySelector<HTMLElement>(selector)!;
    element.getBoundingClientRect = () => ({ width, height: width ? 32 : 0 } as DOMRect);
  }

  it("targets the sidebar link when it is on screen", () => {
    expect(step.id).toBe("view-website");
    document.body.innerHTML = '<a data-tour="website-view-site">View website</a><header data-tour="website-overview"></header>';
    sized('[data-tour="website-view-site"]', 180);
    expect(visibleTourSelector(step)).toBe('[data-tour="website-view-site"]');
  });

  it("falls back to the full-width Hub header when the sidebar is hidden", () => {
    document.body.innerHTML = '<a data-tour="website-view-site">View website</a><header data-tour="website-overview"></header>';
    sized('[data-tour="website-view-site"]', 0);
    sized('[data-tour="website-overview"]', 360);
    expect(visibleTourSelector(step)).toBe('[data-tour="website-overview"]');

    document.body.innerHTML = '<header data-tour="website-overview"></header>';
    sized('[data-tour="website-overview"]', 360);
    expect(visibleTourSelector(step)).toBe('[data-tour="website-overview"]');
  });
});
