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
  /** Reserve More for pages deliberately placed there by tenant settings. */
  forceOverflow?: boolean;
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
  forceOverflow = false,
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
  if (!forceOverflow && widthOf(count) <= containerWidth) {
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
  if (!forceOverflow && visibleCount === count - 1 && widthOf(count) <= containerWidth) {
    return { visibleCount: count, hasOverflow: false };
  }

  return { visibleCount, hasOverflow: true };
}

/**
 * Split nav items into inline and overflow, keeping a responsively-overflowed
 * active item inline.
 *
 * If the page you are currently on collapses into "More", the header stops
 * telling you where you are — the active indicator has nothing to attach to.
 * So when the active item falls past the responsive cut, it swaps into the
 * last visible slot and the item it displaces moves into the menu instead.
 * Pages marked `headerOverflow` are intentionally kept in More by the
 * tenant's configured limit; the More trigger itself carries their active
 * state rather than silently defeating that limit.
 *
 * Order is otherwise preserved. Both navs share this: the gooey nav in
 * particular queries `<li>` positions by index, so the rendered list and the
 * computed active index have to agree or the particle effect anchors to the
 * wrong tab.
 */
export function splitNavForOverflow<T extends { screen: string; headerOverflow?: boolean }>(
  items: readonly T[],
  visibleCount: number,
  activeScreen: string,
): { visible: T[]; overflow: T[] } {
  const configuredVisible = items.filter((item) => !item.headerOverflow);
  const configuredOverflow = items.filter((item) => item.headerOverflow);
  const clamped = Math.max(0, Math.min(visibleCount, configuredVisible.length));
  const visible = configuredVisible.slice(0, clamped);
  const overflow = configuredVisible.slice(clamped);

  const activeInOverflow = overflow.findIndex((item) => item.screen === activeScreen);
  // Nothing to do when the active item is already inline, or when there is no
  // inline slot to trade with.
  if (activeInOverflow === -1 || visible.length === 0) {
    return { visible, overflow: [...overflow, ...configuredOverflow] };
  }

  const displaced = visible[visible.length - 1];
  visible[visible.length - 1] = overflow[activeInOverflow];
  overflow[activeInOverflow] = displaced;
  return { visible, overflow: [...overflow, ...configuredOverflow] };
}

export type OverflowPanelInput = {
  /** The "More" trigger's viewport rect. */
  trigger: { bottom: number; right: number };
  /** The panel's rendered width (its min-width before it has rendered). */
  panelWidth: number;
  viewportWidth: number;
  /** Space kept between the panel and the viewport edge, in px. */
  edge?: number;
  /** Space between the trigger and the panel, in px. */
  offset?: number;
};

/**
 * Where the "More" panel opens.
 *
 * It right-aligns to the trigger, which suits a trigger at the right of the
 * nav. With a centred logo the nav sits at the left, and the minimal variant
 * collapses it to the trigger alone — then a right-aligned panel opened past
 * the viewport's left edge and its first items could not be clicked (A1
 * matrix, 2026-09-26). The panel now shifts right just enough to stay inside
 * the viewport.
 */
export function overflowPanelPosition({
  trigger,
  panelWidth,
  viewportWidth,
  edge = 8,
  offset = 12,
}: OverflowPanelInput): { top: number; left: number } {
  const preferred = trigger.right - panelWidth;
  const max = Math.max(edge, viewportWidth - edge - panelWidth);
  return { top: trigger.bottom + offset, left: Math.min(Math.max(preferred, edge), max) };
}
