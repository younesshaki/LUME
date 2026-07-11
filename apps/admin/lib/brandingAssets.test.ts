import { describe, expect, it } from "vitest";
import {
  brandingAssetObjectKey,
  buildBrandingPreviewUrl,
  validateBrandingAsset,
} from "./brandingAssets";

describe("branding assets", () => {
  it("accepts supported logo formats up to two megabytes", () => {
    expect(validateBrandingAsset({ type: "image/svg+xml", size: 2_000 }, "logo")).toBeNull();
    expect(validateBrandingAsset({ type: "image/jpeg", size: 2_000 }, "logo"))
      .toBe("Choose an SVG, PNG, or WebP image.");
    expect(validateBrandingAsset({ type: "image/png", size: 2 * 1024 * 1024 + 1 }, "logo"))
      .toBe("Brand images must be 2 MB or smaller.");
  });

  it("requires the exact raster dimensions for each favicon slot", () => {
    expect(validateBrandingAsset({
      type: "image/png",
      size: 2_000,
      width: 32,
      height: 32,
    }, "favicon32")).toBeNull();
    expect(validateBrandingAsset({
      type: "image/webp",
      size: 2_000,
      width: 191,
      height: 192,
    }, "favicon192")).toBe("This favicon must be exactly 192×192 pixels.");
  });

  it("builds stable tenant-owned object paths", () => {
    expect(brandingAssetObjectKey("tenant-id", "logo"))
      .toBe("tenant-id/branding/logo");
    expect(brandingAssetObjectKey("tenant-id", "favicon192"))
      .toBe("tenant-id/branding/favicon-192");
  });

  it("builds an actual tenant-site preview URL", () => {
    expect(buildBrandingPreviewUrl("https://public.example/base", "atelier"))
      .toBe("https://public.example/home?tenant=atelier&preview=lume");
    expect(buildBrandingPreviewUrl("not a URL", "atelier")).toBe("");
  });
});
