/**
 * Public header navigation data: the tenant's published pages (via the
 * anon-safe list_published_nav_pages RPC from migration 025), capped by the
 * tenant's theme.header config. Falls back to null on any failure so the
 * header can keep its hardcoded default nav.
 */
import {
  resolveHeaderCtas,
  DEFAULT_TENANT_THEME,
  selectHeaderNav,
  type NavPageEntry,
  type TenantHeaderCta,
  type TenantHeaderVariant,
} from "@lume/types";
import { isSupabaseConfigured, supabase } from "./supabase";
import { publicTenantSlug, resolveTenantId } from "./publicTenant";
import { loadTenantTheme } from "./tenantTheme";

export type PublicNavEntry = NavPageEntry & {
  /** True when the slug has a dedicated cinematic route/screen. */
  isScreen: boolean;
};

/** Slugs with dedicated cinematic routes (see App.tsx / SiteScreen). */
export const SCREEN_SLUGS = ["home", "products", "vehicles", "showcase", "contact"] as const;

export function isScreenSlug(slug: string): boolean {
  return (SCREEN_SLUGS as readonly string[]).includes(slug);
}

export type PublicHeaderConfig = {
  /** Retained so existing consumers keep compiling; derived from `ctas`. */
  showCta: boolean;
  ctaLabel: string;
  variant: TenantHeaderVariant;
  logoPlacement: "left" | "centre";
  sticky: boolean;
  showVisitorTab: boolean;
  ctas: TenantHeaderCta[];
};

const HEADER_DEFAULTS: PublicHeaderConfig = {
  showCta: DEFAULT_TENANT_THEME.header.showCta,
  ctaLabel: DEFAULT_TENANT_THEME.header.ctaLabel,
  // `centred` is the historical arrangement, so an unconfigured tenant is
  // untouched by the introduction of variants.
  variant: "centred",
  logoPlacement: "left",
  sticky: true,
  showVisitorTab: true,
  ctas: [
    {
      label: DEFAULT_TENANT_THEME.header.ctaLabel,
      href: "/contact",
      style: "primary",
    },
  ],
};

const navCache = new Map<string, Promise<PublicNavEntry[] | null>>();

export async function loadPublishedNav(
  slug = publicTenantSlug
): Promise<PublicNavEntry[] | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug || !isSupabaseConfigured) return null;

  const cached = navCache.get(normalizedSlug);
  if (cached) return cached;

  const lookup = lookupPublishedNav(normalizedSlug);
  navCache.set(normalizedSlug, lookup);
  return lookup;
}

async function lookupPublishedNav(slug: string): Promise<PublicNavEntry[] | null> {
  try {
    const tenantId = await resolveTenantId(slug);
    if (!tenantId) return null;

    const [{ data, error }, theme] = await Promise.all([
      supabase.rpc("list_published_nav_pages", { p_tenant_id: tenantId }),
      loadTenantTheme(slug),
    ]);
    if (error) throw new Error(error.message);

    const pages: NavPageEntry[] = (data ?? []).map(
      (row: { slug: string; title: string; nav_order: number }) => ({
        slug: row.slug,
        title: row.title,
        navOrder: row.nav_order,
      })
    );
    if (pages.length === 0) return null;

    const { visible } = selectHeaderNav(pages, theme.header);
    return visible.map((page) => ({ ...page, isScreen: isScreenSlug(page.slug) }));
  } catch (error) {
    console.warn("[publicNav] falling back to default nav", error);
    return null;
  }
}

export async function loadHeaderConfig(slug = publicTenantSlug): Promise<PublicHeaderConfig> {
  try {
    const theme = await loadTenantTheme(slug);
    // resolveHeaderCtas owns the legacy bridge: when `ctas` is absent it
    // synthesises one from showCta/ctaLabel, so a tenant that never opens the
    // new UI renders identically.
    const ctas = resolveHeaderCtas(theme.header, HEADER_DEFAULTS.ctaLabel);
    return {
      showCta: ctas.length > 0,
      ctaLabel: ctas[0]?.label ?? HEADER_DEFAULTS.ctaLabel,
      variant: theme.header?.variant ?? HEADER_DEFAULTS.variant,
      logoPlacement: theme.header?.logoPlacement ?? HEADER_DEFAULTS.logoPlacement,
      sticky: theme.header?.sticky ?? HEADER_DEFAULTS.sticky,
      showVisitorTab: theme.header?.showVisitorTab ?? HEADER_DEFAULTS.showVisitorTab,
      ctas,
    };
  } catch {
    return HEADER_DEFAULTS;
  }
}

export function clearPublicNavCacheForTests(): void {
  navCache.clear();
}
