import { describe, expect, it } from "vitest";
import { reorderByBlockId } from "./editorOrdering";

const blocks = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("block editor ordering", () => {
  it("moves blocks in either direction without mutation", () => {
    expect(reorderByBlockId(blocks, "a", "c").map((block) => block.id)).toEqual(["b", "c", "a"]);
    expect(reorderByBlockId(blocks, "c", "a").map((block) => block.id)).toEqual(["c", "a", "b"]);
    expect(blocks.map((block) => block.id)).toEqual(["a", "b", "c"]);
  });

  it("returns a copy for missing or identical IDs", () => {
    expect(reorderByBlockId(blocks, "missing", "a")).toEqual(blocks);
    expect(reorderByBlockId(blocks, "a", "a")).not.toBe(blocks);
  });
});
