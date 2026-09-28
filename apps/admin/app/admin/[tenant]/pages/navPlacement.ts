import {
  livePagesForNav,
  navPlacements,
  type NavPlacement,
  type Page,
  type TenantHeaderConfig,
} from "@lume/types";

/** A page's navigation state as the Pages list shows it. */
export type PageNavState = NavPlacement | "not-live";

/**
 * Nav state for every page in the list, from the shared rule the live site
 * uses (selectHeaderNav via navPlacements). Pages that are not published, or
 * are archived, are not on the site at all, so they are "not-live" rather
 * than claiming a nav position.
 */
export function pageNavStates(
  pages: readonly Page[],
  header: TenantHeaderConfig | null | undefined,
): Map<string, PageNavState> {
  const placements = navPlacements(livePagesForNav(pages), header);
  return new Map(pages.map((page) => [page.id, placements.get(page.slug) ?? "not-live"]));
}

export const NAV_STATE_LABEL: Record<PageNavState, string> = {
  header: "In header",
  more: "In More",
  hidden: "Hidden from nav",
  "not-live": "Not live",
};

export const NAV_STATE_HINT: Record<PageNavState, string> = {
  header: "Shown directly in the site header.",
  more: "Shown in the header's More menu.",
  hidden: "Live and reachable by its URL, but not in the header, More menu or footer.",
  "not-live": "Not published (or archived), so it is not on the site.",
};
