import { describe, expect, it } from "vitest";
import { unpinnedHeaderOffset } from "./useUnpinnedHeader";

describe("unpinnedHeaderOffset", () => {
  it("moves with the content until the header has left the screen", () => {
    expect(unpinnedHeaderOffset(0, 72)).toBe(0);
    expect(unpinnedHeaderOffset(30, 72)).toBe(30);
    expect(unpinnedHeaderOffset(72, 72)).toBe(72);
    expect(unpinnedHeaderOffset(1200, 72)).toBe(72);
  });

  it("ignores overscroll and bad input", () => {
    expect(unpinnedHeaderOffset(-40, 72)).toBe(0);
    expect(unpinnedHeaderOffset(Number.NaN, 72)).toBe(0);
  });
});
