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
  /** Published pages beyond maxNavItems: the header's "More" menu. */
  overflow: NavPageEntry[];
  /** Published pages the tenant keeps out of navigation (still live by URL). */
  hidden: NavPageEntry[];
};

/** Where a published page appears in the site's navigation. */
export type NavPlacement = "header" | "more" | "hidden";

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

/** Normalised hidden-page slugs from a stored header config. */
export function hiddenNavSlugs(header: TenantHeaderConfig | null | undefined): Set<string> {
  const raw = Array.isArray(header?.hiddenNavSlugs) ? header.hiddenNavSlugs : [];
  return new Set(
    raw.filter((slug): slug is string => typeof slug === "string").map((slug) => slug.trim().toLowerCase()),
  );
}

/**
 * The one rule for where a published page appears: hidden pages first come
 * out, then the first `maxNavItems` go in the header and the rest in "More".
 * The public site (publicNav.ts) and the admin Pages list and Navigation
 * section all call this, so the admin can never describe a different nav from
 * the one visitors get.
 *
 * On a narrow screen the desktop header may additionally move trailing header
 * items into "More" when they do not fit (navOverflow.ts measures that in the
 * visitor's browser); that depends on the visitor's screen, not on settings.
 */
export function selectHeaderNav(
  pages: readonly NavPageEntry[],
  header: TenantHeaderConfig | null | undefined
): HeaderNavSelection {
  const maxItems = clampMaxNavItems(header?.maxNavItems);
  const hiddenSlugs = hiddenNavSlugs(header);
  // Drop template pages before counting, so a published VDP layout neither
  // shows up as a tab nor silently consumes one of the tenant's nav slots.
  const ordered = pages
    .filter((page) => isNavigablePageSlug(page.slug))
    .sort((a, b) => a.navOrder - b.navOrder || a.title.localeCompare(b.title));
  // Hidden pages are removed before counting, so hiding one lets the next
  // page move up from "More" into the header.
  const shown = ordered.filter((page) => !hiddenSlugs.has(page.slug.toLowerCase()));
  return {
    visible: shown.slice(0, maxItems),
    overflow: shown.slice(maxItems),
    hidden: ordered.filter((page) => hiddenSlugs.has(page.slug.toLowerCase())),
  };
}

/** Placement of every navigable published page, keyed by slug. */
export function navPlacements(
  pages: readonly NavPageEntry[],
  header: TenantHeaderConfig | null | undefined
): Map<string, NavPlacement> {
  const { visible, overflow, hidden } = selectHeaderNav(pages, header);
  return new Map<string, NavPlacement>([
    ...visible.map((page) => [page.slug, "header"] as const),
    ...overflow.map((page) => [page.slug, "more"] as const),
    ...hidden.map((page) => [page.slug, "hidden"] as const),
  ]);
}

/**
 * The pages the live site's navigation is built from — published and not
 * archived, exactly what `list_published_nav_pages` returns — for callers
 * that hold full page rows (the admin).
 */
export function livePagesForNav(
  pages: readonly { slug: string; title: string; navOrder: number; publishedRevisionId: string | null; archivedAt: string | null }[]
): NavPageEntry[] {
  return pages
    .filter((page) => page.publishedRevisionId && !page.archivedAt)
    .map(({ slug, title, navOrder }) => ({ slug, title, navOrder }));
}

/** The header config with one page shown in, or hidden from, navigation. */
export function withPageNavVisibility(
  header: TenantHeaderConfig | null | undefined,
  slug: string,
  visible: boolean
): TenantHeaderConfig {
  const key = slug.trim().toLowerCase();
  const next = hiddenNavSlugs(header);
  if (visible) next.delete(key);
  else next.add(key);
  return { ...(header ?? {}), hiddenNavSlugs: [...next].sort() };
}
