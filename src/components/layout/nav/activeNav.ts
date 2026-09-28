/**
 * Which header nav item represents the page the visitor is on.
 *
 * Pure on purpose: the previous version lived inside SiteHeader and fell back
 * to the route *section*, and every custom page's section is the catch-all
 * "home". So on `/financing` — a published page that is not in the nav — the
 * header announced "Home" as the current page (confirmed on the live demo
 * tenant, 2026-09-26). Pointing at the wrong page is worse than pointing at
 * none, so an unmatched page now highlights nothing.
 *
 * Resolution order, from the pathname only (query string and hash never
 * affect it, so a filtered inventory URL still matches Inventory):
 *
 *  1. A nav item whose slug is the whole path (custom pages, incl. nested).
 *  2. A built-in section when the first segment is one of the app's routes —
 *     `/vehicles/:id` → vehicles, `/products/:id` → products,
 *     `/showcase/experience` → showcase, and `/` (the gate) → home.
 *  3. A nav item whose slug is the first segment (a nested custom page).
 *
 * The result is only ever a key that exists in `items`; otherwise null.
 */

/** App routes whose sub-paths belong to one section. */
const SECTION_BY_FIRST_SEGMENT: Readonly<Record<string, string>> = {
  "": "home",
  home: "home",
  products: "products",
  vehicles: "vehicles",
  showcase: "showcase",
  contact: "contact",
  account: "account",
};

export function normalizeNavPath(pathname: string): string {
  const [path = ""] = pathname.split(/[?#]/, 1);
  return path.replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
}

export function deriveActiveNavKey(
  pathname: string,
  items: readonly { screen: string }[],
): string | null {
  const keys = new Set(items.map((item) => item.screen.toLowerCase()));
  const original = new Map(items.map((item) => [item.screen.toLowerCase(), item.screen]));
  const path = normalizeNavPath(pathname);
  const [first = ""] = path.split("/");

  if (path && keys.has(path)) return original.get(path) ?? null;

  const section = SECTION_BY_FIRST_SEGMENT[first];
  if (section !== undefined) return keys.has(section) ? (original.get(section) ?? null) : null;

  return keys.has(first) ? (original.get(first) ?? null) : null;
}
