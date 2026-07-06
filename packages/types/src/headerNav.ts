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
  const ordered = [...pages].sort(
    (a, b) => a.navOrder - b.navOrder || a.title.localeCompare(b.title)
  );
  return {
    visible: ordered.slice(0, maxItems),
    overflow: ordered.slice(maxItems),
  };
}
