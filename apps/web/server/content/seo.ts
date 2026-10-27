import "server-only";
import type { Metadata } from "next";
import { contentPage } from "./context";
import { canonicalFor } from "../vehicles/presentation";
import { resolveSeo } from "@lume/blocks/seo";
export async function contentMetadata(slug: string): Promise<Metadata> {
  const { tenant, page } = await contentPage(slug);
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
