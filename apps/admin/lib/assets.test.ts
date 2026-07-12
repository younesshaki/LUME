import { describe, expect, it } from "vitest";
import {
  filterTenantAssets,
  sanitizeAssetFileName,
  tenantAssetType,
  type TenantAsset,
} from "./assets";

const assets: TenantAsset[] = [
  {
    name: "Hero.JPG",
    objectKey: "tenant-a/Hero.JPG",
    url: "https://storage.example/Hero.JPG",
    updatedAt: null,
    contentType: "image/jpeg",
  },
  {
    name: "brand-guide.pdf",
    objectKey: "tenant-a/docs/brand-guide.pdf",
    url: "https://storage.example/brand-guide.pdf",
    updatedAt: null,
    contentType: "application/pdf",
  },
];

describe("sanitizeAssetFileName", () => {
  it("normalizes uploaded asset names", () => {
    expect(sanitizeAssetFileName(" Hero Image 01.PNG ")).toBe("hero-image-01.png");
    expect(sanitizeAssetFileName("../../secret")).toBe("secret");
    expect(sanitizeAssetFileName(".env")).toBe("env");
  });
});

describe("tenant asset filtering", () => {
  it("classifies images from MIME metadata or a known image extension", () => {
    expect(tenantAssetType(assets[0]!)).toBe("image");
    expect(tenantAssetType({ ...assets[0]!, contentType: null })).toBe("image");
    expect(tenantAssetType(assets[1]!)).toBe("other");
  });

  it("searches names and object keys and filters by type", () => {
    expect(filterTenantAssets(assets, "hero", "all")).toEqual([assets[0]]);
    expect(filterTenantAssets(assets, "DOCS", "other")).toEqual([assets[1]]);
    expect(filterTenantAssets(assets, "", "image")).toEqual([assets[0]]);
  });
});
