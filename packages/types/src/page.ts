import type { TenantId } from "./tenant";

/**
 * Site Builder page model — Epic L, storage per ADR-003 (Option B).
 *
 * A page is a document. Its content is an ordered array of blocks stored as a
 * jsonb `PageBlocksDocument` inside immutable `page_revisions`. The `Page`
 * itself holds only metadata + pointers to the current draft and published
 * revisions. There is no normalized per-block table.
 */

/** A single block on a page. `props` are validated per-type at the edge of the
 * system (admin on write, registry on render) — never trusted as stored. */
export type PageBlock = {
  /** Client-generated UUID, stable across edits (React keys + clean diffs). */
  id: string;
  /** Registry key, e.g. "hero", "product-grid", "vehicle-inventory". */
  type: string;
  props: Record<string, unknown>;
};

/** The ordered blocks document stored in `page_revisions.blocks`. `version`
 * lets us migrate the document shape later without guessing. */
export type PageBlocksDocument = {
  version: number;
  blocks: PageBlock[];
};

export type PageRevisionKind = "draft" | "published" | "autosave";

export type PageRevision = {
  id: string;
  pageId: string;
  tenantId: TenantId;
  kind: PageRevisionKind;
  blocks: PageBlocksDocument;
  createdBy: string | null;
  createdAt: string;
};

export type PageSeoMeta = {
  title?: string;
  description?: string;
  ogImage?: string;
};

export type Page = {
  id: string;
  tenantId: TenantId;
  slug: string;
  title: string;
  navOrder: number;
  /** Reserved pages (home, products, vehicles, contact) can be edited but not deleted. */
  isReserved: boolean;
  seoMeta: PageSeoMeta;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the public `<PageRenderer>` consumes — a published page + its blocks.
 * Returned by the `get_published_page` RPC / `fetchPublishedPage()`. */
export type PublishedPage = {
  id: string;
  slug: string;
  title: string;
  seoMeta: PageSeoMeta;
  blocks: PageBlocksDocument;
  publishedRevisionId: string | null;
};
