import { MouseEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  PRODUCTS,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductFilterCategory,
} from "@/experience/products/catalog";
import { hasDetailModel3D } from "@/experience/products/model3d";
import { useSound } from "@/lib/sound";
import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { productsPageSoundActions } from "./ProductsPage.sounds";
import "./ProductsPage.css";


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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); }
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
        <p className="productsPage__cardBrand">LUME × {product.brand}</p>
        <p className="productsPage__cardName">{product.name}</p>
      </div>

      <div className="productsPage__cardFooter">
        <span className="productsPage__cardCta">View Product</span>
      </div>
    </div>
  );
}

type ProductsPageProps = {
  onGoHome: () => void;
  onSelectProduct: (productId: string) => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

export default function ProductsPage({
  onGoHome,
  onSelectProduct,
  onNavigateToVehicles,
  onNavigateToShowcase,
  onNavigateToContact,
}: ProductsPageProps) {
  const [activeCategory, setActiveCategory] = useState<ProductFilterCategory>("all");
  const [touchedCategory, setTouchedCategory] = useState<ProductFilterCategory | null>(null);
  const [previousCategory, setPreviousCategory] = useState<ProductFilterCategory>("all");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { play } = useSound();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const filtered = activeCategory === "all"
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === activeCategory);

  const getCategoryIndex = (category: ProductFilterCategory) =>
    PRODUCT_CATEGORIES.findIndex((cat) => cat.id === category);

  const handleCategoryClick = (category: ProductFilterCategory) => {
    if (category === activeCategory) return;

    play(productsPageSoundActions.filterChange);
    setPreviousCategory(activeCategory);
    setActiveCategory(category);
    setTouchedCategory(category);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setTouchedCategory(null);
    }, 300);
  };

  return (
    <CinematicShell>
      <div className="productsPage">
        <main className="productsPage__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          <div className="productsPage__hero">
            <div className="productsPage__lamp" aria-hidden="true" />
            <p className="productsPage__eyebrow">Exclusive Editions</p>
            <h1 className="productsPage__title">Products</h1>
            <p className="productsPage__subtitle">
              Objects that exist only within LUME. Collaborations with the world's
              most recognised brands — unavailable anywhere else, never for sale.
            </p>
          </div>

          <div className="productsPage__filters" role="tablist" aria-label="Filter by category">
            <div className="luxuryTabs">
              <AnimatePresence initial={false}>
                <motion.div
                  key={activeCategory}
                  className="luxuryTabs__active"
                  initial={{ x: `${getCategoryIndex(previousCategory) * 100}%` }}
                  animate={{ x: `${getCategoryIndex(activeCategory) * 100}%` }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  style={{ width: `calc((100% - (var(--luxuryTabs-active-x-inset) * 2)) / ${PRODUCT_CATEGORIES.length})` }}
                />
              </AnimatePresence>

              {PRODUCT_CATEGORIES.map((cat) => {
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

          <div className="productsPage__grid">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} onSelectProduct={onSelectProduct} />
            ))}
          </div>
        </main>

        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "vehicles") onNavigateToVehicles();
          else if (s === "showcase") onNavigateToShowcase();
          else if (s === "contact") onNavigateToContact();
        }} />
      </div>
    </CinematicShell>
  );
}
