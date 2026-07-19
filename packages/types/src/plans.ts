/**
 * LUME plan catalog — the single source of truth for plan identity, public
 * pricing-page copy, and feature entitlements.
 *
 * Rules of use:
 * - Gate behavior with planHasFeature() and a canonical feature key from
 *   PLAN_FEATURES — never by comparing plan ids or names inside components.
 * - New capabilities get a new feature key here first, then a default per
 *   tier in PLAN_CATALOG. Callers read entitlements, not plan names.
 * - The DB side (plans/subscriptions, migration 030+) only records *which*
 *   plan a tenant holds; what that plan *means* lives here so pricing,
 *   copy, and entitlements change in one place.
 */

export const PLAN_IDS = ["basic", "pro", "ultra"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

/**
 * Canonical entitlement keys.
 * - "chat.actions": the concierge may perform website actions (navigate,
 *   filter inventory, open lead forms, tenant-configured concierge targets)
 *   and call action-capable tools. Off = informational Q&A concierge only.
 */
export const PLAN_FEATURES = ["chat.actions"] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];
export type PlanEntitlements = Record<PlanFeature, boolean>;

export type PlanCatalogEntry = {
  id: PlanId;
  /** Display name, e.g. "Pro". */
  name: string;
  /** One-line positioning under the name. */
  tagline: string;
  /** Headline price text; placeholder until billing launches. */
  price: string;
  /** Secondary line under the price. */
  priceNote: string;
  ctaLabel: string;
  ctaHref: string;
  /** Visually emphasized tier on the pricing page. Exactly one per page. */
  highlighted: boolean;
  /** Ribbon text on the highlighted card, e.g. "Recommended". */
  badge: string | null;
  /** Benefit bullets, in display order. */
  features: readonly string[];
  entitlements: PlanEntitlements;
};

export const PLAN_CATALOG: readonly PlanCatalogEntry[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "A cinematic home for your inventory.",
    price: "Coming soon",
    priceNote: "Early-access onboarding",
    ctaLabel: "Create your site",
    ctaHref: "/signup",
    highlighted: false,
    badge: null,
    features: [
      "Cinematic website for your inventory",
      "AI concierge that answers visitor questions",
      "Vehicle inventory with lead capture",
      "Custom branding, pages, and domains",
    ],
    entitlements: { "chat.actions": false },
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "A concierge that sells, not just answers.",
    price: "Contact us",
    priceNote: "Early-access pricing",
    ctaLabel: "Get started",
    ctaHref: "/signup",
    highlighted: true,
    badge: "Recommended",
    features: [
      "Everything in Basic",
      "Action-capable concierge that guides visitors around your site",
      "Concierge opens pages, filters inventory, and starts lead forms",
      "Tenant-configured concierge actions",
    ],
    entitlements: { "chat.actions": true },
  },
  {
    id: "ultra",
    name: "Ultra",
    tagline: "For groups and high-volume rooftops.",
    price: "Contact us",
    priceNote: "Tailored to your business",
    ctaLabel: "Contact us",
    ctaHref: "/signup",
    highlighted: false,
    badge: null,
    features: [
      "Everything in Pro",
      "Higher usage limits, tailored to volume",
      "Premium concierge capabilities as they launch",
      "Priority support and onboarding",
    ],
    entitlements: { "chat.actions": true },
  },
];

/**
 * Safe fallback for tenants with no valid subscription (or an unreadable
 * one): the informational concierge. Paid capabilities are never granted
 * by default.
 */
export const DEFAULT_PLAN_ID: PlanId = "basic";

const PLAN_BY_ID: Record<PlanId, PlanCatalogEntry> = Object.fromEntries(
  PLAN_CATALOG.map((entry) => [entry.id, entry]),
) as Record<PlanId, PlanCatalogEntry>;

export function planCatalogEntry(id: PlanId): PlanCatalogEntry {
  return PLAN_BY_ID[id];
}

/** Display order matches PLAN_CATALOG. */
export function listPlans(): readonly PlanCatalogEntry[] {
  return PLAN_CATALOG;
}

export function planEntitlements(id: PlanId): PlanEntitlements {
  return { ...PLAN_BY_ID[id].entitlements };
}

export function planHasFeature(id: PlanId, feature: PlanFeature): boolean {
  return PLAN_BY_ID[id].entitlements[feature] === true;
}

/**
 * Map a stored plans.name (migration 030, seeded by migration 074) to a
 * catalog id. Strict and case-insensitive; unknown names return null so
 * callers fall back to DEFAULT_PLAN_ID instead of guessing.
 */
export function resolvePlanId(name: string | null | undefined): PlanId | null {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return (PLAN_IDS as readonly string[]).includes(normalized)
    ? (normalized as PlanId)
    : null;
}
