import { describe, expect, it } from "vitest";
import {
  WEBSITE_HUB_TOUR_STEPS,
  WEBSITE_HUB_TOUR_OVERLAY_OPTIONS,
  WEBSITE_TOUR_VERSION,
  hasWebsiteTourReplayRequest,
  isWebsiteTourEligibleTenant,
  websiteTourOutcomeUpdate,
  websiteTourStartMode,
} from "./websiteTour";

describe("Website Hub tour eligibility and state", () => {
  it("defines seven non-destructive Hub steps against stable controls", () => {
    expect(WEBSITE_HUB_TOUR_STEPS).toHaveLength(7);
    expect(WEBSITE_HUB_TOUR_STEPS.map((step) => step.id)).toEqual([
      "overview",
      "templates",
      "pages",
      "visual-management",
      "navigation",
      "launch-readiness",
      "published-preview",
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

  it("suppresses an automatic launch only after the current version settles", () => {
    expect(websiteTourStartMode({
      tenantSlug: "demo-sean",
      preference: { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: "2026-09-28T12:00:00Z", websiteTourSkippedAt: null },
      replayRequested: false,
    })).toBe("none");
    expect(websiteTourStartMode({
      tenantSlug: "demo-sean",
      preference: { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: null, websiteTourSkippedAt: "2026-09-28T12:00:00Z" },
      replayRequested: false,
    })).toBe("none");
    expect(websiteTourStartMode({
      tenantSlug: "demo-sean",
      preference: { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: null, websiteTourSkippedAt: null },
      replayRequested: false,
    })).toBe("automatic");
  });

  it("treats a new version as an explicit opportunity to make a rollout decision", () => {
    expect(websiteTourStartMode({
      tenantSlug: "demo-max",
      preference: { websiteTourVersion: WEBSITE_TOUR_VERSION - 1, websiteTourCompletedAt: "2026-09-28T12:00:00Z", websiteTourSkippedAt: null },
      replayRequested: false,
    })).toBe("automatic");
  });

  it("permits a manual replay only for an eligible tenant", () => {
    expect(hasWebsiteTourReplayRequest("website")).toBe(true);
    expect(hasWebsiteTourReplayRequest(["website"])).toBe(false);
    expect(hasWebsiteTourReplayRequest("other")).toBe(false);
    expect(websiteTourStartMode({
      tenantSlug: "demo-arash",
      preference: { websiteTourVersion: WEBSITE_TOUR_VERSION, websiteTourCompletedAt: "2026-09-28T12:00:00Z", websiteTourSkippedAt: null },
      replayRequested: true,
    })).toBe("manual");
    expect(websiteTourStartMode({ tenantSlug: "default", preference: null, replayRequested: true })).toBe("none");
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
    });
  });
});
