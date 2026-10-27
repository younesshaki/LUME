"use client";
import { InteractiveProductGrid } from "@lume/blocks/react/InteractiveProductGrid";
import type {
  Product,
  ProductFilterCategory,
} from "@lume/blocks/product-catalog";
import type { PageBlock } from "@lume/types";
const silent = () => {};
export default function ProductGrid({
  block,
  products,
  categories,
  tenant,
}: {
  block: PageBlock;
  products: Product[];
  categories: { id: ProductFilterCategory; label: string }[];
  tenant: string;
}) {
  const href = (id: string) =>
    `/products/${encodeURIComponent(id)}?tenant=${encodeURIComponent(tenant)}`;
  return (
    <InteractiveProductGrid
      block={block}
      mode="standard"
      PRODUCTS={products}
      PRODUCT_CATEGORIES={categories}
      play={silent}
      onSelectProduct={(id) => {
        window.location.href = href(id);
      }}
      productHref={href}
    />
  );
}
