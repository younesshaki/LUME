import { describe, expect, it } from "vitest";
import { computeNavOverflow, splitNavForOverflow } from "./navOverflow";

const base = { moreTriggerWidth: 70, gap: 32 } as const;

describe("computeNavOverflow", () => {
  it("shows everything when it fits", () => {
    expect(
      computeNavOverflow({ ...base, containerWidth: 1000, itemWidths: [80, 80, 80] }),
    ).toEqual({ visibleCount: 3, hasOverflow: false });
  });

  // The regression this whole module exists for: ten tabs used to expand out of
  // an absolutely-centred nav and overlap the logo and action cluster. Now they
  // must collapse instead.
  it("collapses the tail when ten items cannot fit", () => {
    const result = computeNavOverflow({
      ...base,
      containerWidth: 400,
      itemWidths: Array.from({ length: 10 }, () => 80),
    });
    expect(result.hasOverflow).toBe(true);
    expect(result.visibleCount).toBeLessThan(10);
    expect(result.visibleCount).toBeGreaterThan(0);
  });

  it("never reports more visible items than exist", () => {
    const result = computeNavOverflow({
      ...base,
      containerWidth: 100_000,
      itemWidths: [80, 80],
    });
    expect(result.visibleCount).toBe(2);
  });

  // Reserving the trigger unconditionally would hide an item that fits, which
  // reads as a bug to a dealer who configured exactly that many tabs.
  it("does not reserve trigger width when nothing overflows", () => {
    // Two 80px items + one 32px gap = 192. Container is 200: fits without the
    // trigger, would NOT fit if 70px of trigger were reserved.
    expect(
      computeNavOverflow({ ...base, containerWidth: 200, itemWidths: [80, 80] }),
    ).toEqual({ visibleCount: 2, hasOverflow: false });
  });

  it("accounts for gaps, not just item widths", () => {
    // 3x80 = 240 of content, but 2 gaps of 32 push the true width to 304.
    const tight = computeNavOverflow({
      ...base,
      containerWidth: 250,
      itemWidths: [80, 80, 80],
    });
    expect(tight.hasOverflow).toBe(true);
  });

  it("renders everything when the container is not measured yet", () => {
    // First paint reports 0; collapsing to nothing would flash an empty nav.
    for (const containerWidth of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        computeNavOverflow({ ...base, containerWidth, itemWidths: [80, 80, 80] }),
      ).toEqual({ visibleCount: 3, hasOverflow: false });
    }
  });

  it("handles an empty nav", () => {
    expect(
      computeNavOverflow({ ...base, containerWidth: 500, itemWidths: [] }),
    ).toEqual({ visibleCount: 0, hasOverflow: false });
  });

  it("can collapse every item when the track is very narrow", () => {
    const result = computeNavOverflow({
      ...base,
      containerWidth: 60,
      itemWidths: [200, 200],
    });
    expect(result).toEqual({ visibleCount: 0, hasOverflow: true });
  });

  it("treats missing item widths as zero rather than NaN", () => {
    const result = computeNavOverflow({
      ...base,
      containerWidth: 500,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      itemWidths: [80, undefined as any, 80],
    });
    expect(Number.isFinite(result.visibleCount)).toBe(true);
    expect(result.visibleCount).toBe(3);
  });
});

describe("splitNavForOverflow", () => {
  const items = ["home", "vehicles", "financing", "trade-in", "about"].map((screen) => ({
    screen,
    label: screen,
  }));

  it("splits at the cut when the active item is already inline", () => {
    const { visible, overflow } = splitNavForOverflow(items, 3, "vehicles");
    expect(visible.map((i) => i.screen)).toEqual(["home", "vehicles", "financing"]);
    expect(overflow.map((i) => i.screen)).toEqual(["trade-in", "about"]);
  });

  // If the page you are on collapses into "More", the header stops telling you
  // where you are — and the gooey nav's indicator has no <li> to anchor to.
  it("pulls the active item inline when it would have overflowed", () => {
    const { visible, overflow } = splitNavForOverflow(items, 3, "about");
    expect(visible.map((i) => i.screen)).toContain("about");
    expect(overflow.map((i) => i.screen)).not.toContain("about");
    expect(visible).toHaveLength(3);
    expect(overflow).toHaveLength(2);
  });

  it("displaces exactly one item and loses none", () => {
    const { visible, overflow } = splitNavForOverflow(items, 3, "trade-in");
    expect([...visible, ...overflow].map((i) => i.screen).sort()).toEqual(
      items.map((i) => i.screen).sort(),
    );
  });

  it("is a no-op when everything is visible", () => {
    const { visible, overflow } = splitNavForOverflow(items, items.length, "about");
    expect(visible).toHaveLength(items.length);
    expect(overflow).toHaveLength(0);
  });

  it("handles a zero-width nav without crashing", () => {
    const { visible, overflow } = splitNavForOverflow(items, 0, "about");
    expect(visible).toHaveLength(0);
    expect(overflow).toHaveLength(items.length);
  });

  it("clamps a visibleCount beyond the list length", () => {
    const { visible, overflow } = splitNavForOverflow(items, 99, "home");
    expect(visible).toHaveLength(items.length);
    expect(overflow).toHaveLength(0);
  });

  it("tolerates an active screen that is not in the list", () => {
    const { visible, overflow } = splitNavForOverflow(items, 2, "nonexistent");
    expect(visible.map((i) => i.screen)).toEqual(["home", "vehicles"]);
    expect(overflow).toHaveLength(3);
  });
});
