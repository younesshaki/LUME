import { describe, expect, it } from "vitest";
import { responsiveSrcSet } from "./AutomotiveHero";

describe("responsiveSrcSet", () => {
  it("offers the 1200px sibling for template photos", () => {
    expect(responsiveSrcSet("https://cdn.example/templates/glo3d/hero-showroom.webp")).toBe(
      "https://cdn.example/templates/glo3d/hero-showroom-1200.webp 1200w, https://cdn.example/templates/glo3d/hero-showroom.webp 2400w",
    );
    expect(responsiveSrcSet("https://cdn.example/templates/glo3d/hero-showroom-1200.webp")).toContain("hero-showroom.webp 2400w");
  });

  it("leaves any other photo alone", () => {
    expect(responsiveSrcSet("https://dealer.example/showroom.jpg")).toBeUndefined();
  });
});
