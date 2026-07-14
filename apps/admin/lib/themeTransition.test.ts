import { describe, expect, it } from "vitest";
import {
  getThemeTransitionClipPaths,
  maxRevealRadius,
  polygonCollapsed,
} from "./themeTransition";

describe("polygonCollapsed", () => {
  it("collapses N vertices onto the origin point", () => {
    expect(polygonCollapsed(5, 6, 3)).toBe("polygon(5px 6px, 5px 6px, 5px 6px)");
    expect(polygonCollapsed(0, 0, 4).match(/px/g)).toHaveLength(8);
  });
});

describe("maxRevealRadius", () => {
  it("is the farthest-corner distance plus overscan", () => {
    // corner (0,0) → farthest is (100,100): hypot = 141.42.., ceil 142, +16 overscan
    expect(maxRevealRadius(0, 0, 100, 100)).toBe(158);
  });

  it("grows as the origin moves away from center", () => {
    const center = maxRevealRadius(50, 50, 100, 100);
    const corner = maxRevealRadius(0, 0, 100, 100);
    expect(corner).toBeGreaterThan(center);
  });
});

describe("getThemeTransitionClipPaths", () => {
  it("returns a collapsed→expanded circle anchored at the origin", () => {
    expect(getThemeTransitionClipPaths("circle", 10, 20, 100, 200, 300)).toEqual([
      "circle(0px at 10px 20px)",
      "circle(100px at 10px 20px)",
    ]);
  });

  it("collapses polygon variants to the origin at the start", () => {
    const [from] = getThemeTransitionClipPaths("square", 40, 40, 100, 800, 600);
    expect(from).toBe(polygonCollapsed(40, 40, 4));
  });

  it("expands square coverage to the farthest edges", () => {
    const [, to] = getThemeTransitionClipPaths("square", 0, 0, 100, 800, 600);
    // corner origin → half side reaches at least the far edge
    expect(to.startsWith("polygon(")).toBe(true);
    expect(to).toContain("px");
  });

  it("falls back to a circle for an unknown variant", () => {
    const [from, to] = getThemeTransitionClipPaths(
      "spiral" as never,
      5,
      5,
      50,
      100,
      100,
    );
    expect(from).toBe("circle(0px at 5px 5px)");
    expect(to).toBe("circle(50px at 5px 5px)");
  });
});
