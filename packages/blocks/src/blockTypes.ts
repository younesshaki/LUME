import { z } from "zod";

export type BlockMode = "experience" | "standard";
export type BlockCategory = "content" | "data" | "media";

export type BlockValidationResult = { ok: true } | { ok: false; errors: string[] };

export type BlockFieldType = "text" | "textarea" | "number" | "boolean" | "select" | "url";

export type BlockFieldOption = {
  label: string;
  value: string;
};

export type BlockField = {
  name: string;
  label: string;
  type: BlockFieldType;
  options?: BlockFieldOption[];
  helpText?: string;
  placeholder?: string;
};

export type BlockDescriptor<P extends Record<string, unknown> = Record<string, unknown>> = {
  type: string;
  displayName: string;
  description: string;
  category: BlockCategory;
  modes: BlockMode[];
  experienceEnhanced?: boolean;
  experienceOnly?: boolean;
  defaultProps: P;
  schema: z.ZodType<P>;
  fields: BlockField[];
  palette?: boolean;
  validate: (props: unknown) => BlockValidationResult;
};

export type EditorBlockDescriptor = Omit<BlockDescriptor, "schema" | "validate">;

function asValidationResult(result: z.SafeParseReturnType<unknown, unknown>): BlockValidationResult {
  if (result.success) return { ok: true };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }),
  };
}

function descriptor<P extends Record<string, unknown>>(
  input: Omit<BlockDescriptor<P>, "validate">
): BlockDescriptor<P> {
  return {
    ...input,
    validate: (props: unknown) => asValidationResult(input.schema.safeParse(props)),
  };
}

const nullableString = z.string().optional().default("");

export const heroSchema = z.object({
  eyebrow: nullableString,
  title: z.string().min(1, "Title is required"),
  subtitle: nullableString,
  primaryCtaLabel: nullableString,
  primaryCtaHref: nullableString,
  secondaryCtaLabel: nullableString,
  secondaryCtaHref: nullableString,
  backgroundImageKey: nullableString,
  mediaUrl: nullableString,
  alignment: z.enum(["left", "center"]).optional().default("center"),
});

export type HeroBlockProps = z.infer<typeof heroSchema>;

export const BLOCK_DESCRIPTORS = {
  hero: descriptor({
    type: "hero",
    displayName: "Hero",
    description: "Top-of-page headline, supporting copy, calls to action, and optional media.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "",
      title: "Luxury versions of everyday energy.",
      subtitle:
        "LUME reframes familiar products through black-gold design, cinematic pacing, and premium product storytelling.",
      primaryCtaLabel: "",
      primaryCtaHref: "",
      secondaryCtaLabel: "",
      secondaryCtaHref: "",
      backgroundImageKey: "",
      mediaUrl: "",
      alignment: "center",
    },
    schema: heroSchema,
    fields: [
      { name: "eyebrow", label: "Eyebrow", type: "text" },
      { name: "title", label: "Title", type: "text" },
      { name: "subtitle", label: "Subtitle", type: "textarea" },
      { name: "primaryCtaLabel", label: "Primary CTA label", type: "text" },
      { name: "primaryCtaHref", label: "Primary CTA href", type: "url" },
      { name: "secondaryCtaLabel", label: "Secondary CTA label", type: "text" },
      { name: "secondaryCtaHref", label: "Secondary CTA href", type: "url" },
      {
        name: "backgroundImageKey",
        label: "Background image key",
        type: "text",
        helpText: "Use an existing public media key when available.",
      },
      { name: "mediaUrl", label: "Media URL", type: "url" },
      {
        name: "alignment",
        label: "Alignment",
        type: "select",
        options: [
          { label: "Center", value: "center" },
          { label: "Left", value: "left" },
        ],
      },
    ],
  }),

  "feature-band": descriptor({
    type: "feature-band",
    displayName: "Feature Band",
    description: "A focused content band with copy and optional media.",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: {
      kicker: "Product Language",
      heading: "Energy, treated like an object of desire.",
      body: "The first LUME direction imagines a premium black-and-gold energy product: sharper, slower, more tactile, and built for a cinematic first impression.",
      mediaKey: "blackredbullcycles.png",
      mediaAlt: "Black and gold LUME product concept",
    },
    schema: z.object({
      kicker: nullableString,
      heading: z.string().min(1, "Heading is required"),
      body: z.string().min(1, "Body is required"),
      mediaKey: nullableString,
      mediaAlt: nullableString,
    }),
    fields: [
      { name: "kicker", label: "Kicker", type: "text" },
      { name: "heading", label: "Heading", type: "text" },
      { name: "body", label: "Body", type: "textarea" },
      { name: "mediaKey", label: "Media key", type: "text" },
      { name: "mediaAlt", label: "Media alt text", type: "text" },
    ],
  }),

  "statement-list": descriptor({
    type: "statement-list",
    displayName: "Statement List",
    description: "An ordered list of short statements.",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: {
      items: [] as Array<{ label: string; body: string }>,
    },
    schema: z.object({
      items: z.array(z.object({ label: z.string(), body: z.string() })).default([]),
    }),
    fields: [],
  }),

  "rich-text": descriptor({
    type: "rich-text",
    displayName: "Rich Text",
    description: "Simple long-form copy.",
    category: "content",
    modes: ["experience", "standard"],
    defaultProps: { body: "" },
    schema: z.object({ body: z.string().min(1, "Body is required") }),
    fields: [{ name: "body", label: "Body", type: "textarea" }],
  }),

  "product-grid": descriptor({
    type: "product-grid",
    displayName: "Product Grid",
    description: "Public product catalog block.",
    category: "data",
    modes: ["experience", "standard"],
    defaultProps: {
      title: "Products",
      subtitle: "",
      categories: [] as string[],
    },
    schema: z.object({
      title: nullableString,
      subtitle: nullableString,
      categories: z.array(z.string()).default([]),
    }),
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "subtitle", label: "Subtitle", type: "textarea" },
    ],
  }),

  "vehicle-inventory": descriptor({
    type: "vehicle-inventory",
    displayName: "Vehicle Inventory",
    description: "Public vehicle inventory block.",
    category: "data",
    modes: ["experience", "standard"],
    defaultProps: {
      title: "Vehicles",
      showFilters: true,
    },
    schema: z.object({
      title: nullableString,
      showFilters: z.boolean().default(true),
    }),
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "showFilters", label: "Show filters", type: "boolean" },
    ],
  }),

  "showcase-gallery": descriptor({
    type: "showcase-gallery",
    displayName: "Showcase Gallery",
    description: "Showcase chapter entry cards.",
    category: "data",
    modes: ["experience", "standard"],
    experienceEnhanced: true,
    defaultProps: {
      title: "Showcase",
      chapterIds: [
        "showcase-chapter-1",
        "showcase-chapter-2",
        "showcase-chapter-3",
      ] as string[],
    },
    schema: z.object({
      title: nullableString,
      chapterIds: z.array(z.string()).default([]),
    }),
    fields: [{ name: "title", label: "Title", type: "text" }],
  }),
} as const satisfies Record<string, BlockDescriptor>;

export type KnownBlockType = keyof typeof BLOCK_DESCRIPTORS;

export function getBlockDescriptor(type: string): BlockDescriptor | undefined {
  return (BLOCK_DESCRIPTORS as Record<string, BlockDescriptor>)[type];
}

export function listBlockDescriptors(): BlockDescriptor[] {
  return Object.values(BLOCK_DESCRIPTORS);
}

export function listPaletteBlockDescriptors(): BlockDescriptor[] {
  return listBlockDescriptors().filter((block) => block.palette);
}

export function listEditorBlockDescriptors(): EditorBlockDescriptor[] {
  return listBlockDescriptors().map(({ schema: _schema, validate: _validate, ...descriptor }) => descriptor);
}
