import { MouseEvent, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { mediaUrl } from "@/config/cdn";
import {
  PRODUCTS,
  PRODUCT_CATEGORIES,
  type Product,
  type ProductFilterCategory,
} from "../products/catalog";
import { useSound } from "../../lib/sound";
import CinematicShell from "./CinematicShell";
import "./ProductsPage.css";

const lumeLogoImage = mediaUrl("LUMElogo.png");

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
      onMouseEnter={() => play("product.card.hover")}
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
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

export default function ProductsPage({
  onGoHome,
  onSelectProduct,
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

    play("product.filter.click");
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
        <div className="productsPage__floatingLogo" aria-hidden="true">
          <img src={lumeLogoImage} alt="" />
        </div>

        <header className="productsPage__header">
          <nav className="productsPage__nav" aria-label="Primary">
            <button
              type="button"
              className="productsPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onGoHome}
            >
              Home
            </button>
            <span className="productsPage__navActive">Products</span>
            <button
              type="button"
              className="productsPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onNavigateToShowcase}
            >
              Showcase
            </button>
            <button
              type="button"
              className="productsPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onNavigateToContact}
            >
              Contact
            </button>
          </nav>
        </header>

        <main className="productsPage__main">
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
                    onMouseEnter={() => play("navbar.tab.hover")}
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

        <footer id="contact" className="productsPage__footer">
          <img className="productsPage__footerLogo" src={lumeLogoImage} alt="" />
          <div>
            <p>LUME</p>
            <span>Monaco — By invitation only.</span>
          </div>
        </footer>
      </div>
    </CinematicShell>
  );
}
