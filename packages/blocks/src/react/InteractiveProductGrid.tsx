"use client";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ProductCardView } from "./ProductCard";
import { ProductGridView } from "./ProductGrid";
import type {
  Product,
  ProductCategory,
  ProductFilterCategory,
} from "../productCatalog";
import type { BlockComponentProps } from "./types";
import { stringArrayProp, stringProp } from "./props";
import { productsPageSoundActions } from "../productSounds";

function ProductCard({
  product,
  onSelectProduct,
  href,
  play,
}: {
  product: Product;
  onSelectProduct: (productId: string) => void;
  href?: string;
  play: (
    action: (typeof productsPageSoundActions)[keyof typeof productsPageSoundActions],
  ) => void;
}) {
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const imageSrc = imageLoadFailed ? undefined : product.imageSrc;

  const handleClick = () => {
    onSelectProduct(product.id);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--spotlight-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--spotlight-y",
      `${event.clientY - rect.top}px`,
    );
  };

  return (
    <ProductCardView
      product={product}
      href={href}
      imageSrc={imageSrc}
      onClick={handleClick}
      onHover={() => play(productsPageSoundActions.cardHover)}
      onMouseMove={
        handleMouseMove as React.MouseEventHandler<
          HTMLDivElement | HTMLAnchorElement
        >
      }
      onImageError={() => setImageLoadFailed(true)}
    />
  );
}

export function InteractiveProductGrid({
  block,
  mode,
  PRODUCTS,
  PRODUCT_CATEGORIES,
  play,
  onSelectProduct,
  productHref,
}: BlockComponentProps & {
  PRODUCTS: Product[];
  PRODUCT_CATEGORIES: { id: ProductFilterCategory; label: string }[];
  play: (
    action: (typeof productsPageSoundActions)[keyof typeof productsPageSoundActions],
  ) => void;
  onSelectProduct: (id: string) => void;
  productHref?: (id: string) => string;
}) {
  const [activeCategory, setActiveCategory] =
    useState<ProductFilterCategory>("all");
  const [touchedCategory, setTouchedCategory] =
    useState<ProductFilterCategory | null>(null);
  const [previousCategory, setPreviousCategory] =
    useState<ProductFilterCategory>("all");
  const timeoutRef = useRef<number | null>(null);
  const isStandard = mode === "standard";
  const title = stringProp(block, "title");
  const subtitle = stringProp(block, "subtitle");
  const allowedCategories = useAllowedCategories(
    stringArrayProp(block, "categories"),
    PRODUCT_CATEGORIES,
  );
  const categories = useMemo(
    () =>
      PRODUCT_CATEGORIES.filter(
        (category) =>
          category.id === "all" || allowedCategories.has(category.id),
      ),
    [allowedCategories],
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
    [activeCategory, allowedCategories],
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
    console.warn(
      `[pageBuilder] product selected without route handler: ${productId}`,
    );
  };

  return (
    <ProductGridView
      title={title}
      subtitle={subtitle}
      filters={
        categories.length > 1 && (
          <div
            className="productsPage__filters"
            role="tablist"
            aria-label="Filter by category"
          >
            <div className="luxuryTabs">
              <AnimatePresence initial={false}>
                <motion.div
                  key={activeCategory}
                  className="luxuryTabs__active"
                  initial={{
                    x: `${Math.max(0, getCategoryIndex(previousCategory)) * 100}%`,
                  }}
                  animate={{
                    x: `${Math.max(0, getCategoryIndex(activeCategory)) * 100}%`,
                  }}
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
        )
      }
      cards={filtered.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          play={play}
          href={productHref?.(product.id)}
          onSelectProduct={handleSelectProduct}
        />
      ))}
    />
  );
}

function useAllowedCategories(
  categories: string[],
  all: { id: ProductFilterCategory }[],
): Set<ProductCategory> {
  const ALL_CATEGORY_IDS = new Set(all.map((c) => c.id));
  return useMemo(() => {
    const filtered = categories.filter(
      (category): category is ProductCategory =>
        category !== "all" &&
        ALL_CATEGORY_IDS.has(category as ProductFilterCategory),
    );
    return new Set<ProductCategory>(
      filtered.length > 0 ? filtered : ["drink", "fragrance", "fashion"],
    );
  }, [categories]);
}
