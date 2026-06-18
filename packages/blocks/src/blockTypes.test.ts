import { describe, expect, it } from "vitest";
import { listPaletteBlockDescriptors } from "./blockTypes";

describe("block descriptors", () => {
  it("exposes every shipped block in the admin palette", () => {
    expect(listPaletteBlockDescriptors().map((descriptor) => descriptor.type)).toEqual([
      "hero",
      "feature-band",
      "statement-list",
      "rich-text",
      "product-grid",
      "vehicle-inventory",
      "showcase-gallery",
    ]);
  });
});
