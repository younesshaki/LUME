import { describe, expect, it } from "vitest";
import {
  getThemeTransitionClipPaths,
  maxRevealRadius,
  polygonCollapsed,
} from "./themeTransition";

describe("public theme transition geometry", () => {
  it("covers the farthest viewport corner with overscan", () => {
    expect(maxRevealRadius(0, 0, 100, 100)).toBe(166);
  });

  it("anchors the circular reveal at the theme button", () => {
    expect(getThemeTransitionClipPaths("circle", 10, 20, 100, 200, 300)).toEqual([
      "circle(0px at 10px 20px)",
      "circle(100px at 10px 20px)",
    ]);
  });

  it("collapses polygon variants to the same origin", () => {
    expect(getThemeTransitionClipPaths("square", 40, 50, 100, 800, 600)[0])
      .toBe(polygonCollapsed(40, 50, 4));
  });
});
