export type SeoValues = {
  title?: string;
  description?: string;
  ogImage?: string;
};
export type SeoOptions = {
  page?: SeoValues;
  tenant?: SeoValues;
  fallback?: SeoValues;
  canonicalPath?: string;
};
export type ResolvedSeo = {
  title: string;
  description: string;
  ogImage: string;
  canonical: string;
};
export const LUME_SEO_FALLBACK: Required<SeoValues> = {
  title: "LUME",
  description: "Luxury versions of everyday energy.",
  ogImage: "/logo.svg",
};
export function resolveSeo(
  {
    page,
    tenant,
    fallback = LUME_SEO_FALLBACK,
    canonicalPath = "/",
  }: SeoOptions,
  origin = "",
): ResolvedSeo {
  const title = firstText(
    page?.title,
    tenant?.title,
    fallback.title,
    LUME_SEO_FALLBACK.title,
  );
  const description = firstText(
    page?.description,
    tenant?.description,
    fallback.description,
    LUME_SEO_FALLBACK.description,
  );
  const ogImage = toAbsoluteUrl(
    firstText(
      page?.ogImage,
      tenant?.ogImage,
      fallback.ogImage,
      LUME_SEO_FALLBACK.ogImage,
    ),
    origin,
  );
  const canonical = toAbsoluteUrl(canonicalPath, origin);

  return { title, description, ogImage, canonical };
}
function firstText(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}
function toAbsoluteUrl(value: string, origin: string): string {
  if (!origin) return value;
  try {
    return new URL(value, origin).toString();
  } catch {
    return value;
  }
}
