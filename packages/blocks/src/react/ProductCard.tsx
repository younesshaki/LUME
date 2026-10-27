import type { Ref, MouseEventHandler } from "react";
import type { Product } from "../productCatalog";
import { hasDetailModel3D } from "../productModel";
export function ProductCardView({
  product,
  imageSrc,
  href,
  onClick,
  onHover,
  onMouseMove,
  onImageError,
  imageRef,
}: {
  product: Product;
  imageSrc?: string;
  href?: string;
  onClick?: () => void;
  onHover?: () => void;
  onMouseMove?: MouseEventHandler<HTMLDivElement | HTMLAnchorElement>;
  onImageError?: () => void;
  imageRef?: Ref<HTMLImageElement>;
}) {
  const Root = href ? "a" : "div";
  return (
    <Root
      href={href}
      className="productsPage__card productsPage__card--live"
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseMove={onMouseMove}
      role="button"
      tabIndex={0}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <div className="productsPage__cardImage">
        {imageSrc ? (
          <img
            ref={imageRef}
            src={imageSrc}
            alt={`${product.brand} ${product.name}`}
            onError={onImageError}
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
    </Root>
  );
}
