import { cache } from "react";
import { notFound } from "next/navigation";
import { createProductCatalog } from "@lume/blocks/product-catalog";
import { ProductDetailView } from "@lume/blocks/react/ProductDetail";
import { CinematicShellView } from "@lume/blocks/react/CinematicShell";
import { contentContext } from "../../../server/content/context";
import { canonicalFor } from "../../../server/vehicles/presentation";
import artwork from "../../../../../src/experience/assets/images/lume-homepage-background.png";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{ productId: string }> };
const productData = cache(async (id: string) => {
  const ctx = await contentContext();
  const page = await ctx.repository.page(ctx.tenant.tenantId, "products");
  const catalog = createProductCatalog(
    (key) =>
      `${process.env.WEB_PREVIEW_R2_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? ""}/${key}`,
  );
  const product = catalog.getProductById(id);
  if (!product) notFound();
  // A product is public only when exposed by the published product grid, or the
  // same built-in catalog fallback used by the legacy missing/empty products page.
  const grids =
    page?.blocks.blocks.filter((b) => b.type === "product-grid") ?? [];
  if (
    page &&
    page.blocks.blocks.length &&
    !grids.some(
      (b) =>
        !Array.isArray(b.props.categories) ||
        !b.props.categories.length ||
        b.props.categories.includes(product.category),
    )
  )
    notFound();
  return { ...ctx, product };
});
export async function generateMetadata({ params }: Props) {
  const { tenant, product } = await productData((await params).productId);
  const title = `${product.brand} ${product.name} | ${tenant.name}`;
  const url = canonicalFor(
    tenant,
    `/products/${encodeURIComponent(product.id)}`,
  );
  return {
    title,
    description: product.description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: product.description,
      url,
      type: "website",
      images: product.imageSrc ? [{ url: product.imageSrc }] : [],
    },
    robots: { index: false, follow: false },
  };
}
export default async function Page({ params }: Props) {
  const { tenant, product } = await productData((await params).productId);
  const back = `/products?tenant=${encodeURIComponent(tenant.slug)}`;
  return (
    <CinematicShellView mode="standard" artwork={artwork.src}>
      <div className="productDetail" data-web-content>
        <main
          className="productDetail__main"
          style={{ paddingTop: 72, paddingBottom: 160 }}
        >
          <ProductDetailView
            product={product}
            media={
              product.imageSrc ? (
                <img
                  src={product.imageSrc}
                  alt={`${product.brand} ${product.name}`}
                />
              ) : (
                <div className="productDetail__placeholder">
                  {product.brand}
                </div>
              )
            }
            actions={
              <>
                <a className="productDetail__secondaryAction" href={back}>
                  Back to Products
                </a>
                <a
                  className="productDetail__primaryAction"
                  href={`/contact?tenant=${encodeURIComponent(tenant.slug)}`}
                >
                  Contact the dealership
                </a>
              </>
            }
          />
        </main>
      </div>
    </CinematicShellView>
  );
}
