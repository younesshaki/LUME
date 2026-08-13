/**
 * Shared header-navigation selection: which published pages make it into the
 * public site's header, and which overflow. Used by the Vite header (to
 * render) and the admin Navigation section (to preview) so both always agree.
 */
import type { TenantHeaderConfig } from "./tenantTheme";

export type NavPageEntry = {
  slug: string;
  title: string;
  navOrder: number;
};

export type HeaderNavSelection = {
  /** Pages rendered in the header, in nav order. */
  visible: NavPageEntry[];
  /** Published pages beyond maxNavItems (still reachable by URL / mobile menu). */
  overflow: NavPageEntry[];
};

export const HEADER_NAV_LIMITS = { min: 1, max: 10, fallback: 6 } as const;

/**
 * Published pages that are templates, not destinations, and must never appear
 * in navigation.
 *
 * `vehicle` is the vehicle-detail *layout*: publishing it changes how every
 * `/vehicles/:id` page renders. It is not a page a visitor can navigate to, and
 * `list_published_nav_pages` returns every published page indiscriminately — so
 * without this filter a dealer who customized their VDP would get a dead
 * "Vehicle" tab in their header.
 *
 * Filtered here rather than in either consumer because this module is the
 * documented point where the public header and the admin Navigation preview
 * agree. Excluding it in only one of them would make the preview lie.
 */
export const NON_NAV_PAGE_SLUGS: readonly string[] = ["vehicle"];

export function isNavigablePageSlug(slug: string): boolean {
  return !NON_NAV_PAGE_SLUGS.includes(slug.trim().toLowerCase());
}

/** Clamp a configured max-items value to something the header can render. */
export function clampMaxNavItems(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return HEADER_NAV_LIMITS.fallback;
  }
  return Math.min(HEADER_NAV_LIMITS.max, Math.max(HEADER_NAV_LIMITS.min, Math.round(value)));
}

export function selectHeaderNav(
  pages: readonly NavPageEntry[],
  header: TenantHeaderConfig | null | undefined
): HeaderNavSelection {
  const maxItems = clampMaxNavItems(header?.maxNavItems);
  // Drop template pages before counting, so a published VDP layout neither
  // shows up as a tab nor silently consumes one of the tenant's nav slots.
  const ordered = pages
    .filter((page) => isNavigablePageSlug(page.slug))
    .sort((a, b) => a.navOrder - b.navOrder || a.title.localeCompare(b.title));
  return {
    visible: ordered.slice(0, maxItems),
    overflow: ordered.slice(maxItems),
  };
}
