/**
 * SiteDesign v2 — the versioned public-website design document.
 *
 * Canonical schema, validator, and resolution logic for the website-template
 * system (see docs/website-templates-v1.md). Runtime-safe: NO React/browser
 * imports, so both the admin app and the public Vite app consume it directly.
 *
 * The document is stored in the existing `tenants.theme` JSONB column. A
 * `schemaVersion` discriminates v2 documents from legacy flat `TenantTheme`
 * documents, which are normalized at read time — nothing is bulk-migrated.
 *
 * Ownership: the design editor owns `template`, `shared`, and `modes`. Keys it
 * does NOT own (`header` from Navigation, `branding` uploads, `vehiclePricing`,
 * and any unknown future keys) round-trip untouched.
 */
import type { TenantDockVariant, TenantHeaderConfig, TenantTheme } from "./tenantTheme";

export const SITE_DESIGN_SCHEMA_VERSION = 2 as const;

/** The finite allowlist of mode-specific asset slots. Grow deliberately. */
export const SITE_ASSET_SLOTS = ["siteBackground"] as const;
export type SiteAssetSlot = (typeof SITE_ASSET_SLOTS)[number];

export const SITE_MODES = ["dark", "light"] as const;
export type SiteMode = (typeof SITE_MODES)[number];

export const SITE_BACKGROUND_POSITIONS = ["center", "top", "bottom"] as const;
export type SiteBackgroundPosition = (typeof SITE_BACKGROUND_POSITIONS)[number];

export const SITE_BACKGROUND_SIZES = ["cover", "contain"] as const;
export type SiteBackgroundSize = (typeof SITE_BACKGROUND_SIZES)[number];

/** The 10 themeable color roles — identical set to legacy TenantTheme.colors. */
export const SITE_COLOR_KEYS = [
  "ink",
  "muted",
  "soft",
  "line",
  "gold",
  "background",
  "panel",
  "dockItemBackground",
  "dockItemColor",
  "dockItemBorder",
] as const;
export type SiteColorKey = (typeof SITE_COLOR_KEYS)[number];
export type SiteColors = Partial<Record<SiteColorKey, string>>;

export type SiteBackgroundAsset = {
  /** https/http or root-relative; tenant-owned prefix or a registry asset. */
  url?: string;
  position?: SiteBackgroundPosition;
  size?: SiteBackgroundSize;
  overlayColor?: string;
  /** 0..1. */
  overlayOpacity?: number;
};

export type SiteDesignMode = {
  colors?: SiteColors;
  assets?: {
    siteBackground?: SiteBackgroundAsset;
  };
};

export type SiteDesignShared = {
  fonts?: { experience?: string; body?: string };
  dockVariant?: TenantDockVariant;
  /** 0..1.5. */
  cinematicIntensity?: number;
};

export type SiteDesign = {
  schemaVersion: typeof SITE_DESIGN_SCHEMA_VERSION;
  template: { key: string; version: number };
  shared: SiteDesignShared;
  modes: Record<SiteMode, SiteDesignMode>;

  // Preserved verbatim on every save (not owned by the design editor):
  header?: TenantHeaderConfig;
  branding?: {
    logoUrl?: string;
    favicon32Url?: string;
    favicon192Url?: string;
  };
  vehiclePricing?: { showPriceReductionSignal?: boolean };
};

/**
 * The template defaults the normalizer/resolver fall back to. The registry
 * (siteTemplates.ts) supplies this; kept as a structural type here so this
 * module has no dependency cycle with the registry.
 */
export type SiteDesignDefaults = {
  key: string;
  version: number;
  shared: SiteDesignShared;
  modes: Record<SiteMode, SiteDesignMode>;
};

/**
 * A fresh design document for a new tenant: references the template but carries
 * NO overrides, so it resolves entirely to the template's defaults. Seeded at
 * provisioning time; keeps a new site from ever rendering unthemed without
 * duplicating any values from the registry.
 */
export function createDefaultSiteDesign(template: SiteDesignDefaults): SiteDesign {
  return {
    schemaVersion: SITE_DESIGN_SCHEMA_VERSION,
    template: { key: template.key, version: template.version },
    shared: {},
    modes: { dark: {}, light: {} },
  };
}

// ---------------------------------------------------------------------------
// Sanitizers (mirror src/lib/tenantTheme.ts so admin + public agree exactly)
// ---------------------------------------------------------------------------

const MAX_CSS_TOKEN = 160;
const MAX_URL = 2_048;

export function safeCssToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_CSS_TOKEN || /[;{}]/.test(trimmed)) return undefined;
  return trimmed;
}

export function safeAssetUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL) return undefined;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function clampCinematicIntensity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1.5, Math.max(0, value));
}

function clampOpacity(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(1, Math.max(0, value));
}

export function normalizeDockVariant(value: unknown): TenantDockVariant | undefined {
  return value === "default" || value === "minimal" || value === "floating" || value === "hidden"
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeColors(value: unknown): SiteColors {
  const source = isRecord(value) ? value : {};
  const out: SiteColors = {};
  for (const key of SITE_COLOR_KEYS) {
    const token = safeCssToken(source[key]);
    if (token) out[key] = token;
  }
  return out;
}

function normalizeBackground(value: unknown): SiteBackgroundAsset | undefined {
  if (!isRecord(value)) return undefined;
  const out: SiteBackgroundAsset = {};
  const url = safeAssetUrl(value.url);
  if (url) out.url = url;
  if (SITE_BACKGROUND_POSITIONS.includes(value.position as SiteBackgroundPosition)) {
    out.position = value.position as SiteBackgroundPosition;
  }
  if (SITE_BACKGROUND_SIZES.includes(value.size as SiteBackgroundSize)) {
    out.size = value.size as SiteBackgroundSize;
  }
  const overlayColor = safeCssToken(value.overlayColor);
  if (overlayColor) out.overlayColor = overlayColor;
  const overlayOpacity = clampOpacity(value.overlayOpacity);
  if (overlayOpacity !== undefined) out.overlayOpacity = overlayOpacity;
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeMode(value: unknown): SiteDesignMode {
  const source = isRecord(value) ? value : {};
  const mode: SiteDesignMode = { colors: normalizeColors(source.colors) };
  const assetsSource = isRecord(source.assets) ? source.assets : {};
  const background = normalizeBackground(assetsSource.siteBackground);
  if (background) mode.assets = { siteBackground: background };
  return mode;
}

function normalizeShared(value: unknown): SiteDesignShared {
  const source = isRecord(value) ? value : {};
  const fontsSource = isRecord(source.fonts) ? source.fonts : {};
  const shared: SiteDesignShared = {};
  const experience = safeCssToken(fontsSource.experience);
  const body = safeCssToken(fontsSource.body);
  if (experience || body) shared.fonts = { ...(experience && { experience }), ...(body && { body }) };
  const dockVariant = normalizeDockVariant(source.dockVariant);
  if (dockVariant) shared.dockVariant = dockVariant;
  const intensity = clampCinematicIntensity(source.cinematicIntensity);
  if (intensity !== undefined) shared.cinematicIntensity = intensity;
  return shared;
}

function normalizeBranding(value: unknown): SiteDesign["branding"] | undefined {
  if (!isRecord(value)) return undefined;
  const out: NonNullable<SiteDesign["branding"]> = {};
  const logoUrl = safeAssetUrl(value.logoUrl);
  const favicon32Url = safeAssetUrl(value.favicon32Url);
  const favicon192Url = safeAssetUrl(value.favicon192Url);
  if (logoUrl) out.logoUrl = logoUrl;
  if (favicon32Url) out.favicon32Url = favicon32Url;
  if (favicon192Url) out.favicon192Url = favicon192Url;
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeHeader(value: unknown): TenantHeaderConfig | undefined {
  if (!isRecord(value)) return undefined;
  const out: TenantHeaderConfig = {};
  if (typeof value.maxNavItems === "number" && Number.isFinite(value.maxNavItems)) {
    out.maxNavItems = value.maxNavItems;
  }
  if (typeof value.showCta === "boolean") out.showCta = value.showCta;
  const ctaLabel = safeCssToken(value.ctaLabel);
  if (ctaLabel) out.ctaLabel = ctaLabel;
  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// Detection, normalization, legacy conversion
// ---------------------------------------------------------------------------

export function isSiteDesignDocument(value: unknown): value is Partial<SiteDesign> {
  return isRecord(value) && value.schemaVersion === SITE_DESIGN_SCHEMA_VERSION;
}

/**
 * Interpret a legacy flat TenantTheme as a v2 SiteDesign: legacy colors become
 * dark-mode overrides on top of the given template; light mode uses template
 * defaults. Non-editor keys (header/branding/vehiclePricing) carry through.
 */
export function legacyThemeToSiteDesign(
  legacy: unknown,
  template: SiteDesignDefaults
): SiteDesign {
  const source = isRecord(legacy) ? legacy : {};
  const darkColors = normalizeColors(source.colors);
  const shared = normalizeShared({
    fonts: source.fonts,
    dockVariant: (source.dockVariant ?? (isRecord(source.dock) ? source.dock.variant : undefined)),
    cinematicIntensity:
      source.cinematicIntensity ??
      (isRecord(source.cinematic) ? source.cinematic.intensity : undefined),
  });

  const design: SiteDesign = {
    schemaVersion: SITE_DESIGN_SCHEMA_VERSION,
    template: { key: template.key, version: template.version },
    shared,
    modes: {
      dark: { colors: darkColors },
      light: { colors: {} },
    },
  };
  return withPreservedKeys(design, source);
}

/**
 * The single read-time entry point. Accepts whatever is in `tenants.theme` and
 * returns a validated SiteDesign. Malformed input never throws — it falls back
 * to the template defaults.
 */
export function normalizeSiteDesign(value: unknown, template: SiteDesignDefaults): SiteDesign {
  if (isSiteDesignDocument(value)) {
    const source = value as Record<string, unknown>;
    const templateKey = typeof source.template === "object" && source.template !== null
      ? (source.template as Record<string, unknown>)
      : {};
    const design: SiteDesign = {
      schemaVersion: SITE_DESIGN_SCHEMA_VERSION,
      template: {
        // The caller resolves the source key through the finite registry first.
        // Persist that canonical key so malformed/future values cannot leak into
        // DOM layout selectors or draft row keys.
        key: template.key,
        version:
          typeof templateKey.version === "number" && Number.isFinite(templateKey.version)
            ? templateKey.version
            : template.version,
      },
      shared: normalizeShared(source.shared),
      modes: {
        dark: normalizeMode(isRecord(source.modes) ? source.modes.dark : undefined),
        light: normalizeMode(isRecord(source.modes) ? source.modes.light : undefined),
      },
    };
    return withPreservedKeys(design, source);
  }
  // Legacy flat theme (or empty/garbage) → Luxury + dark overrides.
  return legacyThemeToSiteDesign(value, template);
}

function withPreservedKeys(design: SiteDesign, source: Record<string, unknown>): SiteDesign {
  const header = normalizeHeader(source.header);
  const branding = normalizeBranding(source.branding);
  if (header) design.header = header;
  if (branding) design.branding = branding;
  if (isRecord(source.vehiclePricing)) {
    design.vehiclePricing = {
      showPriceReductionSignal: source.vehiclePricing.showPriceReductionSignal === true,
    };
  }
  return design;
}

// ---------------------------------------------------------------------------
// Resolution — the deterministic fallback chain (shared by admin + public)
// ---------------------------------------------------------------------------

/** Resolve one color: tenant mode override → template mode default. */
export function resolveModeColors(
  design: SiteDesign,
  template: SiteDesignDefaults,
  mode: SiteMode
): SiteColors {
  const templateColors = template.modes[mode]?.colors ?? {};
  const tenantColors = design.modes[mode]?.colors ?? {};
  const out: SiteColors = {};
  for (const key of SITE_COLOR_KEYS) {
    const value = tenantColors[key] ?? templateColors[key];
    if (value) out[key] = value;
  }
  return out;
}

/** Resolve the background for a mode: tenant override → template default → none. */
export function resolveModeBackground(
  design: SiteDesign,
  template: SiteDesignDefaults,
  mode: SiteMode
): SiteBackgroundAsset | undefined {
  return (
    design.modes[mode]?.assets?.siteBackground ??
    template.modes[mode]?.assets?.siteBackground ??
    undefined
  );
}

/** Resolve shared values: tenant shared → template shared. */
export function resolveShared(design: SiteDesign, template: SiteDesignDefaults): SiteDesignShared {
  return {
    fonts: {
      experience: design.shared.fonts?.experience ?? template.shared.fonts?.experience,
      body: design.shared.fonts?.body ?? template.shared.fonts?.body,
    },
    dockVariant: design.shared.dockVariant ?? template.shared.dockVariant,
    cinematicIntensity: design.shared.cinematicIntensity ?? template.shared.cinematicIntensity,
  };
}

// ---------------------------------------------------------------------------
// Template application (apply semantics per docs §7)
// ---------------------------------------------------------------------------

/**
 * Apply a template: replace ONLY editor-owned values (template/shared/modes)
 * with the template's defaults. Preserve header/branding/vehiclePricing and any
 * tenant-specific data. Returns a fresh document; the caller publishes it.
 */
export function applyTemplateToDesign(
  current: SiteDesign,
  template: SiteDesignDefaults
): SiteDesign {
  const design: SiteDesign = {
    schemaVersion: SITE_DESIGN_SCHEMA_VERSION,
    template: { key: template.key, version: template.version },
    shared: structuredCloneSafe(template.shared),
    modes: {
      dark: structuredCloneSafe(template.modes.dark),
      light: structuredCloneSafe(template.modes.light),
    },
  };
  if (current.header) design.header = current.header;
  if (current.branding) design.branding = current.branding;
  if (current.vehiclePricing) design.vehiclePricing = current.vehiclePricing;
  return design;
}

function structuredCloneSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Convert a resolved SiteDesign into a legacy-shaped TenantTheme for a given
 * mode. Lets existing consumers (which still speak TenantTheme) keep working
 * during the migration without duplicating the color mapping.
 */
export function siteDesignToTenantTheme(
  design: SiteDesign,
  template: SiteDesignDefaults,
  mode: SiteMode
): TenantTheme {
  const shared = resolveShared(design, template);
  return {
    ...(design.header && { header: design.header }),
    colors: resolveModeColors(design, template, mode),
    fonts: shared.fonts,
    dockVariant: shared.dockVariant,
    cinematicIntensity: shared.cinematicIntensity,
    ...(design.vehiclePricing && { vehiclePricing: design.vehiclePricing }),
    ...(design.branding && { branding: design.branding }),
  };
}
