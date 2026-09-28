/**
 * Template Glo3D starter pages — the dealership composition the template is
 * designed around, built only from existing palette blocks (same data rules as
 * dealerPageTemplates.ts: no React, seed-script importable).
 *
 * Copy is dealer-neutral and claims nothing that is not true for every dealer:
 * no ratings, statistics, addresses or finance rates. The dealer's own name,
 * logo and inventory come from the tenant; photos are the template's licensed
 * stock set (docs/template-glo3d-sources.md).
 *
 * Applying these never overwrites a tenant's pages by default — see
 * scripts/apply-glo3d-starter-pages.ts.
 */
import type { DefaultPageSeed } from "./defaultPages";

/** Public R2 location of the template photos (the bucket is public). */
export const GLO3D_MEDIA_BASE = "https://pub-da3069790c6443f883e3991be965f766.r2.dev/templates/glo3d";
const photo = (slot: string) => `${GLO3D_MEDIA_BASE}/${slot}.webp`;
/** Feature bands take an R2 key; the 1200px variant suits their half-width column. */
const photoKey = (slot: string) => `templates/glo3d/${slot}-1200.webp`;

export const GLO3D_STARTER_PAGES: DefaultPageSeed[] = [
  {
    slug: "home",
    title: "Home",
    navOrder: 0,
    isReserved: true,
    seoMeta: {
      description: "Browse our current inventory with clear prices, then book a test drive or talk to our team.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "glo3d-home-hero",
          type: "hero",
          props: {
            variant: "split",
            eyebrow: "Current inventory",
            title: "Find the right vehicle, then see it in person.",
            subtitle: "Browse vehicles with clear prices and full specifications, then book a test drive with our team.",
            primaryCtaLabel: "View inventory",
            primaryCtaHref: "/vehicles",
            secondaryCtaLabel: "Book a test drive",
            secondaryCtaHref: "/contact",
            mediaUrl: photo("hero-showroom"),
            mediaAlt: "Car on display in a bright dealership showroom",
            mediaPosition: "right",
            overlayStrength: 45,
            alignment: "left",
          },
        },
        {
          id: "glo3d-home-new-arrivals",
          type: "new-arrivals",
          props: {
            eyebrow: "Just arrived",
            title: "New to our inventory",
            body: "The latest vehicles on the lot, with prices and details.",
            maxItems: 6,
            ctaLabel: "View all inventory",
          },
        },
        {
          id: "glo3d-home-search",
          type: "vehicle-search-band",
          props: {
            eyebrow: "Search",
            title: "Looking for something specific?",
            body: "Choose a make, model and budget to open the inventory with those filters applied.",
            buttonLabel: "Search inventory",
            defaultBudget: 0,
          },
        },
        {
          id: "glo3d-home-dealership",
          type: "feature-band",
          props: {
            kicker: "The dealership",
            heading: "Every vehicle is here to see, sit in and drive.",
            body: "Browse online, then visit us to look closer. Our team will have the vehicle ready and answer every question before you decide.",
            mediaKey: photoKey("dealership-exterior"),
            mediaAlt: "Row of vehicles on the dealership lot",
          },
        },
        {
          id: "glo3d-home-financing",
          type: "feature-band",
          props: {
            kicker: "Financing",
            heading: "Clear terms, explained before you sign.",
            body: "We walk you through the options and the paperwork so the monthly figure is one you understand and are comfortable with.",
            mediaKey: photoKey("financing-desk"),
            mediaAlt: "Customers reviewing paperwork at a desk",
          },
        },
        {
          id: "glo3d-home-trade-in",
          type: "cta-banner",
          props: {
            eyebrow: "Trade-in",
            title: "Put your current vehicle towards the next one.",
            body: "Tell us about your vehicle and our team will come back with an appraisal.",
            primaryLabel: "Value my trade-in",
            primaryHref: "/trade-in",
            secondaryLabel: "View inventory",
            secondaryHref: "/vehicles",
          },
        },
        {
          id: "glo3d-home-service",
          type: "feature-band",
          props: {
            kicker: "Service",
            heading: "Looked after long after you drive away.",
            body: "Our service team keeps your vehicle maintained and on the road. Book a visit whenever it is due.",
            mediaKey: photoKey("service-bay"),
            mediaAlt: "Technician working on a car in the service bay",
          },
        },
      ],
    },
  },
  {
    slug: "vehicles",
    title: "Inventory",
    navOrder: 1,
    isReserved: true,
    seoMeta: {
      description: "Search our current inventory by make, model, price and condition.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "glo3d-inventory-hero",
          type: "hero",
          props: {
            variant: "search",
            eyebrow: "Inventory",
            title: "Find your next vehicle",
            subtitle: "Search by make, model, budget and condition.",
            primaryCtaLabel: "Search inventory",
            primaryCtaHref: "/vehicles",
            mediaUrl: photo("search-hero"),
            mediaAlt: "New cars lined up in a showroom",
            overlayStrength: 50,
            alignment: "left",
          },
        },
        {
          id: "glo3d-inventory-grid",
          type: "vehicle-inventory",
          props: { title: "All vehicles", showFilters: true, cardStyle: "classic", cardColor: "#1F5EFF" },
        },
      ],
    },
  },
  {
    slug: "vehicle",
    title: "Vehicle",
    navOrder: 99,
    isReserved: false,
    seoMeta: {},
    blocks: {
      version: 1,
      blocks: [
        {
          id: "glo3d-vdp-detail",
          type: "vehicle-detail",
          props: {
            eyebrow: "Available now",
            overviewTitle: "Inspected before it is listed",
            overviewText: "Ask us for the full history and inspection details on this vehicle; we will send them before you visit.",
            showGallery: true,
            showSpecs: true,
            showActions: true,
          },
        },
        {
          id: "glo3d-vdp-finance",
          type: "finance-calculator",
          props: {
            eyebrow: "Finance",
            title: "Estimate a monthly payment",
            body: "Adjust the deposit, term and illustrative rate to see an indicative monthly figure.",
            defaultPrice: 45000,
            defaultDeposit: 5000,
            defaultTermMonths: 60,
            defaultAnnualRate: 6.9,
            disclaimer:
              "Illustrative estimate only. This is not an offer of credit. Final terms depend on lender approval, taxes, fees, and individual circumstances.",
          },
        },
        {
          id: "glo3d-vdp-cta",
          type: "cta-banner",
          props: {
            eyebrow: "Next step",
            title: "See it in person, or ask us anything",
            body: "Tell us which vehicle you are looking at and we will confirm availability and arrange a test drive.",
            primaryLabel: "Contact the team",
            primaryHref: "/contact",
            secondaryLabel: "Back to inventory",
            secondaryHref: "/vehicles",
          },
        },
      ],
    },
  },
];
