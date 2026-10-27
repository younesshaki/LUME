import type { ReactNode } from "react";
import type { Product } from "../productCatalog";
export function ProductDetailView({
  product,
  media,
  actions,
}: {
  product: Product;
  media: ReactNode;
  actions: ReactNode;
}) {
  return (
    <section className="productDetail__hero">
      <div className="productDetail__media">{media}</div>

      <div className="productDetail__copy">
        <p className="productDetail__eyebrow">{product.category}</p>
        <h1>LUME x {product.brand}</h1>
        <h2>{product.name}</h2>
        <p className="productDetail__description">{product.description}</p>
        <p className="productDetail__detail">{product.detail}</p>

        <div className="productDetail__actions">{actions}</div>
      </div>
    </section>
  );
}
