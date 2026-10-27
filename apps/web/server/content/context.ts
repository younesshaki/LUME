import { getBlockDescriptor } from "@lume/blocks";
import { isBlockVisibleInMode } from "@lume/blocks/visibility";
import "server-only";
import { cache } from "react";
import { headers, cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getSiteTemplate, normalizeSiteDesign } from "@lume/types";
import { DEFAULT_PAGES } from "@lume/blocks";
import { getTenantSiteDesignStyles } from "@lume/blocks/theme-styles";
import { requestTenant } from "../tenant.ts";
import { publishedRepository } from "./repository.ts";

export const contentContext = cache(async () => {
  const h = await headers();
  const url = new URL(
    h.get("x-web-request-path") ?? "/",
    "http://request.internal",
  );
  const values = url.searchParams.getAll("tenant");
  const tenant = await requestTenant(values.length > 1 ? values : values[0]);
  // No public draft capability is introduced. Explicit draft/revision selectors fail closed.
  for (const key of [
    "draft",
    "revision",
    "revisionId",
    "previewToken",
    "preview",
  ])
    if (url.searchParams.has(key)) notFound();
  const repository = publishedRepository();
  const [publishedDesign, navigation] = await Promise.all([
    repository.design(tenant.slug),
    repository.navigation(tenant.tenantId),
  ]);
  const override = url.searchParams.get("template");
  if (override && !["luxury", "glo3d"].includes(override)) notFound();
  const design = override
    ? normalizeSiteDesign(
        { ...publishedDesign, template: { key: override, version: 1 } },
        getSiteTemplate(override),
      )
    : publishedDesign;
  const selectedMode =
    url.searchParams.get("theme") ?? (await cookies()).get("lume-theme")?.value;
  if (selectedMode && !["light", "dark"].includes(selectedMode)) notFound();
  const mode =
    selectedMode === "light" || selectedMode === "dark"
      ? selectedMode
      : (getSiteTemplate(design.template.key).defaultColorMode ?? "dark");
  const palette = getTenantSiteDesignStyles(design, mode);
  return {
    tenant,
    design,
    navigation,
    mode,
    palette,
    template: getSiteTemplate(design.template.key),
    url,
    repository,
  };
});
export const contentPage = cache(async (slug: string) => {
  const context = await contentContext();
  const published = await context.repository.page(
    context.tenant.tenantId,
    slug,
  );
  if (
    published &&
    published.blocks.blocks.some((b) => {
      const d = getBlockDescriptor(b.type);
      return d && isBlockVisibleInMode(d, "standard");
    })
  )
    return { ...context, page: published, state: "published" as const };
  const fallback = DEFAULT_PAGES.find(
    (p) => p.slug === slug && ["home", "contact", "products"].includes(slug),
  );
  if (!fallback && !published) notFound();
  const page =
    published ??
    (fallback
      ? {
          id: `fallback-${slug}`,
          slug,
          title: fallback.title,
          seoMeta: fallback.seoMeta,
          blocks: fallback.blocks,
          publishedRevisionId: null,
        }
      : null);
  if (!page) notFound();
  return {
    ...context,
    page:
      published && fallback ? { ...published, blocks: fallback.blocks } : page,
    state: published ? ("empty" as const) : ("fallback" as const),
  };
});
