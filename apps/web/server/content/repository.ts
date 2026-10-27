import "server-only";
import { databaseConfiguration } from "../../config/environment.ts";
import { validatePageBlocksDocument } from "@lume/blocks";
import { getSiteTemplate, normalizeSiteDesign } from "@lume/types";
import type { PublishedPage, SiteDesign } from "@lume/types";

export class ContentUnavailable extends Error {
  constructor() {
    super("Published content is temporarily unavailable");
  }
}
export function publishedRepository(
  env = process.env,
  transport: typeof fetch = fetch,
) {
  const config = databaseConfiguration(env);
  async function rpc<T>(
    name:
      "get_published_page" | "get_tenant_theme" | "list_published_nav_pages",
    body: Record<string, string>,
  ): Promise<T[]> {
    try {
      const response = await transport(`${config.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
        headers: {
          apikey: config.anon,
          Authorization: `Bearer ${config.anon}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new ContentUnavailable();
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new ContentUnavailable();
      return data as T[];
    } catch {
      throw new ContentUnavailable();
    }
  }
  return {
    async page(tenantId: string, slug: string): Promise<PublishedPage | null> {
      const rows = await rpc<{
        id: string;
        slug: string;
        title: string;
        seo_meta: PublishedPage["seoMeta"];
        blocks: PublishedPage["blocks"];
        published_revision_id: string;
      }>("get_published_page", { p_tenant_id: tenantId, p_slug: slug });
      if (!rows.length) return null;
      const row = rows[0];
      if (
        rows.length !== 1 ||
        row.slug !== slug ||
        !row.published_revision_id ||
        !validatePageBlocksDocument(row.blocks).ok
      )
        throw new ContentUnavailable();
      // Only the existing public RPC; never page_revisions, drafts or caller revision IDs.
      return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        seoMeta: row.seo_meta ?? {},
        blocks: row.blocks,
        publishedRevisionId: row.published_revision_id,
      };
    },
    async design(slug: string): Promise<SiteDesign> {
      const [row] = await rpc<{ theme: Record<string, unknown> }>(
        "get_tenant_theme",
        { p_slug: slug },
      );
      if (!row) throw new ContentUnavailable();
      const template = row.theme?.template as { key?: string } | undefined;
      return normalizeSiteDesign(row.theme, getSiteTemplate(template?.key));
    },
    async navigation(tenantId: string) {
      return rpc<{ slug: string; title: string; nav_order: number }>(
        "list_published_nav_pages",
        { p_tenant_id: tenantId },
      );
    },
  };
}
