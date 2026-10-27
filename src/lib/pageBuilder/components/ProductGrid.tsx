import { InteractiveProductGrid } from "@lume/blocks/react/InteractiveProductGrid";
import { PRODUCTS, PRODUCT_CATEGORIES } from "@/experience/products/catalog";
import { useSound } from "@/lib/sound";
import { usePageBuilderRenderContext } from "../renderContext";
import type { BlockComponentProps } from "../registry";
import "@/experience/ui/ProductsPage/ProductsPage.css";
export function ProductGrid(props: BlockComponentProps) {
  const { play } = useSound();
  const { onSelectProduct } = usePageBuilderRenderContext();
  return (
    <InteractiveProductGrid
      {...props}
      PRODUCTS={PRODUCTS}
      PRODUCT_CATEGORIES={PRODUCT_CATEGORIES}
      play={play}
      onSelectProduct={(id) => onSelectProduct?.(id)}
    />
  );
}
