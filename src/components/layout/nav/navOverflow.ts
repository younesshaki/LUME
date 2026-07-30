/**
 * How many header nav items fit, and what spills into the "More" menu.
 *
 * Kept as a pure function on purpose. The header's previous failure mode was a
 * layout bug — the nav was absolutely positioned and centre-translated, so the
 * logo and action cluster reserved no space for it and more tabs simply
 * overlapped them. Geometry that decides whether something fits belongs in a
 * function that can be asserted directly, not inferred from a rendered DOM.
 *
 * The caller measures; this decides. Nothing here touches the document.
 */

export type NavOverflowInput = {
  /** Usable width of the nav track, in px. */
  containerWidth: number;
  /** Natural width of each item, in nav order. */
  itemWidths: readonly number[];
  /** Width of the "More" trigger, only reserved when it is actually needed. */
  moreTriggerWidth: number;
  /** Horizontal gap between items, in px. */
  gap: number;
};

export type NavOverflowResult = {
  /** How many leading items to render inline. */
  visibleCount: number;
  /** Whether a "More" trigger must be rendered. */
  hasOverflow: boolean;
};

/**
 * Decide the inline/overflow split.
 *
 * Two details that are easy to get wrong and are covered by tests:
 *
 *  - The "More" trigger only costs width when it exists. Reserving it
 *    unconditionally hides an item that would otherwise have fit, which looks
 *    like a bug to the dealer who configured exactly six tabs.
 *  - Showing a "More" menu containing a single item is worse than showing that
 *    item, so a one-item overflow is only accepted when the item genuinely
 *    could not fit even with the trigger's width returned to the track.
 */
export function computeNavOverflow({
  containerWidth,
  itemWidths,
  moreTriggerWidth,
  gap,
}: NavOverflowInput): NavOverflowResult {
  const count = itemWidths.length;
  if (count === 0) return { visibleCount: 0, hasOverflow: false };

  // Unmeasured (0 width, e.g. first paint before layout) must not collapse the
  // nav to nothing — render everything and let the next measurement correct it.
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { visibleCount: count, hasOverflow: false };
  }

  const widthOf = (n: number): number => {
    if (n <= 0) return 0;
    let total = 0;
    for (let i = 0; i < n; i += 1) total += itemWidths[i] ?? 0;
    return total + gap * (n - 1);
  };

  // Everything fits: no trigger, no reserved width.
  if (widthOf(count) <= containerWidth) {
    return { visibleCount: count, hasOverflow: false };
  }

  // Otherwise the trigger is required, so it costs width from here on.
  const budget = containerWidth - moreTriggerWidth - gap;
  let visibleCount = 0;
  for (let n = 1; n <= count; n += 1) {
    if (widthOf(n) <= budget) visibleCount = n;
    else break;
  }

  // A "More" menu holding one item is pointless churn. Prefer dropping the
  // trigger and letting that last item sit inline if it can.
  if (visibleCount === count - 1 && widthOf(count) <= containerWidth) {
    return { visibleCount: count, hasOverflow: false };
  }

  return { visibleCount, hasOverflow: true };
}

/**
 * Split nav items into inline and overflow, keeping the active item inline.
 *
 * If the page you are currently on collapses into "More", the header stops
 * telling you where you are — the active indicator has nothing to attach to.
 * So when the active item falls past the cut, it swaps into the last visible
 * slot and the item it displaces moves into the menu instead.
 *
 * Order is otherwise preserved. Both navs share this: the gooey nav in
 * particular queries `<li>` positions by index, so the rendered list and the
 * computed active index have to agree or the particle effect anchors to the
 * wrong tab.
 */
export function splitNavForOverflow<T extends { screen: string }>(
  items: readonly T[],
  visibleCount: number,
  activeScreen: string,
): { visible: T[]; overflow: T[] } {
  const clamped = Math.max(0, Math.min(visibleCount, items.length));
  const visible = items.slice(0, clamped);
  const overflow = items.slice(clamped);

  const activeInOverflow = overflow.findIndex((item) => item.screen === activeScreen);
  // Nothing to do when the active item is already inline, or when there is no
  // inline slot to trade with.
  if (activeInOverflow === -1 || visible.length === 0) {
    return { visible, overflow };
  }

  const displaced = visible[visible.length - 1];
  visible[visible.length - 1] = overflow[activeInOverflow];
  overflow[activeInOverflow] = displaced;
  return { visible, overflow };
}
