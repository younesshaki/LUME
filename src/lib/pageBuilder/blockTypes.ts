/**
 * Block type catalog — Epic L (SCRUM-180), foundation skeleton.
 *
 * Each descriptor is the single source of truth for a block type's metadata,
 * default props, and prop validation. Per ADR-003 the future <PageRenderer>
 * looks a block's `type` up here, validates its `props`, and renders.
 *
 * NOTE: validation is intentionally a plain predicate (no Zod). Zod is not yet a
 * dependency; SCRUM-180's "propsSchema (Zod)" can replace these `validate`
 * functions later without touching call sites — the registry only depends on the
 * `validate` shape. This keeps the foundation dependency-free.
 *
 * No React imports here so this module is consumable by Node scripts (seed) and
 * the server alike. Component binding lives in `./registry`.
 */

export type BlockMode = "experience" | "standard";
export type BlockCategory = "content" | "data" | "media";

export type BlockValidationResult = { ok: true } | { ok: false; errors: string[] };

export type BlockDescriptor<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: string;
  displayName: string;
  category: BlockCategory;
  /** Modes the block renders in. */
  modes: BlockMode[];
  /** Enhanced in experience mode (e.g. 3D tilt) but degrades to a flat version in standard. */
  experienceEnhanced?: boolean;
  /** Heavy 3D / experience-only — skipped entirely in standard mode. */
  experienceOnly?: boolean;
  defaultProps: P;
  validate: (props: unknown) => BlockValidationResult;
};

// ─── tiny validation helpers (replace with Zod in SCRUM-180 if desired) ──────
function rec(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function ok(): BlockValidationResult {
  return { ok: true };
}
function fail(errors: string[]): BlockValidationResult {
  return { ok: false, errors };
}
function checkStrings(
  props: unknown,
  required: string[],
  optional: string[] = []
): BlockValidationResult {
  const o = rec(props);
  if (!o) return fail(["props must be an object"]);
  const errors: string[] = [];
  for (const key of required) {
    if (typeof o[key] !== "string" || (o[key] as string).length === 0) {
      errors.push(`"${key}" is required and must be a non-empty string`);
    }
  }
  for (const key of optional) {
    if (o[key] !== undefined && typeof o[key] !== "string") {
      errors.push(`"${key}" must be a string when present`);
    }
  }
  return errors.length ? fail(errors) : ok();
}

// ─── Block descriptors (derived from the real current site sections) ─────────
export const BLOCK_DESCRIPTORS = {
  hero: {
    type: "hero",
    displayName: "Hero",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: {
      eyebrow: "",
      title: "Luxury versions of everyday energy.",
      subtitle:
        "LUME reframes familiar products through black-gold design, cinematic pacing, and premium product storytelling.",
      backgroundImageKey: "",
    },
    validate: (p) => checkStrings(p, ["title"], ["eyebrow", "subtitle", "backgroundImageKey"]),
  } satisfies BlockDescriptor,

  "feature-band": {
    type: "feature-band",
    displayName: "Feature Band",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: {
      kicker: "Product Language",
      heading: "Energy, treated like an object of desire.",
      body: "The first LUME direction imagines a premium black-and-gold energy product: sharper, slower, more tactile, and built for a cinematic first impression.",
      mediaKey: "blackredbullcycles.png",
      mediaAlt: "Black and gold LUME product concept",
    },
    validate: (p) =>
      checkStrings(p, ["heading", "body"], ["kicker", "mediaKey", "mediaAlt"]),
  } satisfies BlockDescriptor,

  "statement-list": {
    type: "statement-list",
    displayName: "Statement List",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: {
      items: [] as Array<{ label: string; body: string }>,
    },
    validate: (p) => {
      const o = rec(p);
      if (!o) return fail(["props must be an object"]);
      if (!Array.isArray(o.items)) return fail(['"items" must be an array']);
      const bad = (o.items as unknown[]).some((item) => {
        const it = rec(item);
        return !it || typeof it.label !== "string" || typeof it.body !== "string";
      });
      return bad ? fail(['each item needs string "label" and "body"']) : ok();
    },
  } satisfies BlockDescriptor,

  "rich-text": {
    type: "rich-text",
    displayName: "Rich Text",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: { body: "" },
    validate: (p) => checkStrings(p, ["body"]),
  } satisfies BlockDescriptor,

  "product-grid": {
    type: "product-grid",
    displayName: "Product Grid",
    category: "data",
    modes: ["experience", "standard"],
    defaultProps: {
      title: "Products",
      subtitle: "",
      // empty = all categories
      categories: [] as string[],
    },
    validate: (p) => {
      const base = checkStrings(p, [], ["title", "subtitle"]);
      if (!base.ok) return base;
      const o = rec(p)!;
      if (o.categories !== undefined && !Array.isArray(o.categories)) {
        return fail(['"categories" must be an array of strings']);
      }
      return ok();
    },
  } satisfies BlockDescriptor,

  "vehicle-inventory": {
    type: "vehicle-inventory",
    displayName: "Vehicle Inventory",
    category: "data",
    modes: ["experience", "standard"],
    defaultProps: {
      title: "Vehicles",
      showFilters: true,
    },
    validate: (p) => {
      const base = checkStrings(p, [], ["title"]);
      if (!base.ok) return base;
      const o = rec(p)!;
      if (o.showFilters !== undefined && typeof o.showFilters !== "boolean") {
        return fail(['"showFilters" must be a boolean']);
      }
      return ok();
    },
  } satisfies BlockDescriptor,

  "showcase-gallery": {
    type: "showcase-gallery",
    displayName: "Showcase Gallery",
    category: "data",
    modes: ["experience", "standard"],
    // 3D tilt cards in experience mode, flat cards in standard (already how the
    // live StoryHomePage behaves) — so it's enhanced, not experience-only.
    experienceEnhanced: true,
    defaultProps: {
      title: "Showcase",
      chapterIds: [
        "showcase-chapter-1",
        "showcase-chapter-2",
        "showcase-chapter-3",
      ] as string[],
    },
    validate: (p) => {
      const base = checkStrings(p, [], ["title"]);
      if (!base.ok) return base;
      const o = rec(p)!;
      if (o.chapterIds !== undefined && !Array.isArray(o.chapterIds)) {
        return fail(['"chapterIds" must be an array of strings']);
      }
      return ok();
    },
  } satisfies BlockDescriptor,
} as const;

export type KnownBlockType = keyof typeof BLOCK_DESCRIPTORS;

export function getBlockDescriptor(type: string): BlockDescriptor | undefined {
  return (BLOCK_DESCRIPTORS as Record<string, BlockDescriptor>)[type];
}

export function listBlockDescriptors(): BlockDescriptor[] {
  return Object.values(BLOCK_DESCRIPTORS);
}
