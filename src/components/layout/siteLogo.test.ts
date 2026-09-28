import { describe, expect, it } from "vitest";
import { resolveSiteLogo } from "./siteLogo";

describe("resolveSiteLogo", () => {
  it("never starts a dealer page on LUME's logo while its theme loads", () => {
    expect(resolveSiteLogo({ isHouse: false, themeLoaded: false, logoUrl: undefined })).toBeNull();
  });

  it("uses the dealer's logo once known", () => {
    expect(resolveSiteLogo({ isHouse: false, themeLoaded: true, logoUrl: "https://cdn/d.png" })).toBe("https://cdn/d.png");
  });

  it("falls back to LUME's logo only after a dealer's theme has no logo", () => {
    expect(resolveSiteLogo({ isHouse: false, themeLoaded: true, logoUrl: undefined })).toMatch(/LUMElogo\.png$/);
  });

  it("shows LUME's own site logo immediately", () => {
    expect(resolveSiteLogo({ isHouse: true, themeLoaded: false, logoUrl: undefined })).toMatch(/LUMElogo\.png$/);
  });
});
