export type TenantDockVariant = "default" | "minimal" | "floating" | "hidden";

export type TenantTheme = {
  colors?: {
    ink?: string;
    muted?: string;
    soft?: string;
    line?: string;
    gold?: string;
    background?: string;
    panel?: string;
    dockItemBackground?: string;
    dockItemColor?: string;
    dockItemBorder?: string;
  };
  fonts?: {
    experience?: string;
    body?: string;
  };
  dockVariant?: TenantDockVariant;
  dock?: {
    variant?: TenantDockVariant;
  };
  cinematicIntensity?: number;
  cinematic?: {
    intensity?: number;
  };
};

/**
 * The starter theme copied into tenants.theme at provisioning time so a new
 * site never renders unthemed. Values mirror the branding editor's defaults
 * (apps/admin .../branding/themeForm.ts derives its form defaults from this)
 * — change them here, not there.
 */
export const DEFAULT_TENANT_THEME = {
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
} as const satisfies TenantTheme;
