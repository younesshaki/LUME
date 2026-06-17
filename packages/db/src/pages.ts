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

type DbClient = SupabaseClient<Database>;

/** Reserved pages map 1:1 to hardcoded routes that must always render. They can
 * be edited but never deleted (SCRUM-188). */
export const RESERVED_PAGE_SLUGS = [
  "home",
  "products",
  "vehicles",
  "contact",
] as const;

export type ReservedPageSlug = (typeof RESERVED_PAGE_SLUGS)[number];

/** Slugs that may never be used as a tenant page (collide with app routes). */
export const BLOCKED_PAGE_SLUGS = ["admin", "api"] as const;

export const EMPTY_BLOCKS_DOCUMENT: PageBlocksDocument = { version: 1, blocks: [] };

export function isReservedSlug(slug: string): slug is ReservedPageSlug {
  return (RESERVED_PAGE_SLUGS as readonly string[]).includes(slug);
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
