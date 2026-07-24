import { describe, expect, it } from "vitest";
import { listPaletteBlockDescriptors } from "@lume/blocks";
import { isBlockRenderable } from "./registry";
import { registerBlocks } from "./registerBlocks";

describe("registerBlocks", () => {
  it("binds every shipped block type to a public component", () => {
    registerBlocks();
    registerBlocks();

    const descriptors = listPaletteBlockDescriptors();
    expect(descriptors).toHaveLength(33);
    expect(
      descriptors.filter((descriptor) => !isBlockRenderable(descriptor.type)),
    ).toEqual([]);
  });
});
