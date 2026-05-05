import { mediaUrl } from "@/config/cdn";

export type ProductCategory = "drink" | "fragrance" | "fashion";
export type ProductFilterCategory = "all" | ProductCategory;
export type ProductStatus = "live" | "coming-soon";

export type Product = {
  id: string;
  brand: string;
  name: string;
  category: ProductCategory;
  status: ProductStatus;
  imageSrc?: string;
  description: string;
  detail: string;
  showcase?: {
    partIndex: number;
    chapterIndex: number;
    label: string;
  };
};

const redBullImage = mediaUrl("blackredbullcycles.png");

export const PRODUCTS: Product[] = [
  {
    id: "red-bull",
    brand: "Red Bull",
    name: "Special Edition",
    category: "drink",
    status: "live",
    imageSrc: redBullImage,
    description: "A black-and-gold energy object reframed as a cinematic luxury ritual.",
    detail:
      "The Red Bull Special Edition is the first LUME product study: sharper, darker, and staged around anticipation, material contrast, and a premium reveal.",
    showcase: {
      partIndex: 6,
      chapterIndex: 0,
      label: "View Showcase",
    },
  },
  {
    id: "starbucks",
    brand: "Starbucks",
    name: "Reserve Blend",
    category: "drink",
    status: "coming-soon",
    imageSrc: mediaUrl("starbucksLUME.png"),
    description: "A reserve coffee concept imagined for a slower, more private service ritual.",
    detail:
      "This LUME edition explores how a familiar coffee object could become part of a hotel-only ceremony through restrained packaging, dark surfaces, and gold detail.",
  },
  {
    id: "moet",
    brand: "Moët & Chandon",
    name: "Blanc de Blancs",
    category: "drink",
    status: "coming-soon",
    imageSrc: mediaUrl("products/moet.webp"),
    description: "A champagne object designed for quiet celebration rather than public display.",
    detail:
      "The Moët & Chandon direction frames the bottle as an invitation-only table object, built around minimal contrast and cinematic reflection.",
  },
  {
    id: "ysl-femme",
    brand: "YSL",
    name: "Libre - Femme",
    category: "fragrance",
    status: "coming-soon",
    imageSrc: mediaUrl("YSLfemmeLUME.png"),
    description: "A fragrance study focused on presence, shadow, and a more intimate reveal.",
    detail:
      "The YSL Libre Femme concept uses LUME's black-gold language to turn fragrance into a staged object of arrival, pause, and close inspection.",
  },
  {
    id: "ysl-homme",
    brand: "YSL",
    name: "Y - Homme",
    category: "fragrance",
    status: "coming-soon",
    imageSrc: mediaUrl("YSLmenLUME.png"),
    description: "A darker fragrance concept built around restraint and sharp material contrast.",
    detail:
      "The YSL Homme direction treats the bottle as a precise personal object, with emphasis on silhouette, tactility, and controlled light.",
  },
  {
    id: "hermes",
    brand: "Hermes",
    name: "Carre Soie",
    category: "fashion",
    status: "coming-soon",
    imageSrc: mediaUrl("products/hermes.webp"),
    description: "A silk object presented as part of LUME's private in-room product language.",
    detail:
      "The Hermes study imagines textile, packaging, and handling as one luxury gesture inside the LUME stay.",
  },
  {
    id: "rolex",
    brand: "Rolex",
    name: "Daytona Edition",
    category: "fashion",
    status: "coming-soon",
    imageSrc: mediaUrl("products/rolex.webp"),
    description: "A timepiece concept staged around rarity, precision, and controlled access.",
    detail:
      "The Rolex Daytona Edition is treated as an object seen by invitation, using LUME's cinematic visual system to emphasize detail and absence.",
  },
];

export const PRODUCT_CATEGORIES: { id: ProductFilterCategory; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "drink", label: "DRINK" },
  { id: "fragrance", label: "FRAGRANCE" },
  { id: "fashion", label: "FASHION" },
];

export function getProductById(productId: string | null): Product | undefined {
  if (!productId) return undefined;
  return PRODUCTS.find((product) => product.id === productId);
}
