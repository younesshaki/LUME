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
const THEME_CSS_VARIABLES = [
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
  client: ThemeLookupClient = supabase
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
  client: ThemeLookupClient = supabase
): Promise<TenantTheme> {
  const design = await loadTenantSiteDesign(slug, client);
  return siteDesignToTenantTheme(design, getSiteTemplate(design.template.key), "dark");
}

export function applyTenantTheme(
  theme: TenantTheme,
  root: HTMLElement = document.documentElement
): void {
  for (const variable of THEME_CSS_VARIABLES) root.style.removeProperty(variable);

  const variables = tenantThemeToCssVariables(theme);
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }

  const dockVariant = normalizeDockVariant(theme.dockVariant ?? theme.dock?.variant);
  if (dockVariant) {
    root.dataset.lumeDockVariant = dockVariant;
  } else {
    delete root.dataset.lumeDockVariant;
  }

  applyTenantFavicons(theme, root.ownerDocument);
}

/** Apply one resolved website mode without loading the inactive background. */
export function applyTenantSiteDesign(
  design: SiteDesign,
  mode: SiteMode,
  root: HTMLElement = document.documentElement
): TenantTheme {
  const template = getSiteTemplate(design.template.key);
  const theme = siteDesignToTenantTheme(design, template, mode);
  applyTenantTheme(theme, root);

  const background = resolveModeBackground(design, template, mode);
  if (background?.url) {
    root.style.setProperty("--theme-site-background-image", `url(${JSON.stringify(background.url)})`);
  }
  root.style.setProperty("--theme-site-background-position", background?.position ?? "center");
  root.style.setProperty("--theme-site-background-size", background?.size ?? "cover");
  const opacity = background?.overlayOpacity ?? (mode === "dark" ? 0.42 : 0.12);
  const overlayColor = background?.overlayColor ?? (mode === "dark" ? "#000" : "#f4efe5");
  root.style.setProperty(
    "--theme-site-background-overlay",
    `color-mix(in srgb, ${overlayColor} ${Math.round(opacity * 100)}%, transparent)`
  );
  root.dataset.lumeSiteMode = mode;
  return theme;
}

export function applyTenantFavicons(theme: TenantTheme, target: Document = document): void {
  target.querySelectorAll("link[data-lume-tenant-favicon]").forEach((link) => link.remove());
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
  }
}

export function clearTenantThemeCacheForTests(): void {
  themeCache.clear();
}

export function tenantThemeToCssVariables(theme: TenantTheme): Record<string, string> {
  const variables: Record<string, string> = {};
  const colors = theme.colors ?? {};
  setCssValue(variables, "--theme-lume-ink", colors.ink);
  setCssValue(variables, "--theme-lume-muted", colors.muted);
  setCssValue(variables, "--theme-lume-soft", colors.soft);
  setCssValue(variables, "--theme-lume-line", colors.line);
  setCssValue(variables, "--theme-lume-gold", colors.gold);
  setCssValue(variables, "--theme-lume-background", colors.background);
  setCssValue(variables, "--theme-lume-panel", colors.panel);
  setCssValue(variables, "--lume-dock-item-bg", colors.dockItemBackground);
  setCssValue(variables, "--lume-dock-item-color", colors.dockItemColor);
  setCssValue(variables, "--lume-dock-item-border", colors.dockItemBorder);
  setCssValue(variables, "--theme-experience-font-family", theme.fonts?.experience);
  setCssValue(variables, "--theme-body-font-family", theme.fonts?.body);

  const intensity = normalizeIntensity(theme.cinematicIntensity ?? theme.cinematic?.intensity);
  if (intensity !== null) variables["--lume-cinematic-intensity"] = String(intensity);

  return variables;
}

async function lookupTenantTheme(slug: string, client: ThemeLookupClient): Promise<SiteDesign> {
  const { data, error } = await client.rpc("get_tenant_theme", { p_slug: slug });
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
  return typeof value.template.key === "string" ? value.template.key : undefined;
}

function normalizeTenantTheme(value: unknown): TenantTheme {
  if (!isRecord(value)) return {};

  const colors = isRecord(value.colors) ? value.colors : {};
  const fonts = isRecord(value.fonts) ? value.fonts : {};
  const dock = isRecord(value.dock) ? value.dock : {};
  const cinematic = isRecord(value.cinematic) ? value.cinematic : {};
  const vehiclePricing = isRecord(value.vehiclePricing) ? value.vehiclePricing : {};
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
    cinematicIntensity: normalizeIntensity(value.cinematicIntensity) ?? undefined,
    cinematic: {
      intensity: normalizeIntensity(cinematic.intensity) ?? undefined,
    },
    vehiclePricing: {
      showPriceReductionSignal: vehiclePricing.showPriceReductionSignal === true,
    },
    branding: {
      logoUrl: safePublicAssetUrl(branding.logoUrl),
      favicon32Url: safePublicAssetUrl(branding.favicon32Url),
      favicon192Url: safePublicAssetUrl(branding.favicon192Url),
    },
  };
}

function setCssValue(target: Record<string, string>, name: string, value: string | undefined) {
  const safe = safeCssValue(value);
  if (safe) target[name] = safe;
}

function safeCssValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160 || /[;{}]/.test(trimmed)) return undefined;
  return trimmed;
}

function safePublicAssetUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

function normalizeDockVariant(value: unknown): TenantDockVariant | undefined {
  return value === "default" || value === "minimal" || value === "floating" || value === "hidden"
    ? value
    : undefined;
}

function normalizeIntensity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1.5, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
