import { useEffect, type RefObject } from "react";

/**
 * The header offset for a page scrolled `scrollTop` px: it moves up with the
 * content until it has left the screen, like any other part of the page.
 */
export function unpinnedHeaderOffset(scrollTop: number, headerHeight: number): number {
  if (!Number.isFinite(scrollTop) || scrollTop <= 0) return 0;
  return Math.min(scrollTop, Math.max(0, headerHeight));
}

/**
 * Makes an un-pinned header ("Keep the header pinned while scrolling" off)
 * actually scroll away.
 *
 * Public pages scroll inside their own container, not the document, so a
 * header that is merely not `position: fixed` still never moves — the setting
 * had no visible effect. This follows the page's scroll container instead:
 * only a scroller that holds the page's <main> counts (carousels, menus and
 * other inner scrollers are ignored), and the offset resets on every page.
 */
export function useUnpinnedHeader(
  headerRef: RefObject<HTMLElement | null>,
  pinned: boolean,
  pageKey: string,
): void {
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    header.style.transform = "";
    if (pinned) return;

    const apply = (scroller: Element | null) => {
      if (!scroller) return;
      const offset = unpinnedHeaderOffset(scroller.scrollTop, header.offsetHeight);
      header.style.transform = offset ? `translateY(-${offset}px)` : "";
    };
    const onScroll = (event: Event) => {
      const target = event.target;
      apply(
        target === document || target === window
          ? document.scrollingElement
          : target instanceof Element && target.querySelector("main")
            ? target
            : null,
      );
    };

    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    // The setting arrives after the page may already be scrolled (it loads
    // with the tenant's header config), so match the current position now.
    apply(findPageScroller());
    return () => {
      document.removeEventListener("scroll", onScroll, { capture: true });
      header.style.transform = "";
    };
  }, [headerRef, pinned, pageKey]);
}

/** The element that scrolls the current page: the nearest scrollable ancestor of <main>. */
function findPageScroller(): Element | null {
  let node: Element | null = document.querySelector("main");
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (/(auto|scroll)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return document.scrollingElement;
}
