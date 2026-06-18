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
