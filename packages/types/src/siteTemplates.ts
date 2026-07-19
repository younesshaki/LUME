/**
 * Built-in website template registry — the single source of truth for template
 * defaults, consumed by both the admin app and the public Vite app. Runtime-safe
 * (no React/browser imports). Do NOT duplicate these defaults anywhere else.
 *
 * Luxury remains the backwards-compatible default. The collection also exposes
 * four product-owned conversion strategies. Templates contain only allowlisted
 * presentation metadata and copy — never arbitrary CSS, routes, or scripts.
 * See docs/website-template-collection-v2.md.
 */
import { DEFAULT_TENANT_THEME } from "./tenantTheme";
import type { SiteDesignDefaults, SiteMode } from "./siteDesign";

export type SiteTemplateKey =
  | "luxury"
  | "capital"
  | "ignition"
  | "concierge"
  | "exchange";

export type SiteTemplateSpecialty =
  | "luxury"
  | "finance"
  | "test-drive"
  | "appointment"
  | "trade-in";

export type SiteTemplateAction =
  | "browse-inventory"
  | "explore-financing"
  | "book-test-drive"
  | "book-appointment"
  | "value-trade";

export type SiteTemplateVisual = {
  layout:
    | "cinematic-editorial"
    | "precision-grid"
    | "kinetic-track"
    | "hospitality-suite"
    | "equity-split";
  corners: "soft" | "structured" | "angular" | "pill" | "split";
  surface: "glass" | "solid" | "outlined" | "layered";
  motion: "cinematic" | "measured" | "kinetic" | "gentle" | "responsive";
  heroAlignment: "left" | "center" | "split";
};

export type SiteTemplateConversion = {
  eyebrow: string;
  headline: string;
  description: string;
  primaryAction: SiteTemplateAction;
  primaryLabel: string;
  secondaryAction: SiteTemplateAction;
  secondaryLabel: string;
  trustPoints: readonly [string, string, string];
};

export type SiteTemplate = SiteDesignDefaults & {
  key: SiteTemplateKey;
  name: string;
  description: string;
  specialty: SiteTemplateSpecialty;
  visual: SiteTemplateVisual;
  conversion: SiteTemplateConversion;
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
  specialty: "luxury",
  visual: {
    layout: "cinematic-editorial",
    corners: "soft",
    surface: "glass",
    motion: "cinematic",
    heroAlignment: "center",
  },
  conversion: {
    eyebrow: "A considered collection",
    headline: "Find the vehicle that feels entirely your own.",
    description:
      "Explore a curated inventory, then connect with the dealership when you are ready for a private conversation.",
    primaryAction: "browse-inventory",
    primaryLabel: "Explore the collection",
    secondaryAction: "book-appointment",
    secondaryLabel: "Speak with a specialist",
    trustPoints: ["Curated inventory", "Personal assistance", "Transparent details"],
  },
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

const CAPITAL: SiteTemplate = {
  key: "capital",
  version: 1,
  name: "Capital",
  description:
    "A calm, confidence-building buying experience focused on financing clarity, affordability, and the next practical step.",
  specialty: "finance",
  visual: {
    layout: "precision-grid",
    corners: "structured",
    surface: "solid",
    motion: "measured",
    heroAlignment: "split",
  },
  conversion: {
    eyebrow: "Purchase with confidence",
    headline: "A clearer path from monthly budget to the right vehicle.",
    description:
      "Compare inventory with a finance-first experience designed to make the buying conversation straightforward and useful.",
    primaryAction: "explore-financing",
    primaryLabel: "Explore financing",
    secondaryAction: "browse-inventory",
    secondaryLabel: "Browse by vehicle",
    trustPoints: ["Clear next steps", "No approval promises", "Dealer-guided options"],
  },
  shared: {
    fonts: {
      experience: DEFAULT_TENANT_THEME.fonts.body,
      body: DEFAULT_TENANT_THEME.fonts.body,
    },
    dockVariant: "minimal",
    cinematicIntensity: 0.32,
  },
  modes: {
    dark: {
      colors: {
        ink: "#edf8ff",
        muted: "rgba(221, 239, 250, 0.72)",
        soft: "rgba(221, 239, 250, 0.48)",
        line: "rgba(111, 208, 199, 0.22)",
        gold: "#48d6c5",
        background: "#071520",
        panel: "rgba(11, 31, 45, 0.92)",
        dockItemBackground: "#102a3b",
        dockItemColor: "#edf8ff",
        dockItemBorder: "rgba(72, 214, 197, 0.28)",
      },
    },
    light: {
      colors: {
        ink: "#0b2a35",
        muted: "rgba(11, 42, 53, 0.68)",
        soft: "rgba(11, 42, 53, 0.46)",
        line: "rgba(8, 110, 102, 0.18)",
        gold: "#087e73",
        background: "#eef7f7",
        panel: "rgba(255, 255, 255, 0.94)",
        dockItemBackground: "#ffffff",
        dockItemColor: "#0b2a35",
        dockItemBorder: "rgba(8, 126, 115, 0.2)",
      },
    },
  },
};

const IGNITION: SiteTemplate = {
  key: "ignition",
  version: 1,
  name: "Ignition",
  description:
    "A performance-led, kinetic showroom that turns vehicle discovery into a decisive test-drive journey.",
  specialty: "test-drive",
  visual: {
    layout: "kinetic-track",
    corners: "angular",
    surface: "outlined",
    motion: "kinetic",
    heroAlignment: "left",
  },
  conversion: {
    eyebrow: "Put it in motion",
    headline: "The spec sheet starts the story. The drive finishes it.",
    description:
      "Move from a vehicle that caught your eye to a confirmed test-drive request without losing momentum.",
    primaryAction: "book-test-drive",
    primaryLabel: "Book a test drive",
    secondaryAction: "browse-inventory",
    secondaryLabel: "See available vehicles",
    trustPoints: ["Fast request flow", "Vehicle-specific interest", "Dealer confirmed timing"],
  },
  shared: {
    fonts: {
      experience: DEFAULT_TENANT_THEME.fonts.body,
      body: DEFAULT_TENANT_THEME.fonts.body,
    },
    dockVariant: "floating",
    cinematicIntensity: 0.82,
  },
  modes: {
    dark: {
      colors: {
        ink: "#fff5ef",
        muted: "rgba(255, 232, 222, 0.7)",
        soft: "rgba(255, 232, 222, 0.46)",
        line: "rgba(255, 91, 58, 0.25)",
        gold: "#ff593b",
        background: "#0e0c0d",
        panel: "rgba(27, 20, 20, 0.92)",
        dockItemBackground: "#251817",
        dockItemColor: "#fff5ef",
        dockItemBorder: "rgba(255, 89, 59, 0.3)",
      },
    },
    light: {
      colors: {
        ink: "#271311",
        muted: "rgba(39, 19, 17, 0.67)",
        soft: "rgba(39, 19, 17, 0.45)",
        line: "rgba(180, 46, 27, 0.18)",
        gold: "#d83b24",
        background: "#f8f1ec",
        panel: "rgba(255, 252, 249, 0.95)",
        dockItemBackground: "#fffaf6",
        dockItemColor: "#271311",
        dockItemBorder: "rgba(216, 59, 36, 0.22)",
      },
    },
  },
};

const CONCIERGE: SiteTemplate = {
  key: "concierge",
  version: 1,
  name: "Concierge",
  description:
    "A warm, high-touch showroom built around appointments, personal attention, and an effortless dealership visit.",
  specialty: "appointment",
  visual: {
    layout: "hospitality-suite",
    corners: "pill",
    surface: "layered",
    motion: "gentle",
    heroAlignment: "center",
  },
  conversion: {
    eyebrow: "Your visit, thoughtfully arranged",
    headline: "Reserve time with a specialist who is ready for you.",
    description:
      "A hospitality-led experience for shoppers who value preparation, personal guidance, and an unhurried appointment.",
    primaryAction: "book-appointment",
    primaryLabel: "Reserve an appointment",
    secondaryAction: "browse-inventory",
    secondaryLabel: "Explore before your visit",
    trustPoints: ["Personal specialist", "Prepared appointments", "Flexible conversation"],
  },
  shared: {
    fonts: {
      experience: DEFAULT_TENANT_THEME.fonts.experience,
      body: DEFAULT_TENANT_THEME.fonts.body,
    },
    dockVariant: "default",
    cinematicIntensity: 0.42,
  },
  modes: {
    dark: {
      colors: {
        ink: "#fbf3f7",
        muted: "rgba(245, 226, 236, 0.72)",
        soft: "rgba(245, 226, 236, 0.48)",
        line: "rgba(185, 209, 177, 0.21)",
        gold: "#bad5b2",
        background: "#151117",
        panel: "rgba(34, 25, 34, 0.92)",
        dockItemBackground: "#2a202a",
        dockItemColor: "#fbf3f7",
        dockItemBorder: "rgba(186, 213, 178, 0.25)",
      },
    },
    light: {
      colors: {
        ink: "#30242d",
        muted: "rgba(48, 36, 45, 0.68)",
        soft: "rgba(48, 36, 45, 0.46)",
        line: "rgba(103, 126, 94, 0.18)",
        gold: "#657e5d",
        background: "#f6f1f4",
        panel: "rgba(255, 252, 253, 0.94)",
        dockItemBackground: "#fffafd",
        dockItemColor: "#30242d",
        dockItemBorder: "rgba(101, 126, 93, 0.22)",
      },
    },
  },
};

const EXCHANGE: SiteTemplate = {
  key: "exchange",
  version: 1,
  name: "Exchange",
  description:
    "A transparent, value-led experience that puts trade-ins and the customer's next move at the center.",
  specialty: "trade-in",
  visual: {
    layout: "equity-split",
    corners: "split",
    surface: "glass",
    motion: "responsive",
    heroAlignment: "split",
  },
  conversion: {
    eyebrow: "Turn today’s vehicle into tomorrow’s",
    headline: "Understand your trade, then find what comes next.",
    description:
      "Start a valuation conversation and browse replacement inventory in one connected dealership journey.",
    primaryAction: "value-trade",
    primaryLabel: "Value my trade",
    secondaryAction: "browse-inventory",
    secondaryLabel: "Find my next vehicle",
    trustPoints: ["No instant-value fiction", "Dealer-reviewed details", "Connected inventory"],
  },
  shared: {
    fonts: {
      experience: DEFAULT_TENANT_THEME.fonts.body,
      body: DEFAULT_TENANT_THEME.fonts.body,
    },
    dockVariant: "minimal",
    cinematicIntensity: 0.55,
  },
  modes: {
    dark: {
      colors: {
        ink: "#ecfff9",
        muted: "rgba(220, 247, 239, 0.72)",
        soft: "rgba(220, 247, 239, 0.48)",
        line: "rgba(105, 226, 180, 0.22)",
        gold: "#69e2b4",
        background: "#071513",
        panel: "rgba(11, 34, 30, 0.91)",
        dockItemBackground: "#102d28",
        dockItemColor: "#ecfff9",
        dockItemBorder: "rgba(105, 226, 180, 0.27)",
      },
    },
    light: {
      colors: {
        ink: "#0b312b",
        muted: "rgba(11, 49, 43, 0.68)",
        soft: "rgba(11, 49, 43, 0.46)",
        line: "rgba(7, 124, 99, 0.18)",
        gold: "#087c63",
        background: "#eef8f4",
        panel: "rgba(251, 255, 253, 0.95)",
        dockItemBackground: "#ffffff",
        dockItemColor: "#0b312b",
        dockItemBorder: "rgba(8, 124, 99, 0.2)",
      },
    },
  },
};

export const SITE_TEMPLATES: Readonly<Record<SiteTemplateKey, SiteTemplate>> = {
  luxury: LUXURY,
  capital: CAPITAL,
  ignition: IGNITION,
  concierge: CONCIERGE,
  exchange: EXCHANGE,
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

export {
  CAPITAL,
  CONCIERGE,
  EXCHANGE,
  IGNITION,
  LUXURY,
  LUXURY_DARK_COLORS,
  LUXURY_LIGHT_COLORS,
};
