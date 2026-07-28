/**
 * Default concierge routing targets.
 *
 * Every tenant in production shipped with ZERO concierge targets, which meant
 * the public concierge could describe a vehicle but could not send a shopper
 * to finance, trade-in, service booking or specials — the pages that actually
 * convert. The registry existed; nothing ever populated it.
 *
 * Keys and destinations line up with the Tier-1 dealer page templates, so a
 * tenant seeded with those pages gets a concierge wired to all of them.
 * `aiDescription` is what the model matches against, so it is written as the
 * shopper's intent rather than the page's title.
 */
export type DefaultConciergeTarget = {
  key: string;
  label: string;
  /** Page slug this target depends on; targets for missing pages are skipped. */
  pageSlug: string;
  destination: string;
  aiDescription: string;
  isConversion: boolean;
  sortOrder: number;
};

export const DEFAULT_CONCIERGE_TARGETS: readonly DefaultConciergeTarget[] = [
  {
    key: "financing",
    label: "Financing",
    pageSlug: "financing",
    destination: "/financing",
    aiDescription:
      "Use when the shopper asks about monthly payments, financing, loans, APR, credit approval, or affordability.",
    isConversion: true,
    sortOrder: 10,
  },
  {
    key: "trade-in",
    label: "Trade-in valuation",
    pageSlug: "trade-in",
    destination: "/trade-in",
    aiDescription:
      "Use when the shopper mentions trading in, selling, or valuing their current vehicle.",
    isConversion: true,
    sortOrder: 20,
  },
  {
    key: "service",
    label: "Book service",
    pageSlug: "service",
    destination: "/service",
    aiDescription:
      "Use when the shopper wants to book a service appointment, repair, maintenance, or parts.",
    isConversion: true,
    sortOrder: 30,
  },
  {
    key: "specials",
    label: "Current specials",
    pageSlug: "specials",
    destination: "/specials",
    aiDescription:
      "Use when the shopper asks about deals, offers, discounts, promotions, or what is on sale.",
    isConversion: true,
    sortOrder: 40,
  },
  {
    key: "reviews",
    label: "Customer reviews",
    pageSlug: "reviews",
    destination: "/reviews",
    aiDescription:
      "Use when the shopper asks whether the dealership is trustworthy, or about reviews, ratings or testimonials.",
    isConversion: false,
    sortOrder: 50,
  },
  {
    key: "about",
    label: "About the dealership",
    pageSlug: "about",
    destination: "/about",
    aiDescription:
      "Use when the shopper asks who the dealership is, where it is, its hours, or how to contact it.",
    isConversion: false,
    sortOrder: 60,
  },
  {
    key: "faq",
    label: "FAQ",
    pageSlug: "faq",
    destination: "/faq",
    aiDescription:
      "Use for general policy questions such as warranties, delivery, paperwork, returns or deposits.",
    isConversion: false,
    sortOrder: 70,
  },
];

/** Targets whose backing page exists for this tenant. */
export function targetsForAvailablePages(
  availablePageSlugs: Iterable<string>,
): DefaultConciergeTarget[] {
  const available = new Set(availablePageSlugs);
  return DEFAULT_CONCIERGE_TARGETS.filter((target) => available.has(target.pageSlug));
}
