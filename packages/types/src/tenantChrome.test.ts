import { describe, expect, it } from "vitest";
import { clampFooterColumns, resolveHeaderCtas } from "./tenantTheme";

describe("resolveHeaderCtas", () => {
  // The whole reason this function exists. Every live tenant predates `ctas`
  // and is still on showCta/ctaLabel; they must render exactly as before.
  it("synthesises a CTA from the legacy fields when ctas is absent", () => {
    expect(resolveHeaderCtas({ showCta: true, ctaLabel: "Book a viewing" })).toEqual([
      { label: "Book a viewing", href: "/contact", style: "primary" },
    ]);
  });

  it("respects the legacy off switch", () => {
    expect(resolveHeaderCtas({ showCta: false, ctaLabel: "Ignored" })).toEqual([]);
  });

  it("defaults the label when the legacy label is blank", () => {
    expect(resolveHeaderCtas({ showCta: true, ctaLabel: "   " })[0].label)
      .toBe("Request Invitation");
  });

  it("treats a completely absent config as the historical default", () => {
    expect(resolveHeaderCtas(undefined)).toHaveLength(1);
    expect(resolveHeaderCtas(null)).toHaveLength(1);
    expect(resolveHeaderCtas({})).toHaveLength(1);
  });

  // Absent and empty must NOT be conflated: an empty array is a deliberate
  // "no CTA", whereas absent means "fall back to the legacy fields".
  it("distinguishes an absent ctas array from an empty one", () => {
    expect(resolveHeaderCtas({ showCta: true, ctaLabel: "Legacy" })).toHaveLength(1);
    expect(resolveHeaderCtas({ ctas: [], showCta: true, ctaLabel: "Legacy" })).toEqual([]);
  });

  it("prefers ctas over the legacy fields when both exist", () => {
    const ctas = [{ label: "New", href: "/new" }];
    expect(resolveHeaderCtas({ ctas, showCta: true, ctaLabel: "Old" })).toEqual(ctas);
  });

  it("caps the number of CTAs so the header cannot be overloaded", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ label: `C${i}`, href: "/x" }));
    expect(resolveHeaderCtas({ ctas: many })).toHaveLength(3);
  });
});

describe("clampFooterColumns", () => {
  it("clamps to a renderable range", () => {
    expect(clampFooterColumns(1)).toBe(2);
    expect(clampFooterColumns(9)).toBe(4);
    expect(clampFooterColumns(3)).toBe(3);
  });

  it("falls back for missing or nonsense values", () => {
    for (const value of [undefined, null, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clampFooterColumns(value as number)).toBe(3);
    }
  });

  it("rounds fractional values", () => {
    expect(clampFooterColumns(2.4)).toBe(2);
    expect(clampFooterColumns(3.6)).toBe(4);
  });
});
