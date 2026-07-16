import { describe, expect, it } from "vitest";
import {
  SITE_BACKGROUND_MAX_BYTES,
  isTenantSiteDesignAssetUrl,
  siteBackgroundObjectKey,
  validateSiteBackgroundCandidate,
} from "./siteDesignAssets";

describe("website background assets", () => {
  it("accepts allowlisted image metadata within the design limit", () => {
    expect(validateSiteBackgroundCandidate({ name: "light.webp", type: "image/webp", size: 20_000 })).toBeNull();
  });

  it("rejects unsupported types and oversized files", () => {
    expect(validateSiteBackgroundCandidate({ name: "x.svg", type: "image/svg+xml", size: 500 })).toMatch(/JPEG/);
    expect(validateSiteBackgroundCandidate({ name: "x.png", type: "image/png", size: SITE_BACKGROUND_MAX_BYTES + 1 })).toMatch(/8 MB/);
  });

  it("builds a tenant and mode scoped generated object key", () => {
    expect(siteBackgroundObjectKey("tenant-a", "light", "image/avif", "generated-id"))
      .toBe("tenant-a/site-design/light/siteBackground-generated-id.avif");
  });

  it("rejects cross-tenant and arbitrary background references", () => {
    expect(isTenantSiteDesignAssetUrl("https://project.supabase.co/storage/v1/object/public/tenant-media/tenant-a/site-design/dark/x.webp", "tenant-a")).toBe(true);
    expect(isTenantSiteDesignAssetUrl("https://project.supabase.co/storage/v1/object/public/tenant-media/tenant-b/site-design/dark/x.webp", "tenant-a")).toBe(false);
    expect(isTenantSiteDesignAssetUrl("https://evil.example/tenant-a/site-design/dark/x.webp", "tenant-a")).toBe(false);
    expect(isTenantSiteDesignAssetUrl("javascript:alert(1)", "tenant-a")).toBe(false);
    expect(isTenantSiteDesignAssetUrl("/built-in/luxury.webp", "tenant-a")).toBe(true);
  });

  it("pins the storage host when an allowed origin is given (blocks SSRF/external hosts)", () => {
    const origin = "https://project.supabase.co";
    const okUrl = "https://project.supabase.co/storage/v1/object/public/tenant-media/tenant-a/site-design/dark/x.webp";
    expect(isTenantSiteDesignAssetUrl(okUrl, "tenant-a", origin)).toBe(true);
    // Right path, wrong host — a crafted internal/external target is rejected.
    expect(
      isTenantSiteDesignAssetUrl(
        "http://169.254.169.254/storage/v1/object/public/tenant-media/tenant-a/site-design/dark/x.webp",
        "tenant-a",
        origin,
      ),
    ).toBe(false);
    expect(
      isTenantSiteDesignAssetUrl(
        "https://evil.example/storage/v1/object/public/tenant-media/tenant-a/site-design/dark/x.webp",
        "tenant-a",
        origin,
      ),
    ).toBe(false);
    // http is rejected even without an allowed origin.
    expect(isTenantSiteDesignAssetUrl(okUrl.replace("https:", "http:"), "tenant-a")).toBe(false);
  });
});
