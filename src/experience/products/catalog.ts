import { mediaUrl } from "@/config/cdn";
import rawCatalog from "./catalog.json";

export type ProductCategory = "drink" | "fragrance" | "fashion";
export type ProductFilterCategory = "all" | ProductCategory;
export type ProductStatus = "live" | "coming-soon";

type RawProduct = {
  id: string;
  brand: string;
  name: string;
  category: ProductCategory;
  status: ProductStatus;
  imageKey?: string;
  imageRequired?: boolean;
  preferredImageKey?: string;
  description: string;
  detail: string;
  showcase?: {
    partIndex: number;
    chapterIndex: number;
    chapterId: string;
    label: string;
  };
  showcasePreviewChapterId?: string;
};

export type Product = RawProduct & {
  imageSrc?: string;
};

const catalog = rawCatalog as {
  products: RawProduct[];
  showcasePreviewProductIds: string[];
};

export const PRODUCTS: Product[] = catalog.products.map((product) => ({
  ...product,
  imageSrc: product.imageKey ? mediaUrl(product.imageKey) : undefined,
}));

export const PRODUCT_CATEGORIES: { id: ProductFilterCategory; label: string }[] = [
  { id: "all", label: "ALL" },
  { id: "drink", label: "DRINK" },
  { id: "fragrance", label: "FRAGRANCE" },
  { id: "fashion", label: "FASHION" },
];

export const SHOWCASE_PREVIEW_PRODUCTS = catalog.showcasePreviewProductIds
  .map((productId) => PRODUCTS.find((product) => product.id === productId))
  .filter((product): product is Product => Boolean(product));

export function getProductById(productId: string | null): Product | undefined {
  if (!productId) return undefined;
  return PRODUCTS.find((product) => product.id === productId);
}

export function getShowcasePreviewForChapter(
  chapterId: string,
  fallbackIndex: number
): Product {
  return (
    SHOWCASE_PREVIEW_PRODUCTS.find(
      (product) =>
        product.showcase?.chapterId === chapterId ||
        product.showcasePreviewChapterId === chapterId
    ) ??
    SHOWCASE_PREVIEW_PRODUCTS[fallbackIndex] ??
    SHOWCASE_PREVIEW_PRODUCTS[0] ??
    PRODUCTS[0]
  );
}
