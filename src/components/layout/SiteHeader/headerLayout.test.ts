import { describe, expect, it } from "vitest";
import type { TenantHeaderVariant } from "@lume/types";
import { headerLayout } from "./headerLayout";

const VARIANTS: TenantHeaderVariant[] = ["centred", "left", "split", "minimal"];

/** Number of grid tracks in a Tailwind `grid-cols-[a_b_c]` class. */
function trackCount(tracks: string): number {
  const inner = /^grid-cols-\[(.+)\]$/.exec(tracks)?.[1] ?? "";
  // Split on underscores that separate tracks, not those inside minmax(...).
  let depth = 0;
  let count = inner ? 1 : 0;
  for (const char of inner) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "_" && depth === 0) count += 1;
  }
  return count;
}

describe("headerLayout", () => {
  it("is a three-track grid for every variant and logo placement", () => {
    for (const variant of VARIANTS) {
      for (const placement of ["left", "centre"] as const) {
        expect(trackCount(headerLayout(variant, placement).tracks), `${variant}/${placement}`).toBe(3);
      }
    }
  });

  it("left placement keeps each variant's historical tracks and natural order", () => {
    expect(headerLayout("centred", "left")).toEqual({
      tracks: "grid-cols-[auto_1fr_auto]",
      navJustify: "justify-center",
      navSlot: "",
      order: { logo: "", nav: "", actions: "" },
    });
    expect(headerLayout("minimal", "left").tracks).toBe("grid-cols-[auto_minmax(0,4rem)_auto]");
  });

  it("centre placement puts the logo in a middle track between equal outer tracks", () => {
    for (const variant of VARIANTS) {
      const layout = headerLayout(variant, "centre");
      expect(layout.tracks).toBe("grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]");
      expect(layout.order).toEqual({ logo: "order-2", nav: "order-1", actions: "order-3" });
    }
  });

  it("minimal still collapses the nav to its trigger when the logo is centred", () => {
    expect(headerLayout("minimal", "centre").navSlot).toBe("max-w-16");
    expect(headerLayout("centred", "centre").navSlot).toBe("");
  });

  it("falls back to the centred tracks for an unknown variant", () => {
    const layout = headerLayout("bogus" as TenantHeaderVariant, "left");
    expect(layout.tracks).toBe("grid-cols-[auto_1fr_auto]");
  });
});
