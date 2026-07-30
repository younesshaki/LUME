export type TenantDockVariant = "default" | "minimal" | "floating" | "hidden";

/** Header layout variants. `centred` is the historical look and the default. */
export type TenantHeaderVariant = "centred" | "left" | "split" | "minimal";

/** Footer layout variants. `stacked` is the historical look and the default. */
export type TenantFooterVariant = "columns" | "stacked" | "minimal";

/** A header call-to-action. Multiple are allowed; `primary` draws the eye. */
export type TenantHeaderCta = {
  label: string;
  href: string;
  style?: "primary" | "ghost";
};

/**
 * Public-site header configuration, edited in the admin "Navigation" section.
 * Nav items come from the tenant's published pages (ordered by nav_order);
 * this controls the arrangement around them.
 *
 * Back-compat is load-bearing here. `showCta` and `ctaLabel` predate `ctas` and
 * every live tenant is still using them, so they are NOT deprecated-and-ignored
 * — resolveHeaderCtas() reads them as a single-CTA fallback whenever `ctas` is
 * absent. A tenant that never opens the new UI must render exactly as before.
 */
export type TenantHeaderConfig = {
  /** How many pages the header shows; the rest overflow (mobile menu shows all). */
  maxNavItems?: number;
  /** Show the invitation/CTA button on the right. Legacy; see `ctas`. */
  showCta?: boolean;
  /** CTA button label. Legacy; see `ctas`. */
  ctaLabel?: string;

  /** Arrangement of logo, nav and actions. Defaults to `centred`. */
  variant?: TenantHeaderVariant;
  /** Logo side. Defaults to `left`. */
  logoPlacement?: "left" | "centre";
  /** Whether the header stays pinned on scroll. Defaults to true. */
  sticky?: boolean;
  /** Replaces showCta/ctaLabel when present. Empty array means no CTA. */
  ctas?: TenantHeaderCta[];
  /** Show the visitor account button. Defaults to true. */
  showVisitorTab?: boolean;
};

/**
 * Public-site footer configuration.
 *
 * New in Phase 4: the footer previously had no configuration at all —
 * SiteFooter was entirely hardcoded. Every field is optional and the renderer
 * falls back to the historical layout, so an absent config is not a downgrade.
 */
export type TenantFooterConfig = {
  /** Defaults to `stacked`, which is the pre-Phase-4 layout. */
  variant?: TenantFooterVariant;
  /** Column count for the `columns` variant. Clamped to 2–4. */
  columns?: number;
  showSocial?: boolean;
  socialLinks?: Array<{ label: string; href: string }>;
  legalLinks?: Array<{ label: string; href: string }>;
  showNewsletter?: boolean;
};

export const HEADER_CTA_LIMITS = { max: 3 } as const;
export const FOOTER_COLUMN_LIMITS = { min: 2, max: 4, fallback: 3 } as const;

/**
 * The header's effective CTAs.
 *
 * The whole point of this function is that a tenant configured before `ctas`
 * existed keeps working: when `ctas` is absent we synthesise one from
 * showCta/ctaLabel. An explicitly empty `ctas` array is respected as "no CTA",
 * which is why the absent case and the empty case must not be conflated.
 */
export function resolveHeaderCtas(
  header: TenantHeaderConfig | null | undefined,
  fallbackLabel = "Request Invitation",
  fallbackHref = "/contact",
): TenantHeaderCta[] {
  if (header?.ctas) {
    return header.ctas.slice(0, HEADER_CTA_LIMITS.max);
  }
  if (header?.showCta === false) return [];
  return [
    {
      label: header?.ctaLabel?.trim() || fallbackLabel,
      href: fallbackHref,
      style: "primary",
    },
  ];
}

export function clampFooterColumns(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return FOOTER_COLUMN_LIMITS.fallback;
  }
  return Math.min(
    FOOTER_COLUMN_LIMITS.max,
    Math.max(FOOTER_COLUMN_LIMITS.min, Math.round(value)),
  );
}

export type TenantTheme = {
  header?: TenantHeaderConfig;
  footer?: TenantFooterConfig;
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
  vehiclePricing?: {
    /** Public vehicle detail may show an aggregate recent-reductions signal. */
    showPriceReductionSignal?: boolean;
  };
  branding?: {
    /** Public URLs in the tenant-logos bucket. */
    logoUrl?: string;
    favicon32Url?: string;
    favicon192Url?: string;
  };
};

/**
 * The starter theme copied into tenants.theme at provisioning time so a new
 * site never renders unthemed. Values mirror the branding editor's defaults
 * (apps/admin .../branding/themeForm.ts derives its form defaults from this)
 * — change them here, not there.
 */
export const DEFAULT_TENANT_THEME = {
  header: {
    maxNavItems: 6,
    showCta: true,
    ctaLabel: "Request Invitation",
  },
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
  vehiclePricing: {
    showPriceReductionSignal: false,
  },
} as const satisfies TenantTheme;
