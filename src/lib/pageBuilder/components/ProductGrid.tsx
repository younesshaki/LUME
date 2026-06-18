import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSound } from "@/lib/sound";
import {
  PRODUCTS,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductCategory,
  type ProductFilterCategory,
} from "@/experience/products/catalog";
import { hasDetailModel3D } from "@/experience/products/model3d";
import { productsPageSoundActions } from "@/experience/ui/ProductsPage/ProductsPage.sounds";
import type { BlockComponentProps } from "../registry";
import { usePageBuilderRenderContext } from "../renderContext";
import { stringArrayProp, stringProp } from "./props";
import "@/experience/ui/ProductsPage/ProductsPage.css";

const ALL_CATEGORY_IDS = new Set<ProductFilterCategory>(
  PRODUCT_CATEGORIES.map((category) => category.id)
);

function ProductCard({
  product,
  onSelectProduct,
}: {
  product: Product;
  onSelectProduct: (productId: string) => void;
}) {
  const { play } = useSound();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const imageSrc = imageLoadFailed ? undefined : product.imageSrc;

  const handleClick = () => {
    onSelectProduct(product.id);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      className="productsPage__card productsPage__card--live"
      onClick={handleClick}
      onMouseEnter={() => play(productsPageSoundActions.cardHover)}
      onMouseMove={handleMouseMove}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="productsPage__cardImage">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={`${product.brand} ${product.name}`}
            onError={() => setImageLoadFailed(true)}
          />
        ) : (
          <div className="productsPage__cardImagePlaceholder">
            <span>{product.brand}</span>
          </div>
        )}
        {hasDetailModel3D(product) && (
          <span className="productsPage__modelTag">
            {product.model3d.tagLabel ?? "3D"}
          </span>
        )}
      </div>

      <div className="productsPage__cardBody">
        <span className="productsPage__cardCategory">{product.category}</span>
        <p className="productsPage__cardBrand">LUME x {product.brand}</p>
        <p className="productsPage__cardName">{product.name}</p>
      </div>

      <div className="productsPage__cardFooter">
        <span className="productsPage__cardCta">View Product</span>
      </div>
    </div>
  );
}

export function ProductGrid({ block, mode }: BlockComponentProps) {
  const { onSelectProduct } = usePageBuilderRenderContext();
  const [activeCategory, setActiveCategory] = useState<ProductFilterCategory>("all");
  const [touchedCategory, setTouchedCategory] = useState<ProductFilterCategory | null>(null);
  const [previousCategory, setPreviousCategory] = useState<ProductFilterCategory>("all");
  const timeoutRef = useRef<number | null>(null);
  const { play } = useSound();
  const isStandard = mode === "standard";
  const title = stringProp(block, "title");
  const subtitle = stringProp(block, "subtitle");
  const allowedCategories = useAllowedCategories(stringArrayProp(block, "categories"));
  const categories = useMemo(
    () =>
      PRODUCT_CATEGORIES.filter(
        (category) => category.id === "all" || allowedCategories.has(category.id)
      ),
    [allowedCategories]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeCategory !== "all" && !allowedCategories.has(activeCategory)) {
      setActiveCategory("all");
    }
  }, [activeCategory, allowedCategories]);

  const filtered = useMemo(
    () =>
      PRODUCTS.filter((product) => {
        if (!allowedCategories.has(product.category)) return false;
        return activeCategory === "all" || product.category === activeCategory;
      }),
    [activeCategory, allowedCategories]
  );

  const getCategoryIndex = (category: ProductFilterCategory) =>
    categories.findIndex((cat) => cat.id === category);

  const handleCategoryClick = (category: ProductFilterCategory) => {
    if (category === activeCategory) return;

    play(productsPageSoundActions.filterChange);
    setPreviousCategory(activeCategory);
    setActiveCategory(category);
    setTouchedCategory(category);

    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setTouchedCategory(null);
    }, 300);
  };

  const handleSelectProduct = (productId: string) => {
    if (onSelectProduct) {
      onSelectProduct(productId);
      return;
    }
    console.warn(`[pageBuilder] product selected without route handler: ${productId}`);
  };

  return (
    <section>
      {(title || subtitle) && (
        <div className="productsPage__hero">
          <div className="productsPage__lamp" aria-hidden="true" />
          {title && <h2 className="productsPage__title">{title}</h2>}
          {subtitle && <p className="productsPage__subtitle">{subtitle}</p>}
        </div>
      )}

      {categories.length > 1 && (
        <div className="productsPage__filters" role="tablist" aria-label="Filter by category">
          <div className="luxuryTabs">
            <AnimatePresence initial={false}>
              <motion.div
                key={activeCategory}
                className="luxuryTabs__active"
                initial={{ x: `${Math.max(0, getCategoryIndex(previousCategory)) * 100}%` }}
                animate={{ x: `${Math.max(0, getCategoryIndex(activeCategory)) * 100}%` }}
                transition={
                  isStandard
                    ? { duration: 0.2, ease: "easeInOut" }
                    : { type: "spring", stiffness: 300, damping: 30 }
                }
                style={{
                  width: `calc((100% - (var(--luxuryTabs-active-x-inset) * 2)) / ${categories.length})`,
                }}
              />
            </AnimatePresence>

            {categories.map((cat) => {
              const isActive = activeCategory === cat.id;
              const isTouched = touchedCategory === cat.id;

              return (
                <motion.button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-pressed={isActive}
                  className={`luxuryTabs__button${isActive ? " luxuryTabs__button--active" : ""}${isTouched ? " luxuryTabs__button--touched" : ""}`}
                  onMouseEnter={() => play(productsPageSoundActions.tabHover)}
                  onClick={() => handleCategoryClick(cat.id)}
                >
                  <span className="luxuryTabs__label">{cat.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      <div className="productsPage__grid">
        {filtered.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            onSelectProduct={handleSelectProduct}
          />
        ))}
      </div>
    </section>
  );
}

function useAllowedCategories(categories: string[]): Set<ProductCategory> {
  return useMemo(() => {
    const filtered = categories.filter(
      (category): category is ProductCategory =>
        category !== "all" && ALL_CATEGORY_IDS.has(category as ProductFilterCategory)
    );
    return new Set<ProductCategory>(
      filtered.length > 0 ? filtered : ["drink", "fragrance", "fashion"]
    );
  }, [categories]);
}
