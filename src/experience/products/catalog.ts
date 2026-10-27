import { mediaUrl } from "@/config/cdn";
import { createProductCatalog } from "@lume/blocks/product-catalog";
export type { Product, ProductCategory, ProductFilterCategory, ProductStatus } from "@lume/blocks/product-catalog";
export const {PRODUCTS,PRODUCT_CATEGORIES,SHOWCASE_PREVIEW_PRODUCTS,getProductById,getShowcasePreviewForChapter} = createProductCatalog(mediaUrl);
