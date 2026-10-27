import {
  getSiteTemplate,
  resolveModeBackground,
  siteDesignToTenantTheme,
  type SiteDesign,
  type SiteMode,
  type TenantTheme,
  type TenantDockVariant,
} from "@lume/types";
export type TenantSiteDesignStyles = {
  theme: TenantTheme;
  variables: Record<string, string>;
};
export function getTenantSiteDesignStyles(
  design: SiteDesign,
  mode: SiteMode,
): TenantSiteDesignStyles {
  const template = getSiteTemplate(design.template.key);
  const theme = siteDesignToTenantTheme(design, template, mode);
  const variables = tenantThemeToCssVariables(theme);
  const background = resolveModeBackground(design, template, mode);

  if (background?.url) {
    variables["--theme-site-background-image"] =
      `url(${JSON.stringify(background.url)})`;
  }
  variables["--theme-site-background-position"] =
    background?.position ?? "center";
  variables["--theme-site-background-size"] = background?.size ?? "cover";
  const opacity = background?.overlayOpacity ?? (mode === "dark" ? 0.42 : 0.12);
  const overlayColor =
    background?.overlayColor ?? (mode === "dark" ? "#000" : "#f4efe5");
  variables["--theme-site-background-overlay"] =
    `color-mix(in srgb, ${overlayColor} ${Math.round(opacity * 100)}%, transparent)`;

  return { theme, variables };
}
export function tenantThemeToCssVariables(
  theme: TenantTheme,
): Record<string, string> {
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
  setCssValue(
    variables,
    "--theme-experience-font-family",
    theme.fonts?.experience,
  );
  setCssValue(variables, "--theme-body-font-family", theme.fonts?.body);

  const intensity = normalizeIntensity(
    theme.cinematicIntensity ?? theme.cinematic?.intensity,
  );
  if (intensity !== null)
    variables["--lume-cinematic-intensity"] = String(intensity);

  return variables;
}
export function setCssValue(
  target: Record<string, string>,
  name: string,
  value: string | undefined,
) {
  const safe = safeCssValue(value);
  if (safe) target[name] = safe;
}
export function safeCssValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 160 || /[;{}]/.test(trimmed))
    return undefined;
  return trimmed;
}
export function normalizeIntensity(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(1.5, Math.max(0, value));
}
