import {
  getTenantSiteDesignStyles,
  TenantSiteDesignStyles,
  tenantThemeToCssVariables,
  setCssValue,
  safeCssValue,
  normalizeIntensity,
} from "@lume/blocks/theme-styles";
export {
  getTenantSiteDesignStyles,
  tenantThemeToCssVariables,
} from "@lume/blocks/theme-styles";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import {
  getSiteTemplate,
  normalizeSiteDesign,
  resolveModeBackground,
  siteDesignToTenantTheme,
  type SiteDesign,
  type SiteMode,
  type TenantDockVariant,
  type TenantTheme,
} from "@lume/types";
import { publicTenantSlug } from "./publicTenant";
import { isSupabaseConfigured, supabase } from "./supabase";

export type { TenantDockVariant, TenantTheme };

type ThemeLookupClient = Pick<SupabaseClient<Database>, "rpc">;

const themeCache = new Map<string, Promise<SiteDesign>>();
export const TENANT_THEME_CSS_VARIABLES = [
  "--theme-lume-ink",
  "--theme-lume-muted",
  "--theme-lume-soft",
  "--theme-lume-line",
  "--theme-lume-gold",
  "--theme-lume-background",
  "--theme-lume-panel",
  "--theme-experience-font-family",
  "--theme-body-font-family",
  "--lume-cinematic-intensity",
  "--lume-dock-item-bg",
  "--lume-dock-item-color",
  "--lume-dock-item-border",
  "--theme-site-background-image",
  "--theme-site-background-position",
  "--theme-site-background-size",
  "--theme-site-background-overlay",
] as const;

/**
 * Read the public tenant theme through the anon-safe RPC added by migration 019.
 * If the migration is not applied yet, the RPC error is treated as "no theme".
 */
export async function loadTenantSiteDesign(
  slug = publicTenantSlug,
  client: ThemeLookupClient = supabase,
): Promise<SiteDesign> {
  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug || (!isSupabaseConfigured && client === supabase)) {
    return normalizeSiteDesign(null, getSiteTemplate("luxury"));
  }

  const cached = themeCache.get(normalizedSlug);
  if (cached) return cached;

  const lookup = lookupTenantTheme(normalizedSlug, client);
  themeCache.set(normalizedSlug, lookup);
  return lookup;
}

/**
 * Compatibility read for consumers that only need shared/header/branding data.
 * Visual rendering should use loadTenantSiteDesign + applyTenantSiteDesign.
 */
export async function loadTenantTheme(
  slug = publicTenantSlug,
  client: ThemeLookupClient = supabase,
): Promise<TenantTheme> {
  const design = await loadTenantSiteDesign(slug, client);
  return siteDesignToTenantTheme(
    design,
    getSiteTemplate(design.template.key),
    "dark",
  );
}

export function applyTenantTheme(
  theme: TenantTheme,
  root: HTMLElement = document.documentElement,
): void {
  for (const variable of TENANT_THEME_CSS_VARIABLES)
    root.style.removeProperty(variable);

  const variables = tenantThemeToCssVariables(theme);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  const dockVariant = normalizeDockVariant(
    theme.dockVariant ?? theme.dock?.variant,
  );
  if (dockVariant) {
    root.dataset.lumeDockVariant = dockVariant;
  } else {
    delete root.dataset.lumeDockVariant;
  }

  delete root.dataset.lumeTemplate;
  delete root.dataset.lumeTemplateLayout;
  delete root.dataset.lumeTemplateSpecialty;
  applyTenantFavicons(theme, root.ownerDocument);
}

/** Apply one resolved website mode without loading the inactive background. */
export function applyTenantSiteDesign(
  design: SiteDesign,
  mode: SiteMode,
  root: HTMLElement = document.documentElement,
): TenantTheme {
  const styles = getTenantSiteDesignStyles(design, mode);
  const template = getSiteTemplate(design.template.key);
  applyTenantTheme(styles.theme, root);
  applyCssVariables(root, styles.variables);
  root.dataset.lumeSiteMode = mode;
  root.dataset.lumeTemplate = template.key;
  root.dataset.lumeTemplateLayout = template.visual.layout;
  root.dataset.lumeTemplateSpecialty = template.specialty;
  return styles.theme;
}

export function applyTenantFavicons(
  theme: TenantTheme,
  target: Document = document,
): void {
  target
    .querySelectorAll("link[data-lume-tenant-favicon]")
    .forEach((link) => link.remove());
  let applied = false;
  for (const [size, href] of [
    ["32x32", theme.branding?.favicon32Url],
    ["192x192", theme.branding?.favicon192Url],
  ] as const) {
    const safeHref = safePublicAssetUrl(href);
    if (!safeHref) continue;
    const link = target.createElement("link");
    link.rel = "icon";
    link.setAttribute("sizes", size);
    link.href = safeHref;
    link.dataset.lumeTenantFavicon = "true";
    target.head.append(link);
    applied = true;
  }
  // index.html's LUME icon has no size, so browsers may still pick it over the
  // tenant's; switch it off while the tenant has its own and back on otherwise.
  target
    .querySelectorAll<HTMLLinkElement>("link[data-lume-default-favicon]")
    .forEach((link) => {
      link.rel = applied ? "lume-default-icon" : "icon";
    });
}

export function clearTenantThemeCacheForTests(): void {
  themeCache.clear();
}

async function lookupTenantTheme(
  slug: string,
  client: ThemeLookupClient,
): Promise<SiteDesign> {
  const { data, error } = await client.rpc("get_tenant_theme", {
    p_slug: slug,
  });
  if (error) {
    console.warn("[theme] get_tenant_theme RPC failed; using defaults", error);
    themeCache.delete(slug);
    return normalizeSiteDesign(null, getSiteTemplate("luxury"));
  }

  const raw = data?.[0]?.theme;
  const templateKey = readTemplateKey(raw);
  return normalizeSiteDesign(raw, getSiteTemplate(templateKey));
}

function readTemplateKey(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.template)) return undefined;
  return typeof value.template.key === "string"
    ? value.template.key
    : undefined;
}

function normalizeTenantTheme(value: unknown): TenantTheme {
  if (!isRecord(value)) return {};

  const colors = isRecord(value.colors) ? value.colors : {};
  const fonts = isRecord(value.fonts) ? value.fonts : {};
  const dock = isRecord(value.dock) ? value.dock : {};
  const cinematic = isRecord(value.cinematic) ? value.cinematic : {};
  const vehiclePricing = isRecord(value.vehiclePricing)
    ? value.vehiclePricing
    : {};
  const branding = isRecord(value.branding) ? value.branding : {};

  return {
    colors: {
      ink: safeCssValue(colors.ink),
      muted: safeCssValue(colors.muted),
      soft: safeCssValue(colors.soft),
      line: safeCssValue(colors.line),
      gold: safeCssValue(colors.gold),
      background: safeCssValue(colors.background),
      panel: safeCssValue(colors.panel),
      dockItemBackground: safeCssValue(colors.dockItemBackground),
      dockItemColor: safeCssValue(colors.dockItemColor),
      dockItemBorder: safeCssValue(colors.dockItemBorder),
    },
    fonts: {
      experience: safeCssValue(fonts.experience),
      body: safeCssValue(fonts.body),
    },
    dockVariant: normalizeDockVariant(value.dockVariant),
    dock: {
      variant: normalizeDockVariant(dock.variant),
    },
    cinematicIntensity:
      normalizeIntensity(value.cinematicIntensity) ?? undefined,
    cinematic: {
      intensity: normalizeIntensity(cinematic.intensity) ?? undefined,
    },
    vehiclePricing: {
      showPriceReductionSignal:
        vehiclePricing.showPriceReductionSignal === true,
    },
    branding: {
      logoUrl: safePublicAssetUrl(branding.logoUrl),
      favicon32Url: safePublicAssetUrl(branding.favicon32Url),
      favicon192Url: safePublicAssetUrl(branding.favicon192Url),
    },
  };
}

function applyCssVariables(
  root: HTMLElement,
  variables: Record<string, string>,
): void {
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
}

function safePublicAssetUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:"
      ? trimmed
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDockVariant(value: unknown): TenantDockVariant | undefined {
  return value === "default" ||
    value === "minimal" ||
    value === "floating" ||
    value === "hidden"
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type {TenantSiteDesignStyles} from "@lume/blocks/theme-styles";
