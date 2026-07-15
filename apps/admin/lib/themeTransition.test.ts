import { afterEach, describe, expect, it } from "vitest";
import {
  buildThemeSnapshotMarkup,
  getThemeTransitionClipPaths,
  maxRevealRadius,
  polygonCollapsed,
  rootMatchesTheme,
} from "./themeTransition";

afterEach(() => {
  document.documentElement.className = "";
  document.body.replaceChildren();
});

describe("theme transition geometry", () => {
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

describe("theme snapshot", () => {
  it("creates a script-free destination document without stale overlays", () => {
    document.documentElement.className = "dark existing";
    document.body.innerHTML = '<main id="content">Admin</main><script>throw new Error()</script><div data-theme-reveal-overlay></div>';

    const parsed = new DOMParser().parseFromString(
      buildThemeSnapshotMarkup("light", document),
      "text/html",
    );

    expect(parsed.documentElement.classList.contains("dark")).toBe(false);
    expect(parsed.documentElement.dataset.theme).toBe("light");
    expect(parsed.documentElement.dataset.themeRevealSnapshot).toBe("light");
    expect(parsed.querySelector("#content")).not.toBeNull();
    expect(parsed.querySelector("script")).toBeNull();
    expect(parsed.querySelector("[data-theme-reveal-overlay]")).toBeNull();
    expect(parsed.querySelector("base")?.href).toBe(document.location.href);
  });

  it("recognizes the root state next-themes applies", () => {
    const root = document.documentElement;
    root.classList.add("dark");
    expect(rootMatchesTheme(root, "dark")).toBe(true);
    expect(rootMatchesTheme(root, "light")).toBe(false);
  });
});
