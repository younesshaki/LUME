import { useState } from "react";
import { mediaUrl } from "@/config/cdn";
import { getProductById } from "../products/catalog";
import { useSound } from "../../lib/sound";
import CinematicShell from "./CinematicShell";
import "./ProductDetailPage.css";

type ProductDetailPageProps = {
  productId: string | null;
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
  onViewShowcase: (partIndex: number, chapterIndex: number) => void;
};

const lumeLogoImage = mediaUrl("LUMElogo.png");

export default function ProductDetailPage({
  productId,
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
  onViewShowcase,
}: ProductDetailPageProps) {
  const { play } = useSound();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const product = getProductById(productId);
  const imageSrc = product && !imageLoadFailed ? product.imageSrc : undefined;

  const handleShowcaseClick = () => {
    if (!product?.showcase) return;

    play("product.detail.showcase");
    onViewShowcase(product.showcase.partIndex, product.showcase.chapterIndex);
  };

  return (
    <CinematicShell>
      <div className="productDetail">
        <div className="productDetail__floatingLogo" aria-hidden="true">
          <img src={lumeLogoImage} alt="" />
        </div>

        <header className="productDetail__header">
          <nav className="productDetail__nav" aria-label="Primary">
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onGoHome}>
              Home
            </button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToProducts}>
              Products
            </button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToShowcase}>
              Showcase
            </button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToContact}>
              Contact
            </button>
          </nav>
        </header>

        <main className="productDetail__main">
          {!product ? (
            <section className="productDetail__missing">
              <p className="productDetail__eyebrow">Product</p>
              <h1>Product not found</h1>
              <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToProducts}>
                Back to Products
              </button>
            </section>
          ) : (
            <section className="productDetail__hero">
              <div className="productDetail__media">
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={`${product.brand} ${product.name}`}
                    onError={() => setImageLoadFailed(true)}
                  />
                ) : (
                  <div className="productDetail__placeholder">{product.brand}</div>
                )}
              </div>

              <div className="productDetail__copy">
                <p className="productDetail__eyebrow">{product.category}</p>
                <h1>LUME x {product.brand}</h1>
                <h2>{product.name}</h2>
                <p className="productDetail__description">{product.description}</p>
                <p className="productDetail__detail">{product.detail}</p>

                <div className="productDetail__actions">
                  {product.showcase ? (
                    <button
                      type="button"
                      className="productDetail__primaryAction"
                      onMouseEnter={() => play("product.card.hover")}
                      onClick={handleShowcaseClick}
                    >
                      {product.showcase.label}
                    </button>
                  ) : (
                    <span className="productDetail__soon">Showcase Coming Soon</span>
                  )}
                  <button
                    type="button"
                    className="productDetail__secondaryAction"
                    onMouseEnter={() => play("nav.hover")}
                    onClick={onNavigateToProducts}
                  >
                    Back to Products
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </CinematicShell>
  );
}
