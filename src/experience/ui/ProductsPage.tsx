import { MouseEvent, useState } from "react";
import { mediaUrl } from "@/config/cdn";
import { useUiSounds } from "../audio/useUiSounds";
import CinematicShell from "./CinematicShell";
import "./ProductsPage.css";

type Category = "all" | "drink" | "fragrance" | "fashion";
type ProductStatus = "live" | "coming-soon";

type Product = {
  id: string;
  brand: string;
  name: string;
  category: Exclude<Category, "all">;
  status: ProductStatus;
  imageSrc?: string;
  partIndex?: number;
  chapterIndex?: number;
};

const redBullImage = mediaUrl("blackredbullcycles.png");
const lumeLogoImage = mediaUrl("LUMElogo.png");

const PRODUCTS: Product[] = [
  {
    id: "red-bull",
    brand: "Red Bull",
    name: "Special Edition",
    category: "drink",
    status: "live",
    imageSrc: redBullImage,
    partIndex: 6,
    chapterIndex: 0,
  },
  {
    id: "starbucks",
    brand: "Starbucks",
    name: "Reserve Blend",
    category: "drink",
    status: "coming-soon",
    imageSrc: mediaUrl("starbucksLUME.png"),
  },
  {
    id: "moet",
    brand: "Moët & Chandon",
    name: "Blanc de Blancs",
    category: "drink",
    status: "coming-soon",
    imageSrc: mediaUrl("products/moet.webp"),
  },
  {
    id: "ysl-femme",
    brand: "YSL",
    name: "Libre — Femme",
    category: "fragrance",
    status: "coming-soon",
    imageSrc: mediaUrl("YSLfemmeLUME.png"),
  },
  {
    id: "ysl-homme",
    brand: "YSL",
    name: "Y — Homme",
    category: "fragrance",
    status: "coming-soon",
    imageSrc: mediaUrl("YSLmenLUME.png"),
  },
  {
    id: "hermes",
    brand: "Hermès",
    name: "Carré Soie",
    category: "fashion",
    status: "coming-soon",
    imageSrc: mediaUrl("products/hermes.webp"),
  },
  {
    id: "rolex",
    brand: "Rolex",
    name: "Daytona Edition",
    category: "fashion",
    status: "coming-soon",
    imageSrc: mediaUrl("products/rolex.webp"),
  },
];

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "drink", label: "Drink" },
  { id: "fragrance", label: "Fragrance" },
  { id: "fashion", label: "Fashion" },
];

function ProductCard({
  product,
  onEnter,
}: {
  product: Product;
  onEnter: (partIndex: number, chapterIndex: number) => void;
}) {
  const { playHover, playNavClick } = useUiSounds();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const isLive = product.status === "live";
  const imageSrc = imageLoadFailed ? undefined : product.imageSrc;

  const handleClick = () => {
    if (!isLive || product.partIndex === undefined || product.chapterIndex === undefined) return;
    playNavClick();
    onEnter(product.partIndex, product.chapterIndex);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  };

  return (
    <div
      className={`productsPage__card${isLive ? " productsPage__card--live" : ""}`}
      onClick={isLive ? handleClick : undefined}
      onMouseEnter={isLive ? playHover : undefined}
      onMouseMove={handleMouseMove}
      role={isLive ? "button" : undefined}
      tabIndex={isLive ? 0 : undefined}
      onKeyDown={isLive ? (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleClick(); }
      } : undefined}
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
        {isLive ? (
          <span className="productsPage__cardCta">View Experience</span>
        ) : (
          <span className="productsPage__cardSoon">Coming Soon</span>
        )}
      </div>
    </div>
  );
}

type ProductsPageProps = {
  onGoHome: () => void;
  onEnter: (partIndex: number, chapterIndex: number) => void;
  onNavigateToContact: () => void;
};

export default function ProductsPage({ onGoHome, onEnter, onNavigateToContact }: ProductsPageProps) {
  const [activeCategory, setActiveCategory] = useState<Category>("all");
  const { playHover, playNavClick } = useUiSounds();

  const filtered = activeCategory === "all"
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === activeCategory);

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
              onMouseEnter={playHover}
              onClick={() => { playNavClick(); onGoHome(); }}
            >
              Home
            </button>
            <span className="productsPage__navActive">Products</span>
            <button
              type="button"
              className="productsPage__navLink"
              onMouseEnter={playHover}
              onClick={() => { playNavClick(); onNavigateToContact(); }}
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
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat.id}
                className={`productsPage__filterBtn${activeCategory === cat.id ? " productsPage__filterBtn--active" : ""}`}
                onMouseEnter={playHover}
                onClick={() => { playNavClick(); setActiveCategory(cat.id); }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="productsPage__grid">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} onEnter={onEnter} />
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
