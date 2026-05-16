import { lazy, Suspense, useState } from "react";
import { getProductById } from "@/experience/products/catalog";
import { hasDetailModel3D } from "@/experience/products/model3d";
import { useSound } from "@/lib/sound";
import { useDualMode } from "@/lib/DualModeContext";
import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { productDetailSoundActions } from "./ProductDetailPage.sounds";
import "./ProductDetailPage.css";

const DetailModelViewer = lazy(() => import("@/components/three/DetailModelViewer"));

type ProductDetailPageProps = {
  productId: string | null;
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToVehicles: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
  onViewShowcase: (partIndex: number, chapterIndex: number) => void;
};


export default function ProductDetailPage({
  productId,
  onGoHome,
  onNavigateToProducts,
  onNavigateToVehicles,
  onNavigateToShowcase,
  onNavigateToContact,
  onViewShowcase,
}: ProductDetailPageProps) {
  const { play } = useSound();
  const { mode } = useDualMode();
  const isLight = mode === "light";
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const product = getProductById(productId);
  const imageSrc = product && !imageLoadFailed ? product.imageSrc : undefined;

  const handleShowcaseClick = () => {
    if (!product?.showcase) return;

    play(productDetailSoundActions.showcase);
    onViewShowcase(product.showcase.partIndex, product.showcase.chapterIndex);
  };

  return (
    <CinematicShell>
      <div className="productDetail">
        <main className="productDetail__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          {!product ? (
            <section className="productDetail__missing">
              <p className="productDetail__eyebrow">Product</p>
              <h1>Product not found</h1>
              <button type="button" onMouseEnter={() => play(productDetailSoundActions.hover)} onClick={onNavigateToProducts}>
                Back to Products
              </button>
            </section>
          ) : (
            <section className="productDetail__hero">
              <div className="productDetail__media">
                {hasDetailModel3D(product) && !isLight ? (
                  <Suspense fallback={imageSrc ? <img src={imageSrc} alt={`${product.brand} ${product.name}`} /> : <div className="productDetail__placeholder">{product.brand}</div>}>
                    <DetailModelViewer
                      model={product.model3d}
                      fallbackImageSrc={imageSrc}
                      title={`${product.brand} ${product.name}`}
                    />
                  </Suspense>
                ) : imageSrc ? (
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
                      onMouseEnter={() => play(productDetailSoundActions.relatedProductHover)}
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
                    onMouseEnter={() => play(productDetailSoundActions.hover)}
                    onClick={onNavigateToProducts}
                  >
                    Back to Products
                  </button>
                </div>
              </div>
            </section>
          )}
        </main>
        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "products") onNavigateToProducts();
          else if (s === "vehicles") onNavigateToVehicles();
          else if (s === "showcase") onNavigateToShowcase();
          else if (s === "contact") onNavigateToContact();
        }} />
      </div>
    </CinematicShell>
  );
}
