/**
 * Default page documents — Epic L (SCRUM-188), foundation.
 *
 * These mirror the CURRENT hardcoded public site as closely as possible. They
 * are the seed for a new tenant and for the `default` tenant: the site you have
 * today becomes data. Per ADR-003 each page is a `PageBlocksDocument` (ordered
 * blocks); the live React rendering is NOT replaced by this yet — these are the
 * source the seed script writes into `pages` / `page_revisions`.
 *
 * Pure data: no React, no `@/` alias, no `import.meta.env`, so the seed script
 * (Node/tsx) can import it directly. Block `id`s are stable, human-readable seed
 * ids (unique within a page) — editor-created blocks will use UUIDs.
 *
 * Layout chrome (SiteHeader, BottomDock, ModeToggle, SiteFooter, CinematicShell)
 * is intentionally NOT represented as blocks — it stays app-level.
 */
import type { PageBlocksDocument, PageSeoMeta } from "@lume/types";

export type DefaultPageSeed = {
  slug: string;
  title: string;
  navOrder: number;
  isReserved: boolean;
  seoMeta: PageSeoMeta;
  blocks: PageBlocksDocument;
};

export const DEFAULT_PAGES: DefaultPageSeed[] = [
  {
    slug: "home",
    title: "Home",
    navOrder: 0,
    isReserved: true,
    seoMeta: {
      title: "LUME",
      description: "Luxury versions of everyday energy.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "home-hero",
          type: "hero",
          props: {
            eyebrow: "",
            title: "Luxury versions of everyday energy.",
            subtitle:
              "LUME reframes familiar products through black-gold design, cinematic pacing, and premium product storytelling.",
            backgroundImageKey: "",
          },
        },
        {
          id: "home-showcase",
          type: "showcase-gallery",
          props: {
            title: "",
            chapterIds: [
              "showcase-chapter-1",
              "showcase-chapter-2",
              "showcase-chapter-3",
            ],
          },
        },
        {
          id: "home-feature",
          type: "feature-band",
          props: {
            kicker: "Product Language",
            heading: "Energy, treated like an object of desire.",
            body: "The first LUME direction imagines a premium black-and-gold energy product: sharper, slower, more tactile, and built for a cinematic first impression.",
            mediaKey: "blackredbullcycles.png",
            mediaAlt: "Black and gold LUME product concept",
          },
        },
      ],
    },
  },
  {
    slug: "products",
    title: "Products",
    navOrder: 1,
    isReserved: true,
    seoMeta: {
      title: "Products — LUME",
      description:
        "Objects that exist only within LUME. Collaborations with the world's most recognised brands.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "products-hero",
          type: "hero",
          props: {
            eyebrow: "Exclusive Editions",
            title: "Products",
            subtitle:
              "Objects that exist only within LUME. Collaborations with the world's most recognised brands — unavailable anywhere else, never for sale.",
            backgroundImageKey: "",
          },
        },
        {
          id: "products-grid",
          type: "product-grid",
          props: { title: "", subtitle: "", categories: [] },
        },
      ],
    },
  },
  {
    slug: "vehicles",
    title: "Vehicles",
    navOrder: 2,
    isReserved: true,
    seoMeta: { title: "Vehicles — LUME" },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "vehicles-hero",
          type: "hero",
          props: {
            eyebrow: "",
            title: "Vehicles",
            subtitle: "",
            backgroundImageKey: "",
          },
        },
        {
          id: "vehicles-inventory",
          type: "vehicle-inventory",
          props: { title: "", showFilters: true },
        },
      ],
    },
  },
  {
    slug: "showcase",
    title: "Showcase",
    navOrder: 3,
    isReserved: true,
    seoMeta: {
      title: "Showcase — LUME",
      description: "Dedicated cinematic product stories.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "showcase-hero",
          type: "hero",
          props: {
            eyebrow: "Cinematic Entries",
            title: "Showcase",
            subtitle:
              "Dedicated cinematic product stories. These entries start with the LUME title card before loading the full experience.",
            backgroundImageKey: "",
          },
        },
        {
          id: "showcase-gallery",
          type: "showcase-gallery",
          props: {
            title: "",
            chapterIds: [
              "showcase-chapter-1",
              "showcase-chapter-2",
              "showcase-chapter-3",
            ],
          },
        },
      ],
    },
  },
  {
    slug: "contact",
    title: "Contact",
    navOrder: 4,
    isReserved: true,
    seoMeta: {
      title: "Access — LUME",
      description: "LUME is not found. It is entered by invitation.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "contact-hero",
          type: "hero",
          props: {
            eyebrow: "Access",
            title: "LUME is not found. It is entered by invitation.",
            subtitle:
              "LUME is a secret luxury hotel in Monaco built around a different form of exclusivity. Wealth is not the currency. Impact is.",
            backgroundImageKey: "",
          },
        },
        {
          id: "contact-statements",
          type: "statement-list",
          props: {
            items: [
              {
                label: "01",
                body: "Access to LUME is reserved for people who have positively influenced society and helped others. The invitation is not a purchase, a booking strategy, or a public application. It is recognition.",
              },
              {
                label: "02",
                body: "Once invited, a guest is placed on the list. From that moment, they may request a stay whenever availability allows, but only once per year. When the visit ends, the card resets. The wait becomes part of the experience.",
              },
              {
                label: "03",
                body: "Inside LUME, every object belongs to the stay. Special editions created with the world's most recognised brands exist only within the hotel. They are experienced there, and they remain there.",
              },
            ],
          },
        },
        {
          id: "contact-closing",
          type: "rich-text",
          props: {
            body: "For LUME, contact is not a form. It is the beginning of discretion, consideration, and alignment with a philosophy: the stay itself is the product, and access is earned by what a person contributes to the world.",
          },
        },
      ],
    },
  },
];
