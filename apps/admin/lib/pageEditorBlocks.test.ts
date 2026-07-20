import { describe, expect, it } from "vitest";
import {
  filterPaletteDescriptors,
  insertAt,
  insertionIndexAfter,
  moveToPosition,
} from "./pageEditorBlocks";

const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("insertAt", () => {
  it("inserts at the requested index without mutating the input", () => {
    const result = insertAt(blocks, 1, { id: "x" });
    expect(result.map((block) => block.id)).toEqual(["a", "x", "b", "c", "d"]);
    expect(blocks.map((block) => block.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("clamps out-of-range indexes into the list bounds", () => {
    expect(insertAt(blocks, -5, { id: "x" }).map((block) => block.id))
      .toEqual(["x", "a", "b", "c", "d"]);
    expect(insertAt(blocks, 99, { id: "x" }).map((block) => block.id))
      .toEqual(["a", "b", "c", "d", "x"]);
  });
});

describe("moveToPosition", () => {
  it("moves a block before the target", () => {
    expect(moveToPosition(blocks, "d", "b", "before").map((block) => block.id))
      .toEqual(["a", "d", "b", "c"]);
  });

  it("moves a block after the target, including past it downward", () => {
    expect(moveToPosition(blocks, "a", "c", "after").map((block) => block.id))
      .toEqual(["b", "c", "a", "d"]);
  });

  it("drops at the end when the target is the last row and position is after", () => {
    expect(moveToPosition(blocks, "a", "d", "after").map((block) => block.id))
      .toEqual(["b", "c", "d", "a"]);
  });

  it("no-ops on identical or missing ids without mutating", () => {
    expect(moveToPosition(blocks, "a", "a", "before")).toEqual(blocks);
    expect(moveToPosition(blocks, "missing", "a", "before")).toEqual(blocks);
    expect(moveToPosition(blocks, "a", "missing", "before")).toEqual(blocks);
    expect(blocks.map((block) => block.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("insertionIndexAfter", () => {
  it("inserts right after the anchor block", () => {
    expect(insertionIndexAfter(blocks, "b")).toBe(2);
  });

  it("falls back to the end when the anchor is missing or null", () => {
    expect(insertionIndexAfter(blocks, "missing")).toBe(blocks.length);
    expect(insertionIndexAfter(blocks, null)).toBe(blocks.length);
  });
});

describe("filterPaletteDescriptors", () => {
  const descriptors = [
    { type: "hero", displayName: "Hero", description: "Top-of-page headline and CTA." },
    { type: "trade-in-form", displayName: "Trade-in form", description: "Value a visitor's car." },
    { type: "faq-accordion", displayName: "FAQ", description: "Answers in an accordion." },
  ];

  it("returns everything for a blank query", () => {
    expect(filterPaletteDescriptors(descriptors, "  ")).toHaveLength(3);
  });

  it("matches display name, description, and type case-insensitively", () => {
    expect(filterPaletteDescriptors(descriptors, "TRADE")).toEqual([descriptors[1]]);
    expect(filterPaletteDescriptors(descriptors, "accordion")).toEqual([descriptors[2]]);
    expect(filterPaletteDescriptors(descriptors, "headline")).toEqual([descriptors[0]]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterPaletteDescriptors(descriptors, "zzz")).toEqual([]);
  });
});
