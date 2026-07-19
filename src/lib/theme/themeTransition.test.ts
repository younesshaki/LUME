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
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-reveal-snapshot");
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
});

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

describe("public theme snapshot", () => {
  it("creates a script-free destination document with destination mode tokens", () => {
    document.documentElement.className = "dark existing";
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.setProperty("--theme-lume-background", "#000");
    document.body.innerHTML = '<main id="content">Public site</main><script>throw new Error()</script><div data-theme-reveal-overlay></div>';

    const parsed = new DOMParser().parseFromString(
      buildThemeSnapshotMarkup("light", {
        source: document,
        clearStyleProperties: ["--theme-lume-background"],
        styleOverrides: { "--theme-lume-background": "#f4efe5" },
      }),
      "text/html"
    );

    expect(parsed.documentElement.classList.contains("dark")).toBe(false);
    expect(parsed.documentElement.dataset.theme).toBe("light");
    expect(parsed.documentElement.dataset.themeRevealSnapshot).toBe("light");
    expect(parsed.documentElement.style.getPropertyValue("--theme-lume-background")).toBe("#f4efe5");
    expect(parsed.querySelector("#content")).not.toBeNull();
    expect(parsed.querySelector("script")).toBeNull();
    expect(parsed.querySelector("[data-theme-reveal-overlay]")).toBeNull();
    expect(parsed.querySelector("base")?.href).toBe(document.location.href);
  });

  it("recognizes the public root data attribute", () => {
    document.documentElement.dataset.theme = "dark";
    expect(rootMatchesTheme(document.documentElement, "dark")).toBe(true);
    expect(rootMatchesTheme(document.documentElement, "light")).toBe(false);
  });
});
