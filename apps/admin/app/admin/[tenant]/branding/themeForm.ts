import type { TenantDockVariant, TenantTheme } from "@lume/types";

export type BrandingThemeForm = {
  colors: {
    ink: string;
    muted: string;
    soft: string;
    line: string;
    gold: string;
    background: string;
    panel: string;
    dockItemBackground: string;
    dockItemColor: string;
    dockItemBorder: string;
  };
  fonts: {
    experience: string;
    body: string;
  };
  dockVariant: TenantDockVariant;
  cinematicIntensity: number;
};

export const BRANDING_THEME_DEFAULTS: BrandingThemeForm = {
  colors: {
    ink: "#fff8ec",
    muted: "#c7bda8",
    soft: "#8a806d",
    line: "#3a3328",
    gold: "#d9b76a",
    background: "#000000",
    panel: "#101011",
    dockItemBackground: "#272727",
    dockItemColor: "#efede6",
    dockItemBorder: "#e9c31b",
  },
  fonts: {
    experience: "var(--scene-font-moralana)",
    body: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  dockVariant: "default",
  cinematicIntensity: 1,
};

export function brandingFormFromTheme(theme: TenantTheme | null | undefined): BrandingThemeForm {
  return {
    colors: {
      ink: theme?.colors?.ink ?? BRANDING_THEME_DEFAULTS.colors.ink,
      muted: theme?.colors?.muted ?? BRANDING_THEME_DEFAULTS.colors.muted,
      soft: theme?.colors?.soft ?? BRANDING_THEME_DEFAULTS.colors.soft,
      line: theme?.colors?.line ?? BRANDING_THEME_DEFAULTS.colors.line,
      gold: theme?.colors?.gold ?? BRANDING_THEME_DEFAULTS.colors.gold,
      background: theme?.colors?.background ?? BRANDING_THEME_DEFAULTS.colors.background,
      panel: theme?.colors?.panel ?? BRANDING_THEME_DEFAULTS.colors.panel,
      dockItemBackground:
        theme?.colors?.dockItemBackground ?? BRANDING_THEME_DEFAULTS.colors.dockItemBackground,
      dockItemColor: theme?.colors?.dockItemColor ?? BRANDING_THEME_DEFAULTS.colors.dockItemColor,
      dockItemBorder:
        theme?.colors?.dockItemBorder ?? BRANDING_THEME_DEFAULTS.colors.dockItemBorder,
    },
    fonts: {
      experience: theme?.fonts?.experience ?? BRANDING_THEME_DEFAULTS.fonts.experience,
      body: theme?.fonts?.body ?? BRANDING_THEME_DEFAULTS.fonts.body,
    },
    dockVariant: theme?.dockVariant ?? theme?.dock?.variant ?? BRANDING_THEME_DEFAULTS.dockVariant,
    cinematicIntensity:
      theme?.cinematicIntensity ??
      theme?.cinematic?.intensity ??
      BRANDING_THEME_DEFAULTS.cinematicIntensity,
  };
}

export function themeFromBrandingForm(form: BrandingThemeForm): TenantTheme {
  return {
    colors: { ...form.colors },
    fonts: { ...form.fonts },
    dockVariant: form.dockVariant,
    cinematicIntensity: clampIntensity(form.cinematicIntensity),
  };
}

export function toColorInputValue(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000";
}

function clampIntensity(value: number): number {
  if (!Number.isFinite(value)) return BRANDING_THEME_DEFAULTS.cinematicIntensity;
  return Math.min(1.5, Math.max(0, value));
}
