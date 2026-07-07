/**
 * Site Builder page service layer — Epic L, storage per ADR-003 (Option B).
 *
 * A page is a document: its blocks live in immutable `page_revisions`, and the
 * `pages` row points at the current draft and published revisions. These helpers
 * are the only place that knows how to read/mutate that shape.
 *
 * Client choice is the caller's:
 *   • Public site (anon)  → fetchPublishedPage() via the get_published_page RPC.
 *   • Admin (authenticated / service-role) → draft reads + mutations (RLS or bypass).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Page,
  PageBlock,
  PageBlocksDocument,
  PageRevision,
  PublishedPage,
} from "@lume/types";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

/** Reserved pages map 1:1 to hardcoded routes that must always render. They can
 * be edited but never deleted (SCRUM-188). */
export const RESERVED_PAGE_SLUGS = [
  "home",
  "products",
  "vehicles",
  "showcase",
  "contact",
] as const;

export type ReservedPageSlug = (typeof RESERVED_PAGE_SLUGS)[number];

/** Slugs that may never be used as a tenant page (collide with app routes). */
export const BLOCKED_PAGE_SLUGS = ["admin", "api"] as const;

export const EMPTY_BLOCKS_DOCUMENT: PageBlocksDocument = { version: 1, blocks: [] };
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type PageSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; slug: string; reason: string };

export function isReservedSlug(slug: string): slug is ReservedPageSlug {
  return (RESERVED_PAGE_SLUGS as readonly string[]).includes(slug);
}

export function normalizePageSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function validateNewPageSlug(
  input: string,
  existingSlugs: readonly string[] = []
): PageSlugValidation {
  const slug = normalizePageSlug(input);
  if (!slug) return { ok: false, slug, reason: "Slug is required." };
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, slug, reason: "Use lowercase letters, numbers, and hyphens." };
  }
  if (isReservedSlug(slug)) {
    return { ok: false, slug, reason: "That slug is reserved for a system page." };
  }
  if ((BLOCKED_PAGE_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, slug, reason: "That slug conflicts with an app route." };
  }
  if (existingSlugs.map(normalizePageSlug).includes(slug)) {
    return { ok: false, slug, reason: "A page with that slug already exists." };
  }
  return { ok: true, slug };
}

// ─── Structural guards (shape only — per-block prop validation is the registry's job) ──
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPageBlock(value: unknown): value is PageBlock {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isRecord(value.props)
  );
}

export function isPageBlocksDocument(value: unknown): value is PageBlocksDocument {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    Array.isArray(value.blocks) &&
    value.blocks.every(isPageBlock)
  );
}

/** Coerce unknown jsonb into a safe document — never throws, falls back to empty. */
export function asBlocksDocument(value: unknown): PageBlocksDocument {
  return isPageBlocksDocument(value) ? value : EMPTY_BLOCKS_DOCUMENT;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────
type PageRow = Database["public"]["Tables"]["pages"]["Row"];
type PageRevisionRow = Database["public"]["Tables"]["page_revisions"]["Row"];

export function rowToPage(row: PageRow): Page {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    slug: row.slug,
    title: row.title,
    navOrder: row.nav_order,
    isReserved: row.is_reserved,
    seoMeta: (row.seo_meta ?? {}) as Page["seoMeta"],
    draftRevisionId: row.draft_revision_id,
    publishedRevisionId: row.published_revision_id,
    archivedAt: "archived_at" in row ? row.archived_at : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToPageRevision(row: PageRevisionRow): PageRevision {
  return {
    id: row.id,
    pageId: row.page_id,
    tenantId: row.tenant_id,
    kind: row.kind,
    blocks: asBlocksDocument(row.blocks),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

// ─── Public read (anon-friendly via SECURITY DEFINER RPC) ────────────────────
export async function fetchPublishedPage(
  client: DbClient,
  tenantId: string,
  slug: string
): Promise<PublishedPage | null> {
  const { data, error } = await client.rpc("get_published_page", {
    p_tenant_id: tenantId,
    p_slug: slug,
  });
  if (error) throw new Error(`fetchPublishedPage failed: ${error.message}`);
  const row = data?.[0];
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    seoMeta: (row.seo_meta ?? {}) as PublishedPage["seoMeta"],
    blocks: asBlocksDocument(row.blocks),
    publishedRevisionId: row.published_revision_id,
  };
}

/**
 * Ordered nav metadata (slug/title/nav_order) for the tenant's published,
 * non-archived pages — the public header's data source. Anon-friendly via
 * the SECURITY DEFINER RPC from migration 025.
 */
export async function listPublishedNavPages(
  client: DbClient,
  tenantId: string
): Promise<Array<{ slug: string; title: string; navOrder: number }>> {
  const { data, error } = await client.rpc("list_published_nav_pages", {
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(`listPublishedNavPages failed: ${error.message}`);
  return (data ?? []).map((row) => ({
    slug: row.slug,
    title: row.title,
    navOrder: row.nav_order,
  }));
}

// ─── Admin list ─────────────────────────────────────────────────────────────
export async function listPages(client: DbClient, tenantId: string): Promise<Page[]> {
  const { data, error } = await client
    .from("pages")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("nav_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listPages failed: ${error.message}`);
  return (data ?? []).map(rowToPage);
}

export async function createPage(
  client: DbClient,
  input: {
    tenantId: string;
    slug: string;
    title: string;
    navOrder: number;
    seoMeta?: Page["seoMeta"];
    blocks?: PageBlocksDocument;
  }
): Promise<Page> {
  const { data, error } = await client
    .from("pages")
    .insert({
      tenant_id: input.tenantId,
      slug: normalizePageSlug(input.slug),
      title: input.title,
      nav_order: input.navOrder,
      is_reserved: false,
      seo_meta: input.seoMeta ?? {},
      draft_revision_id: null,
      published_revision_id: null,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(`createPage failed: ${error?.message ?? "no row"}`);

  const page = rowToPage(data);
  await updateDraftBlocks(client, page.id, input.blocks ?? EMPTY_BLOCKS_DOCUMENT);
  return (await fetchDraftPage(client, page.id))?.page ?? page;
}

export async function duplicatePage(
  client: DbClient,
  sourcePageId: string,
  input: { slug: string; title: string; navOrder: number }
): Promise<Page> {
  const source = await fetchDraftPage(client, sourcePageId);
  if (!source) throw new Error(`duplicatePage: page ${sourcePageId} not found`);
  return createPage(client, {
    tenantId: source.page.tenantId,
    slug: input.slug,
    title: input.title,
    navOrder: input.navOrder,
    seoMeta: source.page.seoMeta,
    blocks: source.blocks,
  });
}

export async function archivePage(client: DbClient, pageId: string): Promise<void> {
  const page = await fetchPageForMutation(client, pageId);
  if (page.isReserved) throw new Error("Reserved system pages cannot be archived.");

  const { error } = await client
    .from("pages")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", pageId);
  if (error) throw pageArchiveError(error.message);
}

export async function deletePage(client: DbClient, pageId: string): Promise<void> {
  const page = await fetchPageForMutation(client, pageId);
  if (page.isReserved) throw new Error("Reserved system pages cannot be deleted.");

  const { error } = await client.from("pages").delete().eq("id", pageId);
  if (error) throw new Error(`deletePage failed: ${error.message}`);
}

export async function updatePageNavOrder(
  client: DbClient,
  tenantId: string,
  orderedPageIds: readonly string[]
): Promise<void> {
  await Promise.all(
    orderedPageIds.map(async (pageId, navOrder) => {
      const { error } = await client
        .from("pages")
        .update({ nav_order: navOrder })
        .eq("tenant_id", tenantId)
        .eq("id", pageId);
      if (error) throw new Error(`updatePageNavOrder failed: ${error.message}`);
    })
  );
}

// ─── Draft read (admin) ──────────────────────────────────────────────────────
export async function fetchDraftPage(
  client: DbClient,
  pageId: string
): Promise<{ page: Page; blocks: PageBlocksDocument } | null> {
  const { data: pageRow, error: pageErr } = await client
    .from("pages")
    .select("*")
    .eq("id", pageId)
    .maybeSingle();
  if (pageErr) throw new Error(`fetchDraftPage failed: ${pageErr.message}`);
  if (!pageRow) return null;

  const page = rowToPage(pageRow);
  if (!page.draftRevisionId) {
    return { page, blocks: EMPTY_BLOCKS_DOCUMENT };
  }

  const { data: revRow, error: revErr } = await client
    .from("page_revisions")
    .select("*")
    .eq("id", page.draftRevisionId)
    .maybeSingle();
  if (revErr) throw new Error(`fetchDraftPage revision failed: ${revErr.message}`);

  return { page, blocks: revRow ? asBlocksDocument(revRow.blocks) : EMPTY_BLOCKS_DOCUMENT };
}

/** List a page's revision history newest-first for admin preview/restore UI. */
export async function listPageRevisions(
  client: DbClient,
  pageId: string,
  tenantId?: string
): Promise<PageRevision[]> {
  let query = client
    .from("page_revisions")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listPageRevisions failed: ${error.message}`);
  return (data ?? []).map(rowToPageRevision);
}

// ─── Draft mutate ────────────────────────────────────────────────────────────
/** Replace the draft revision's blocks. Creates a draft revision if none exists. */
export async function updateDraftBlocks(
  client: DbClient,
  pageId: string,
  blocks: PageBlocksDocument
): Promise<void> {
  if (!isPageBlocksDocument(blocks)) {
    throw new Error("updateDraftBlocks: invalid PageBlocksDocument shape");
  }

  const { data: pageRow, error: pageErr } = await client
    .from("pages")
    .select("id, tenant_id, draft_revision_id")
    .eq("id", pageId)
    .maybeSingle();
  if (pageErr) throw new Error(`updateDraftBlocks failed: ${pageErr.message}`);
  if (!pageRow) throw new Error(`updateDraftBlocks: page ${pageId} not found`);

  if (pageRow.draft_revision_id) {
    const { error } = await client
      .from("page_revisions")
      .update({ blocks })
      .eq("id", pageRow.draft_revision_id);
    if (error) throw new Error(`updateDraftBlocks update failed: ${error.message}`);
  } else {
    const revisionId = await insertRevision(client, {
      pageId,
      tenantId: pageRow.tenant_id,
      kind: "draft",
      blocks,
    });
    const { error } = await client
      .from("pages")
      .update({ draft_revision_id: revisionId })
      .eq("id", pageId);
    if (error) throw new Error(`updateDraftBlocks pointer failed: ${error.message}`);
  }

  await touchPage(client, pageId);
}

// ─── Publish ─────────────────────────────────────────────────────────────────
/** Snapshot the current draft into a new immutable published revision and point
 * the page at it. Returns the new published revision id. */
export async function publishDraft(
  client: DbClient,
  pageId: string,
  createdBy: string | null = null
): Promise<string> {
  const draft = await fetchDraftPage(client, pageId);
  if (!draft) throw new Error(`publishDraft: page ${pageId} not found`);

  const revisionId = await insertRevision(client, {
    pageId,
    tenantId: draft.page.tenantId,
    kind: "published",
    blocks: draft.blocks,
    createdBy,
  });

  const { error } = await client
    .from("pages")
    .update({ published_revision_id: revisionId })
    .eq("id", pageId);
  if (error) throw new Error(`publishDraft pointer failed: ${error.message}`);

  await touchPage(client, pageId);
  return revisionId;
}

/** Remove the public revision pointer without deleting revision history or draft content. */
export async function unpublishPage(client: DbClient, pageId: string): Promise<void> {
  const { error } = await client
    .from("pages")
    .update({ published_revision_id: null })
    .eq("id", pageId);
  if (error) throw new Error(`unpublishPage failed: ${error.message}`);
  await touchPage(client, pageId);
}

// ─── Rollback ────────────────────────────────────────────────────────────────
/** Restore a past revision's blocks as the current draft (SCRUM-187). */
export async function restoreRevision(
  client: DbClient,
  pageId: string,
  revisionId: string
): Promise<void> {
  const { data: revRow, error: revErr } = await client
    .from("page_revisions")
    .select("blocks, page_id")
    .eq("id", revisionId)
    .maybeSingle();
  if (revErr) throw new Error(`restoreRevision failed: ${revErr.message}`);
  if (!revRow || revRow.page_id !== pageId) {
    throw new Error(`restoreRevision: revision ${revisionId} not found for page ${pageId}`);
  }
  await updateDraftBlocks(client, pageId, asBlocksDocument(revRow.blocks));
}

// ─── internals ───────────────────────────────────────────────────────────────
async function insertRevision(
  client: DbClient,
  input: {
    pageId: string;
    tenantId: string;
    kind: PageRevision["kind"];
    blocks: PageBlocksDocument;
    createdBy?: string | null;
  }
): Promise<string> {
  const { data, error } = await client
    .from("page_revisions")
    .insert({
      page_id: input.pageId,
      tenant_id: input.tenantId,
      kind: input.kind,
      blocks: input.blocks,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`insertRevision failed: ${error?.message ?? "no row"}`);
  }
  return data.id;
}

async function touchPage(client: DbClient, pageId: string): Promise<void> {
  // The updated_at trigger fires on any update; bumping a no-op column keeps it simple.
  await client.from("pages").update({ updated_at: new Date().toISOString() }).eq("id", pageId);
}

async function fetchPageForMutation(client: DbClient, pageId: string): Promise<Page> {
  const { data, error } = await client.from("pages").select("*").eq("id", pageId).single();
  if (error || !data) {
    throw new Error(`fetchPageForMutation failed: ${error?.message ?? "no row"}`);
  }
  return rowToPage(data);
}

function pageArchiveError(message: string): Error {
  if (message.includes("archived_at")) {
    return new Error(
      "archivePage failed: archived_at column is missing. Apply migration 018_pages_archived_at.sql."
    );
  }
  return new Error(`archivePage failed: ${message}`);
}
