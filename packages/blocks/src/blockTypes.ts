import { z } from "zod";
import { variantSchema, type BlockVariant } from "./variants";

export type BlockMode = "experience" | "standard";
export type BlockCategory = "content" | "data" | "media";

export type BlockValidationResult = { ok: true } | { ok: false; errors: string[] };

export type BlockFieldType =
  | "text"
  | "color"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "url"
  | "string-list"
  | "statement-list";

export type BlockFieldOption = {
  label: string;
  value: string;
};

export type BlockField = {
  name: string;
  label: string;
  type: BlockFieldType;
  options?: BlockFieldOption[];
  itemFields?: BlockField[];
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
  /**
   * Alternate designs for this block. Declaration order is the picker's order,
   * and the first entry is the fallback for an unknown stored value. A block
   * declaring variants MUST also carry `variant` in its schema and defaults —
   * blockTypes.test.ts asserts the two never drift.
   */
  variants?: readonly BlockVariant[];
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

/**
 * Trade-in form designs. Order matters: the first is the fallback for an
 * unknown stored value, and `classic` is the pre-variants look — so existing
 * pages are untouched by the introduction of variants.
 */
const TRADE_IN_FORM_VARIANTS: readonly BlockVariant[] = [
  {
    id: "classic",
    label: "Classic",
    description: "Single column with the copy above the fields. The original layout.",
  },
  {
    id: "wizard",
    label: "Guided steps",
    description: "Three short steps instead of one long form. Fewer fields on screen at once.",
  },
  {
    id: "spotlight",
    label: "Spotlight",
    description: "Compact two-column card with an animated border. Suits mid-page placement.",
  },
];

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

const requiredShortText = z.string().trim().min(1, "This field is required").max(180);
const optionalShortText = z.string().max(180).optional().default("");
const optionalBodyText = z.string().max(2_000).optional().default("");
const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour, for example #B68A35")
  .default("#B68A35");
const requiredBodyText = z.string().trim().min(1, "This field is required").max(2_000);
const labelBodyItemSchema = z.object({
  label: z.string().trim().min(1, "Label is required").max(180),
  body: z.string().trim().min(1, "Body is required").max(2_000),
});
const labelBodyItemsSchema = z.array(labelBodyItemSchema).max(20).default([]);

function isSafeLinkValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (
    (trimmed.startsWith("/") && !trimmed.startsWith("//")) ||
    trimmed.startsWith("#")
  ) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return ["https:", "http:", "tel:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isSafeMediaValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const safeLinkSchema = z
  .string()
  .max(2_048)
  .refine(isSafeLinkValue, "Use a local path or an http(s), telephone, or email URL")
  .optional()
  .default("");
const safeMediaSchema = z
  .string()
  .max(2_048)
  .refine(isSafeMediaValue, "Use a local path or an http(s) media URL")
  .optional()
  .default("");

function isSupportedVideoValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host === "m.youtube.com" ||
      host === "youtube-nocookie.com" ||
      host === "vimeo.com" ||
      host === "player.vimeo.com"
    );
  } catch {
    return false;
  }
}

function isSupportedMapEmbedValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (
        host === "www.google.com" ||
        host === "maps.google.com" ||
        host.endsWith(".openstreetmap.org")
      )
    );
  } catch {
    return false;
  }
}

const videoEmbedUrlSchema = z
  .string()
  .max(2_048)
  .refine(isSupportedVideoValue, "Use a YouTube or Vimeo URL")
  .optional()
  .default("");
const mapEmbedUrlSchema = z
  .string()
  .max(2_048)
  .refine(isSupportedMapEmbedValue, "Use a Google Maps or OpenStreetMap embed URL")
  .optional()
  .default("");
const mediaItemSchema = z.object({
  label: z.string().trim().min(1, "Image alt text is required").max(180),
  body: z
    .string()
    .trim()
    .min(1, "Image URL is required")
    .max(2_048)
    .refine(isSafeMediaValue, "Use a local path or an http(s) image URL"),
});
const mediaItemsSchema = z.array(mediaItemSchema).max(20).default([]);
const logoItemSchema = z.object({
  label: z.string().trim().min(1, "Partner name is required").max(180),
  body: z
    .string()
    .trim()
    .min(1, "Use “text” or an image URL")
    .max(2_048)
    .refine(
      (value) => value.toLowerCase() === "text" || isSafeMediaValue(value),
      "Use “text”, a local path, or an http(s) image URL",
    ),
});
const logoItemsSchema = z.array(logoItemSchema).max(20).default([]);

function sectionFields(): BlockField[] {
  return [
    { name: "eyebrow", label: "Eyebrow", type: "text" },
    { name: "title", label: "Title", type: "text" },
    { name: "body", label: "Supporting copy", type: "textarea" },
  ];
}

function listField(
  name: string,
  label: string,
  itemLabel: string,
  itemBody: string,
  helpText?: string,
): BlockField {
  return {
    name,
    label,
    type: "statement-list",
    itemFields: [
      { name: "label", label: itemLabel, type: "text" },
      { name: "body", label: itemBody, type: "textarea" },
    ],
    ...(helpText ? { helpText } : {}),
  };
}

function basicSectionSchema<TExtra extends z.ZodRawShape>(extra: TExtra) {
  return z.object({
    eyebrow: optionalShortText,
    title: requiredShortText,
    body: optionalBodyText,
    ...extra,
  });
}

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
    palette: true,
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
    palette: true,
    defaultProps: {
      items: [] as Array<{ label: string; body: string }>,
    },
    schema: z.object({
      items: z.array(z.object({ label: z.string(), body: z.string() })).default([]),
    }),
    fields: [
      {
        name: "items",
        label: "Statements",
        type: "statement-list",
        itemFields: [
          { name: "label", label: "Label", type: "text" },
          { name: "body", label: "Body", type: "textarea" },
        ],
      },
    ],
  }),

  "rich-text": descriptor({
    type: "rich-text",
    displayName: "Rich Text",
    description: "Simple long-form copy.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
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
    palette: true,
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
      {
        name: "categories",
        label: "Categories",
        type: "string-list",
        helpText: "Leave empty to show every category.",
        options: [
          { label: "Drink", value: "drink" },
          { label: "Fragrance", value: "fragrance" },
          { label: "Fashion", value: "fashion" },
        ],
      },
    ],
  }),

  "vehicle-inventory": descriptor({
    type: "vehicle-inventory",
    displayName: "Vehicle Inventory",
    description: "Public vehicle inventory block.",
    category: "data",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      title: "Vehicles",
      showFilters: true,
      cardStyle: "classic" as const,
      cardColor: "#B68A35",
    },
    schema: z.object({
      title: nullableString,
      showFilters: z.boolean().default(true),
      cardStyle: z.enum(["classic", "notch", "bento"]).default("classic"),
      cardColor: hexColor,
    }),
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "showFilters", label: "Show filters", type: "boolean" },
      {
        name: "cardStyle",
        label: "Vehicle card style",
        type: "select",
        options: [
          { label: "Classic", value: "classic" },
          { label: "Notch", value: "notch" },
          { label: "Bento", value: "bento" },
        ],
        helpText: "Notch keeps all vehicle actions while adding a colour-led presentation. Bento arranges vehicles in an asymmetric grid with periodic larger tiles.",
      },
      {
        name: "cardColor",
        label: "Notch / Bento accent colour",
        type: "color",
        helpText: "Shown with the Notch and Bento styles. Changes appear in the live preview immediately.",
      },
    ],
  }),

  "showcase-gallery": descriptor({
    type: "showcase-gallery",
    displayName: "Showcase Gallery",
    description: "Showcase chapter entry cards.",
    category: "data",
    modes: ["experience", "standard"],
    experienceEnhanced: true,
    palette: true,
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
    fields: [
      { name: "title", label: "Title", type: "text" },
      {
        name: "chapterIds",
        label: "Chapter IDs",
        type: "string-list",
        options: [
          { label: "Chapter 1", value: "showcase-chapter-1" },
          { label: "Chapter 2", value: "showcase-chapter-2" },
          { label: "Chapter 3", value: "showcase-chapter-3" },
        ],
      },
    ],
  }),

  "trade-in-form": descriptor({
    type: "trade-in-form",
    displayName: "Trade-In Form",
    description: "Capture a vehicle appraisal request through the existing lead pipeline.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    // First block to carry variants. `classic` is first, so every document
    // written before variants existed keeps rendering exactly as it did.
    variants: TRADE_IN_FORM_VARIANTS,
    defaultProps: {
      variant: "classic",
      eyebrow: "Your Current Vehicle",
      title: "Begin with a considered valuation.",
      body:
        "Share the essentials. Our appraisal team will review the vehicle and return with a private, market-informed estimate.",
      buttonLabel: "Request appraisal",
      successMessage: "Your appraisal request is with our team. We will be in touch shortly.",
      disclaimer:
        "Estimates are subject to an in-person inspection, history review, and current market conditions.",
    },
    schema: basicSectionSchema({
      variant: variantSchema(["classic", "wizard", "spotlight"]),
      buttonLabel: requiredShortText,
      successMessage: requiredShortText,
      disclaimer: optionalBodyText,
    }),
    fields: [
      ...sectionFields(),
      { name: "buttonLabel", label: "Submit button label", type: "text" },
      { name: "successMessage", label: "Success message", type: "textarea" },
      { name: "disclaimer", label: "Appraisal disclaimer", type: "textarea" },
    ],
  }),

  "finance-calculator": descriptor({
    type: "finance-calculator",
    displayName: "Finance Calculator",
    description: "Estimate a monthly vehicle payment with an editable disclosure.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Finance",
      title: "Shape the terms around the drive.",
      body:
        "Adjust the purchase price, deposit, term, and illustrative rate to explore a monthly estimate.",
      defaultPrice: 85000,
      defaultDeposit: 15000,
      defaultTermMonths: 60,
      defaultAnnualRate: 6.9,
      disclaimer:
        "Illustrative estimate only. This is not an offer of credit. Final terms depend on lender approval, taxes, fees, and individual circumstances.",
    },
    schema: basicSectionSchema({
      defaultPrice: z.number().min(0).max(10_000_000),
      defaultDeposit: z.number().min(0).max(10_000_000),
      defaultTermMonths: z.number().int().min(12).max(120),
      defaultAnnualRate: z.number().min(0).max(100),
      disclaimer: requiredBodyText,
    }),
    fields: [
      ...sectionFields(),
      { name: "defaultPrice", label: "Default vehicle price", type: "number" },
      { name: "defaultDeposit", label: "Default deposit", type: "number" },
      { name: "defaultTermMonths", label: "Default term in months", type: "number" },
      { name: "defaultAnnualRate", label: "Default annual rate (%)", type: "number" },
      { name: "disclaimer", label: "Finance disclaimer", type: "textarea" },
    ],
  }),

  "test-drive-booking": descriptor({
    type: "test-drive-booking",
    displayName: "Test-Drive Booking",
    description: "Capture a preferred vehicle, date, and time as a test-drive lead.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Private Appointment",
      title: "Meet the vehicle on your terms.",
      body:
        "Choose a preferred date and time. A product specialist will confirm availability personally.",
      buttonLabel: "Request test drive",
      successMessage: "Your preferred appointment has been received. We will confirm it shortly.",
    },
    schema: basicSectionSchema({
      buttonLabel: requiredShortText,
      successMessage: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      { name: "buttonLabel", label: "Submit button label", type: "text" },
      { name: "successMessage", label: "Success message", type: "textarea" },
    ],
  }),

  "service-booking": descriptor({
    type: "service-booking",
    displayName: "Service Booking",
    description:
      "Schedule a service appointment — service type, preferred date and time, vehicle, and contact details captured as a lead.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Service & Parts",
      title: "Book your service appointment.",
      body:
        "Pick the work your vehicle needs and a preferred time. Our service team will confirm the appointment personally.",
      buttonLabel: "Request appointment",
      successMessage: "Your service request has been received. Our service team will confirm shortly.",
    },
    schema: basicSectionSchema({
      buttonLabel: requiredShortText,
      successMessage: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      { name: "buttonLabel", label: "Submit button label", type: "text" },
      { name: "successMessage", label: "Success message", type: "textarea" },
    ],
  }),

  "lead-capture-form": descriptor({
    type: "lead-capture-form",
    displayName: "Lead Capture Form",
    description: "A general dealership enquiry form backed by the existing lead pipeline.",    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Personal Assistance",
      title: "Start a private conversation.",
      body:
        "Tell us what you are looking for. A member of the dealership team will respond directly.",
      buttonLabel: "Send enquiry",
      successMessage: "Your enquiry has been received. We will follow up shortly.",
    },
    schema: basicSectionSchema({
      buttonLabel: requiredShortText,
      successMessage: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      { name: "buttonLabel", label: "Submit button label", type: "text" },
      { name: "successMessage", label: "Success message", type: "textarea" },
    ],
  }),

  "whatsapp-cta": descriptor({
    type: "whatsapp-cta",
    displayName: "WhatsApp CTA",
    description: "Open a dealership WhatsApp conversation with a prefilled message.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Direct Line",
      title: "Continue the conversation on WhatsApp.",
      body: "Speak with the dealership team for availability, specifications, or a private viewing.",
      phone: "15551234567",
      message: "Hello, I would like to speak with the dealership about a vehicle.",
      buttonLabel: "Message on WhatsApp",
    },
    schema: basicSectionSchema({
      phone: z.string().regex(/^[+()\d\s-]{7,24}$/, "Enter a valid WhatsApp number"),
      message: z.string().min(1).max(500),
      buttonLabel: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      {
        name: "phone",
        label: "WhatsApp number",
        type: "text",
        helpText: "Include the international country code.",
      },
      { name: "message", label: "Prefilled message", type: "textarea" },
      { name: "buttonLabel", label: "Button label", type: "text" },
    ],
  }),

  "cta-banner": descriptor({
    type: "cta-banner",
    displayName: "CTA Banner",
    description: "A focused conversion banner with primary and secondary actions.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Your Next Vehicle",
      title: "The right example deserves a closer look.",
      body: "Explore the live collection or arrange a private conversation with our team.",
      primaryLabel: "View inventory",
      primaryHref: "/vehicles",
      secondaryLabel: "Contact the team",
      secondaryHref: "/contact",
    },
    schema: basicSectionSchema({
      primaryLabel: requiredShortText,
      primaryHref: safeLinkSchema,
      secondaryLabel: optionalShortText,
      secondaryHref: safeLinkSchema,
    }),
    fields: [
      ...sectionFields(),
      { name: "primaryLabel", label: "Primary action label", type: "text" },
      { name: "primaryHref", label: "Primary action link", type: "url" },
      { name: "secondaryLabel", label: "Secondary action label", type: "text" },
      { name: "secondaryHref", label: "Secondary action link", type: "url" },
    ],
  }),

  "announcement-bar": descriptor({
    type: "announcement-bar",
    displayName: "Announcement Bar",
    description: "A restrained notice for arrivals, events, or dealership updates.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      message: "New arrivals are now available for private viewing.",
      linkLabel: "Explore the collection",
      linkHref: "/vehicles",
      dismissible: true,
    },
    schema: z.object({
      message: requiredShortText,
      linkLabel: optionalShortText,
      linkHref: safeLinkSchema,
      dismissible: z.boolean().default(true),
    }),
    fields: [
      { name: "message", label: "Announcement", type: "text" },
      { name: "linkLabel", label: "Link label", type: "text" },
      { name: "linkHref", label: "Link destination", type: "url" },
      { name: "dismissible", label: "Allow visitors to dismiss", type: "boolean" },
    ],
  }),

  "newsletter-signup": descriptor({
    type: "newsletter-signup",
    displayName: "New-Arrival Signup",
    description: "Capture visitors who want to hear about newly listed vehicles.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "First Look",
      title: "Be notified before the next arrival is widely seen.",
      body: "Join the private new-arrival list. We will only contact you when the collection changes.",
      buttonLabel: "Notify me",
      successMessage: "You are on the new-arrival list.",
    },
    schema: basicSectionSchema({
      buttonLabel: requiredShortText,
      successMessage: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      { name: "buttonLabel", label: "Submit button label", type: "text" },
      { name: "successMessage", label: "Success message", type: "textarea" },
    ],
  }),

  "featured-vehicles": descriptor({
    type: "featured-vehicles",
    displayName: "Featured Vehicles",
    description: "A curated or filtered vehicle carousel from the live tenant inventory.",
    category: "data",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Selected Inventory",
      title: "A considered edit of the current collection.",
      body: "Chosen for specification, provenance, and presence.",
      vehicleIds: [] as string[],
      make: "",
      bodyStyle: "",
      priceMax: 0,
      maxItems: 6,
      ctaLabel: "View all vehicles",
    },
    schema: basicSectionSchema({
      vehicleIds: z.array(z.string().uuid()).max(12).default([]),
      make: optionalShortText,
      bodyStyle: optionalShortText,
      priceMax: z.number().min(0).max(100_000_000).default(0),
      maxItems: z.number().int().min(1).max(12).default(6),
      ctaLabel: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      {
        name: "vehicleIds",
        label: "Curated vehicle IDs",
        type: "string-list",
        helpText: "Optional. Leave empty to use the filters below.",
      },
      { name: "make", label: "Make filter", type: "text" },
      { name: "bodyStyle", label: "Body style filter", type: "text" },
      { name: "priceMax", label: "Maximum price (0 for any)", type: "number" },
      { name: "maxItems", label: "Maximum vehicles", type: "number" },
      { name: "ctaLabel", label: "Inventory link label", type: "text" },
    ],
  }),

  "new-arrivals": descriptor({
    type: "new-arrivals",
    displayName: "New Arrivals",
    description: "Automatically show the latest live vehicles added by this tenant.",
    category: "data",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Just Arrived",
      title: "The newest additions to the collection.",
      body: "Recently listed and ready for a closer look.",
      maxItems: 6,
      ctaLabel: "See every new arrival",
    },
    schema: basicSectionSchema({
      maxItems: z.number().int().min(1).max(12).default(6),
      ctaLabel: requiredShortText,
    }),
    fields: [
      ...sectionFields(),
      { name: "maxItems", label: "Maximum vehicles", type: "number" },
      { name: "ctaLabel", label: "Inventory link label", type: "text" },
    ],
  }),

  "vehicle-search-band": descriptor({
    type: "vehicle-search-band",
    displayName: "Vehicle Search Band",
    description: "A quick make, model, and budget search that opens filtered inventory.",
    category: "data",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Find Your Vehicle",
      title: "Begin with the essentials.",
      body: "Choose a make, model, and budget. The full inventory will open with those filters applied.",
      buttonLabel: "Search inventory",
      defaultBudget: 0,
    },
    schema: basicSectionSchema({
      buttonLabel: requiredShortText,
      defaultBudget: z.number().min(0).max(100_000_000).default(0),
    }),
    fields: [
      ...sectionFields(),
      { name: "buttonLabel", label: "Search button label", type: "text" },
      { name: "defaultBudget", label: "Default maximum budget (0 for any)", type: "number" },
    ],
  }),

  "vehicle-spec-table": descriptor({
    type: "vehicle-spec-table",
    displayName: "Vehicle Specification Table",
    description: "A clear, editable table of vehicle or service specifications.",
    category: "data",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Specification",
      title: "The details, precisely stated.",
      body: "Use this table for a featured vehicle, ownership programme, or dealership service.",
      items: [
        { label: "Powertrain", body: "4.0-litre twin-turbo V8" },
        { label: "Transmission", body: "Eight-speed automatic" },
        { label: "Drivetrain", body: "All-wheel drive" },
        { label: "Exterior", body: "Obsidian Black" },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField("items", "Specifications", "Specification", "Value"),
    ],
  }),

  "vehicle-detail": descriptor({
    type: "vehicle-detail",
    displayName: "Vehicle Detail",
    description:
      "The full vehicle detail surface — gallery, price, actions, and specs — for the vehicle being viewed. Meant for the vehicle detail page.",
    category: "data",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Marketplace Concept",
      overviewTitle: "",
      overviewText: "",
      showGallery: true,
      showSpecs: true,
      showActions: true,
    },
    schema: z.object({
      eyebrow: requiredShortText,
      overviewTitle: optionalShortText,
      overviewText: optionalBodyText,
      showGallery: z.boolean().optional().default(true),
      showSpecs: z.boolean().optional().default(true),
      showActions: z.boolean().optional().default(true),
    }),
    fields: [
      {
        name: "eyebrow",
        label: "Eyebrow",
        type: "text",
        helpText: "Small line above the vehicle title.",
      },
      {
        name: "overviewTitle",
        label: "Overview heading",
        type: "text",
        helpText: "Optional. Shown with the overview text below the specs.",
      },
      {
        name: "overviewText",
        label: "Overview text",
        type: "textarea",
        helpText: "Optional dealer-written overview (e.g. inspection or warranty notes that apply to every vehicle). The section stays hidden while empty.",
      },
      { name: "showGallery", label: "Show gallery", type: "boolean" },
      { name: "showSpecs", label: "Show specs list", type: "boolean" },
      { name: "showActions", label: "Show action buttons", type: "boolean" },
    ],
  }),

  testimonials: descriptor({
    type: "testimonials",
    displayName: "Testimonials",
    description: "Customer comments presented as restrained proof points.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Client Notes",
      title: "Confidence, expressed quietly.",
      body: "A few words from clients who trusted us with their next vehicle.",
      items: [
        {
          label: "Amelia R. — Returning client",
          body: "Every detail was handled before I needed to ask. The car was exactly as described.",
        },
        {
          label: "Daniel M. — First-time buyer",
          body: "Measured advice, transparent history, and a delivery that felt genuinely personal.",
        },
        {
          label: "Sophia K. — Collector",
          body: "They understood the specification I wanted and waited for the right example.",
        },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField("items", "Testimonials", "Client", "Quote"),
    ],
  }),

  "review-summary": descriptor({
    type: "review-summary",
    displayName: "Review Summary",
    description: "Display a review rating, count, source, and supporting message.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Client Confidence",
      title: "A reputation built one handover at a time.",
      body: "Independent feedback from verified dealership clients.",
      rating: 4.9,
      reviewCount: 287,
      sourceLabel: "Read verified reviews",
      sourceHref: "",
    },
    schema: basicSectionSchema({
      rating: z.number().min(0).max(5),
      reviewCount: z.number().int().min(0).max(100_000_000),
      sourceLabel: optionalShortText,
      sourceHref: safeLinkSchema,
    }),
    fields: [
      ...sectionFields(),
      { name: "rating", label: "Rating out of 5", type: "number" },
      { name: "reviewCount", label: "Review count", type: "number" },
      { name: "sourceLabel", label: "Review link label", type: "text" },
      { name: "sourceHref", label: "Review link", type: "url" },
    ],
  }),

  "trust-stats": descriptor({
    type: "trust-stats",
    displayName: "Trust Statistics",
    description: "Animated dealership proof points with reduced-motion support.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Measured Experience",
      title: "The numbers behind the service.",
      body: "Edit each value as number, optional decimal places, and suffix: 2500|0|+.",
      items: [
        { label: "Vehicles delivered", body: "2500|0|+" },
        { label: "Client rating", body: "4.9|1|/5" },
        { label: "Years of expertise", body: "18|0|+" },
        { label: "Repeat clients", body: "72|0|%" },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField(
        "items",
        "Statistics",
        "Metric label",
        "Value | decimals | suffix",
        "Example: 4.9|1|/5 or 2500|0|+.",
      ),
    ],
  }),

  "logo-marquee": descriptor({
    type: "logo-marquee",
    displayName: "Logo Marquee",
    description: "A reduced-motion-safe marquee for brands or finance partners.",
    category: "media",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Trusted Relationships",
      title: "Names our clients already know.",
      body: "Add a partner name and an optional public logo URL. Text is used when no image is supplied.",
      items: [
        { label: "Porsche", body: "text" },
        { label: "Mercedes-Benz", body: "text" },
        { label: "BMW", body: "text" },
        { label: "Land Rover", body: "text" },
        { label: "Ferrari", body: "text" },
      ],
    },
    schema: basicSectionSchema({
      items: logoItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField(
        "items",
        "Partners",
        "Partner name / logo alt text",
        "Logo URL or “text”",
      ),
    ],
  }),

  "services-list": descriptor({
    type: "services-list",
    displayName: "Services List",
    description: "Present core dealership services in a clear responsive grid.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Beyond the Handover",
      title: "Ownership, considered in full.",
      body: "A dealership relationship should continue long after the keys change hands.",
      items: [
        { label: "Vehicle sourcing", body: "A discreet search for the exact specification you want." },
        { label: "Part exchange", body: "Market-informed valuations and a straightforward transition." },
        { label: "Finance", body: "A choice of structures explained with clarity." },
        { label: "Aftercare", body: "Introductions to trusted servicing, detailing, and transport partners." },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField("items", "Services", "Service", "Description"),
    ],
  }),

  "how-it-works": descriptor({
    type: "how-it-works",
    displayName: "How It Works",
    description: "Explain the dealership journey as an ordered set of steps.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "A Clear Process",
      title: "From first conversation to final handover.",
      body: "Every stage is deliberate, transparent, and led by one point of contact.",
      items: [
        { label: "Tell us what matters", body: "Share the vehicle, specification, timing, and ownership goals." },
        { label: "Review the right examples", body: "We present relevant cars with condition and provenance made clear." },
        { label: "Complete with confidence", body: "Inspection, documentation, finance, and delivery are coordinated around you." },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField("items", "Steps", "Step title", "Step description"),
    ],
  }),

  "faq-accordion": descriptor({
    type: "faq-accordion",
    displayName: "FAQ Accordion",
    description: "Accessible frequently asked questions using the shared accordion primitive.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Questions, Answered",
      title: "The details worth knowing.",
      body: "Clear answers before the conversation begins.",
      items: [
        {
          label: "Can you source a vehicle that is not listed?",
          body: "Yes. Share the model, specification, and timing and our team can begin a discreet search.",
        },
        {
          label: "Do you accept part exchange?",
          body: "Yes. We can review your current vehicle remotely before arranging a final inspection.",
        },
        {
          label: "Can delivery be arranged?",
          body: "Collection and enclosed transport options can be coordinated once the purchase is complete.",
        },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField("items", "Questions", "Question", "Answer"),
    ],
  }),

  "team-grid": descriptor({
    type: "team-grid",
    displayName: "Team Grid",
    description: "Introduce dealership specialists with roles and concise biographies.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Your Team",
      title: "Expertise with a name and a direct line.",
      body: "A small team, accountable for every detail.",
      items: [
        {
          label: "Alex Morgan",
          body: "Managing Director|Collector-car sourcing and long-term client relationships.",
        },
        {
          label: "Maya Laurent",
          body: "Sales Director|Contemporary performance and luxury vehicles.",
        },
        {
          label: "James Ellis",
          body: "Vehicle Specialist|Appraisals, provenance, and pre-delivery preparation.",
        },
      ],
    },
    schema: basicSectionSchema({
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField(
        "items",
        "Team members",
        "Name",
        "Role | short biography",
        "Separate the role and biography with |.",
      ),
    ],
  }),

  "split-feature": descriptor({
    type: "split-feature",
    displayName: "Split Feature",
    description: "An image-and-copy feature with an editable media position.",
    category: "media",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Prepared Without Compromise",
      title: "Every vehicle is presented with its story intact.",
      body:
        "Condition, provenance, ownership history, and preparation are considered before a car enters the collection.",
      mediaUrl: "",
      mediaAlt: "A dealership specialist inspecting a vehicle",
      mediaPosition: "left",
      ctaLabel: "Explore the collection",
      ctaHref: "/vehicles",
    },
    schema: basicSectionSchema({
      mediaUrl: safeMediaSchema,
      mediaAlt: requiredShortText,
      mediaPosition: z.enum(["left", "right"]).default("left"),
      ctaLabel: optionalShortText,
      ctaHref: safeLinkSchema,
    }),
    fields: [
      ...sectionFields(),
      { name: "mediaUrl", label: "Image", type: "url" },
      { name: "mediaAlt", label: "Image alt text", type: "text" },
      {
        name: "mediaPosition",
        label: "Image position",
        type: "select",
        options: [
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
        ],
      },
      { name: "ctaLabel", label: "Action label", type: "text" },
      { name: "ctaHref", label: "Action link", type: "url" },
    ],
  }),

  "video-embed": descriptor({
    type: "video-embed",
    displayName: "Video Embed",
    description: "A privacy-conscious YouTube or Vimeo presentation band without autoplay.",
    category: "media",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "In Motion",
      title: "See the vehicle as it was meant to be seen.",
      body: "Add a YouTube or Vimeo URL. Playback begins only when the visitor chooses.",
      videoUrl: "",
      caption: "Vehicle film",
    },
    schema: basicSectionSchema({
      videoUrl: videoEmbedUrlSchema,
      caption: optionalShortText,
    }),
    fields: [
      ...sectionFields(),
      {
        name: "videoUrl",
        label: "YouTube or Vimeo URL",
        type: "url",
        helpText: "Only YouTube and Vimeo URLs are embedded.",
      },
      { name: "caption", label: "Accessible video title", type: "text" },
    ],
  }),

  "gallery-masonry": descriptor({
    type: "gallery-masonry",
    displayName: "Masonry Gallery",
    description: "A responsive, lazy-loaded image gallery for showroom or vehicle photography.",
    category: "media",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "A Closer Look",
      title: "Details reveal the difference.",
      body: "Add an image description as the label and a public image URL as the body.",
      items: [] as Array<{ label: string; body: string }>,
    },
    schema: basicSectionSchema({
      items: mediaItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      listField(
        "items",
        "Gallery images",
        "Image alt text",
        "Public image URL",
      ),
    ],
  }),

  "map-hours": descriptor({
    type: "map-hours",
    displayName: "Map and Hours",
    description: "Show the dealership address, opening hours, and an optional safe map embed.",
    category: "media",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "Visit the Showroom",
      title: "Arrive when the pace is yours.",
      body: "Private appointments outside standard hours can be arranged in advance.",
      address: "1250 Motor Row, Beverly Hills, CA 90210",
      mapUrl: "https://maps.google.com/",
      mapEmbedUrl: "",
      items: [
        { label: "Monday–Friday", body: "09:00–18:00" },
        { label: "Saturday", body: "10:00–17:00" },
        { label: "Sunday", body: "By appointment" },
      ],
    },
    schema: basicSectionSchema({
      address: requiredBodyText,
      mapUrl: safeLinkSchema,
      mapEmbedUrl: mapEmbedUrlSchema,
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      { name: "address", label: "Address", type: "textarea" },
      { name: "mapUrl", label: "Open-in-maps link", type: "url" },
      {
        name: "mapEmbedUrl",
        label: "Map embed URL",
        type: "url",
        helpText: "Only Google Maps and OpenStreetMap embed URLs render as an iframe.",
      },
      listField("items", "Opening hours", "Day", "Hours"),
    ],
  }),

  "footer-contact": descriptor({
    type: "footer-contact",
    displayName: "Footer Contact",
    description: "A complete dealership contact and opening-hours footer block.",
    category: "content",
    modes: ["experience", "standard"],
    palette: true,
    defaultProps: {
      eyebrow: "The Dealership",
      title: "A direct line, whenever you are ready.",
      body: "For vehicle enquiries, private viewings, and sourcing requests, speak with our team.",
      phone: "+1 555 123 4567",
      whatsappPhone: "15551234567",
      email: "concierge@example.com",
      address: "1250 Motor Row, Beverly Hills, CA 90210",
      legalText: "Vehicle availability and specifications are subject to confirmation.",
      items: [
        { label: "Monday–Friday", body: "09:00–18:00" },
        { label: "Saturday", body: "10:00–17:00" },
        { label: "Sunday", body: "By appointment" },
      ],
    },
    schema: basicSectionSchema({
      phone: z.string().max(40),
      whatsappPhone: z.string().max(40),
      email: z.string().email().or(z.literal("")),
      address: requiredBodyText,
      legalText: optionalBodyText,
      items: labelBodyItemsSchema,
    }),
    fields: [
      ...sectionFields(),
      { name: "phone", label: "Telephone", type: "text" },
      { name: "whatsappPhone", label: "WhatsApp number", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "address", label: "Address", type: "textarea" },
      listField("items", "Opening hours", "Day", "Hours"),
      { name: "legalText", label: "Footer note", type: "textarea" },
    ],
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
