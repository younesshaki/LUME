/**
 * Built-in website template registry — the single source of truth for template
 * defaults, consumed by both the admin app and the public Vite app. Runtime-safe
 * (no React/browser imports). Do NOT duplicate these defaults anywhere else.
 *
 * v1 ships exactly one template: Luxury. Its dark defaults reproduce the current
 * public site (sourced from DEFAULT_TENANT_THEME); its light defaults promote the
 * palette previously hard-coded in src/index.css's :root[data-theme="light"]
 * block into data, refined for readability. See docs/website-templates-v1.md.
 */
import { DEFAULT_TENANT_THEME } from "./tenantTheme";
import type { SiteDesignDefaults, SiteMode } from "./siteDesign";

export type SiteTemplateKey = "luxury";

export type SiteTemplate = SiteDesignDefaults & {
  key: SiteTemplateKey;
  name: string;
  description: string;
};

/**
 * Luxury dark palette = the shipping public-site look. Kept structurally in
 * lockstep with DEFAULT_TENANT_THEME so the two never drift.
 */
const LUXURY_DARK_COLORS = {
  ink: DEFAULT_TENANT_THEME.colors.ink,
  muted: DEFAULT_TENANT_THEME.colors.muted,
  soft: DEFAULT_TENANT_THEME.colors.soft,
  line: DEFAULT_TENANT_THEME.colors.line,
  gold: DEFAULT_TENANT_THEME.colors.gold,
  background: DEFAULT_TENANT_THEME.colors.background,
  panel: DEFAULT_TENANT_THEME.colors.panel,
  dockItemBackground: DEFAULT_TENANT_THEME.colors.dockItemBackground,
  dockItemColor: DEFAULT_TENANT_THEME.colors.dockItemColor,
  dockItemBorder: DEFAULT_TENANT_THEME.colors.dockItemBorder,
} as const;

/**
 * Luxury light palette = promoted from src/index.css's light block, with a
 * deliberately readable panel/line/dock treatment (not a naive inversion). The
 * light background default is a FLAT color — never a dark photograph — so a
 * tenant with no custom light image still gets a legible site.
 */
const LUXURY_LIGHT_COLORS = {
  ink: "#211d16",
  muted: "rgba(33, 29, 22, 0.66)",
  soft: "rgba(33, 29, 22, 0.46)",
  line: "rgba(47, 38, 25, 0.16)",
  gold: "#9a7527",
  background: "#f4efe5",
  panel: "rgba(255, 252, 246, 0.88)",
  dockItemBackground: "#fffaf0",
  dockItemColor: "#211d16",
  dockItemBorder: "rgba(154, 117, 39, 0.2)",
} as const;

const LUXURY: SiteTemplate = {
  key: "luxury",
  version: 1,
  name: "Luxury",
  description:
    "The signature LUME look — cinematic black-and-gold in dark mode, a warm readable ivory in light mode. The default for every dealership.",
  shared: {
    fonts: {
      experience: DEFAULT_TENANT_THEME.fonts.experience,
      body: DEFAULT_TENANT_THEME.fonts.body,
    },
    dockVariant: DEFAULT_TENANT_THEME.dockVariant,
    cinematicIntensity: DEFAULT_TENANT_THEME.cinematicIntensity,
  },
  modes: {
    dark: { colors: { ...LUXURY_DARK_COLORS } },
    // No default light background image: the flat `background` color is the
    // intentional, safe light fallback.
    light: { colors: { ...LUXURY_LIGHT_COLORS } },
  },
};

export const SITE_TEMPLATES: Readonly<Record<SiteTemplateKey, SiteTemplate>> = {
  luxury: LUXURY,
} as const;

export const DEFAULT_SITE_TEMPLATE_KEY: SiteTemplateKey = "luxury";

/** All templates in display order (registry-driven; the gallery renders these). */
export function listSiteTemplates(): readonly SiteTemplate[] {
  return Object.values(SITE_TEMPLATES);
}

/** Resolve a template by key, falling back to Luxury for unknown/legacy keys. */
export function getSiteTemplate(key: string | null | undefined): SiteTemplate {
  if (key && key in SITE_TEMPLATES) return SITE_TEMPLATES[key as SiteTemplateKey];
  return SITE_TEMPLATES[DEFAULT_SITE_TEMPLATE_KEY];
}

/** Resolve the template a design references (its `template.key`). */
export function templateForKey(key: string | null | undefined): SiteTemplate {
  return getSiteTemplate(key);
}

export { LUXURY_DARK_COLORS, LUXURY_LIGHT_COLORS };
