import { describe, expect, it } from "vitest";
import { sanitizeAssetFileName } from "./assets";

describe("sanitizeAssetFileName", () => {
  it("normalizes uploaded asset names", () => {
    expect(sanitizeAssetFileName(" Hero Image 01.PNG ")).toBe("hero-image-01.png");
    expect(sanitizeAssetFileName("../../secret")).toBe("secret");
    expect(sanitizeAssetFileName(".env")).toBe("env");
  });
});
