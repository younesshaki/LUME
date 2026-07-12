import { describe, expect, it } from "vitest";
import { antivirusDecision, tenantIdFromObjectKey } from "./antivirusPolicy";

describe("antivirus upload policy", () => {
  it("skips image-only uploads and scans CSV/PDF content", () => {
    expect(antivirusDecision("tenant-media", "image/png")).toBe("skip");
    expect(antivirusDecision("tenant-csvs", "text/csv")).toBe("scan");
    expect(antivirusDecision("future-documents", "application/pdf")).toBe("scan");
    expect(antivirusDecision("tenant-3d-models", "model/gltf-binary")).toBe("skip");
  });

  it("accepts only tenant-prefixed UUID object keys", () => {
    expect(tenantIdFromObjectKey("123e4567-e89b-42d3-a456-426614174000/import.csv"))
      .toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(tenantIdFromObjectKey("../escape.csv")).toBeNull();
  });
});
