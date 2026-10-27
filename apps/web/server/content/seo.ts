import "server-only";
import type { Metadata } from "next";
import { ContentUnavailable } from "./repository";
import { contentContext, contentPage } from "./context";
import { canonicalFor } from "../vehicles/presentation";
import { resolveSeo } from "@lume/blocks/seo";
export async function contentMetadata(slug: string): Promise<Metadata> {
  let result;
  try {
    result = await contentPage(slug);
  } catch (error) {
    if (!(error instanceof ContentUnavailable)) throw error;
    // Keep useful, non-indexable error metadata in the server document. The
    // page still fails with HTTP 500; draft content is never used as fallback.
    let context;
    try {
      context = await contentContext();
    } catch {
      return {
        title: "Content unavailable",
        description: "Published content is temporarily unavailable.",
        robots: { index: false, follow: false },
      };
    }
    const { tenant } = context;
    return {
      title: `Content unavailable | ${tenant.name}`,
      description:
        "Published content is temporarily unavailable. Please try again shortly.",
      robots: { index: false, follow: false },
      alternates: {
        canonical: canonicalFor(tenant, slug === "home" ? "/" : `/${slug}`),
      },
    };
  }
  const { tenant, page } = result;
  const url = canonicalFor(tenant, slug === "home" ? "/" : `/${slug}`);
  const resolved = resolveSeo(
    { page: page.seoMeta, tenant: { title: tenant.name }, canonicalPath: url },
    new URL(tenant.canonical).origin,
  );
  const { title, description, ogImage: image } = resolved;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
      ...(image ? { images: [{ url: image, alt: page.title }] } : {}),
    },
    robots: { index: false, follow: false, nocache: true },
  };
}
