import type { ReactNode } from "react";
export function ProductGridView({
  title,
  subtitle,
  filters,
  cards,
}: {
  title: string;
  subtitle: string;
  filters?: ReactNode;
  cards: ReactNode;
}) {
  return (
    <section>
      {(title || subtitle) && (
        <div className="productsPage__hero">
          <div className="productsPage__lamp" aria-hidden="true" />
          {title && <h2 className="productsPage__title">{title}</h2>}
          {subtitle && <p className="productsPage__subtitle">{subtitle}</p>}
        </div>
      )}

      {filters}

      <div className="productsPage__grid">{cards}</div>
    </section>
  );
}
