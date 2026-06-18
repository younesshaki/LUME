import { describe, expect, it } from "vitest";
import { isBlockRenderable } from "./registry";
import { registerBlocks } from "./registerBlocks";

describe("registerBlocks", () => {
  it("binds every shipped block type to a public component", () => {
    registerBlocks();
    registerBlocks();

    expect(isBlockRenderable("hero")).toBe(true);
    expect(isBlockRenderable("feature-band")).toBe(true);
    expect(isBlockRenderable("statement-list")).toBe(true);
    expect(isBlockRenderable("rich-text")).toBe(true);
    expect(isBlockRenderable("product-grid")).toBe(true);
    expect(isBlockRenderable("vehicle-inventory")).toBe(true);
    expect(isBlockRenderable("showcase-gallery")).toBe(true);
  });
});
