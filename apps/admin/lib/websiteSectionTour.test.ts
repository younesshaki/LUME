import { describe, expect, it } from "vitest";
import {
  WEBSITE_SECTION_TOUR_KEYS,
  WEBSITE_SECTION_TOURS,
  dismissWebsiteSectionTour,
  hasWebsiteSectionTourReplayRequest,
  websiteSectionTourDismissalsFromRow,
  websiteSectionTourHref,
  websiteSectionTourStartMode,
} from "./websiteSectionTour";

describe("Website section tour definitions", () => {
  it("keeps each tutorial route-local, visual-only, and backed by stable selectors", () => {
    expect(WEBSITE_SECTION_TOUR_KEYS).toEqual(["pages", "templates", "design", "navigation"]);
    for (const key of WEBSITE_SECTION_TOUR_KEYS) {
      const tour = WEBSITE_SECTION_TOURS[key];
      expect(tour.name).toBe(`website-${key}-v1`);
      expect(tour.steps.length).toBeGreaterThanOrEqual(4);
      for (const step of tour.steps) {
        expect(step.selector).toMatch(/^\[data-tour="website-/);
        expect(step.disableInteraction).toBe(true);
      }
    }
  });

  it("starts each route for the demo cohort until that exact route is dismissed", () => {
    expect(websiteSectionTourStartMode({
      tenantSlug: "demo-sean",
      tourKey: "pages",
      dismissals: { templates: "2026-09-29T12:00:00Z" },
      replayRequested: false,
    })).toBe("automatic");
    expect(websiteSectionTourStartMode({
      tenantSlug: "demo-sean",
      tourKey: "templates",
      dismissals: { templates: "2026-09-29T12:00:00Z" },
      replayRequested: false,
    })).toBe("none");
    expect(websiteSectionTourStartMode({
      tenantSlug: "default",
      tourKey: "pages",
      dismissals: {},
      replayRequested: false,
    })).toBe("none");
  });

  it("allows manual replay without re-enabling automatic starts", () => {
    expect(hasWebsiteSectionTourReplayRequest("design", "design")).toBe(true);
    expect(hasWebsiteSectionTourReplayRequest(["design"], "design")).toBe(false);
    expect(websiteSectionTourStartMode({
      tenantSlug: "default",
      tourKey: "design",
      dismissals: { design: "2026-09-29T12:00:00Z" },
      replayRequested: true,
    })).toBe("manual");
    expect(websiteSectionTourHref("demo-max", "navigation")).toBe("/admin/demo-max/navigation?tour=navigation");
  });

  it("only accepts known timestamp keys and preserves other route opt-outs", () => {
    expect(websiteSectionTourDismissalsFromRow({
      pages: "2026-09-29T12:00:00Z",
      unknown: "2026-09-29T12:00:00Z",
      templates: 2,
    })).toEqual({ pages: "2026-09-29T12:00:00Z" });
    expect(dismissWebsiteSectionTour({ pages: "one" }, "navigation", "two")).toEqual({
      pages: "one",
      navigation: "two",
    });
  });
});
