# ADR-003: Page Content Storage Model (Site Builder / Epic L)

**Date:** 2026-06-17
**Status:** Accepted
**Context:** Epic L turns the public site into a backend-customizable template
(full block editor). Tenants add/remove/reorder pages and compose each page
from blocks, with draft/publish, live preview, revision history, and rollback.
We must decide how a page's content (its ordered list of blocks) is stored in
Postgres. The existing Epic L tickets contradicted each other: SCRUM-182 implied
a normalized `page_blocks` table ("update page_blocks rows"), while SCRUM-187
implied a denormalized jsonb snapshot (`page_revisions.blocks_snapshot jsonb`).
Both cannot be the source of truth.

## Options considered

- **A — Normalized (`page_blocks`, one row per block).** Queryable across the
  catalog, but draft/publish requires duplicating all rows per draft (row
  explosion), publish becomes a multi-row transaction, revisions mean copying
  all rows, ordering needs `position` management, and concurrent editing is
  messy. We'd be normalizing a thing that is fundamentally a document.
- **B — Document + revisions (CHOSEN).** A page is a document; its blocks are an
  ordered jsonb array stored in immutable `page_revisions`. The `pages` row holds
  metadata + two pointers (`draft_revision_id`, `published_revision_id`).
- **C — Hybrid (`draft_blocks` + `published_blocks` columns on `pages`).**
  Simpler than B but the draft isn't itself a revision, so draft history is lost
  and the model is non-uniform; you refactor into B once revisions matter.

## Decision

**Option B — Document + Revisions.**

- `pages` stores metadata only: `id, tenant_id, slug, title, nav_order,
  is_reserved, seo_meta jsonb, draft_revision_id, published_revision_id,
  timestamps`. Unique on `(tenant_id, slug)`.
- `page_revisions` stores the ordered blocks document:
  `id, page_id, tenant_id, kind ['draft'|'published'|'autosave'],
  blocks jsonb, created_by, created_at`.
- `blocks` is a `PageBlocksDocument`: `{ version: number, blocks: PageBlock[] }`
  where `PageBlock = { id, type, props }`. The future `<PageRenderer>` consumes
  this array directly — registry lookup by `type`, validate `props`, render.
- **Pointers on `pages` are the source of truth** for which revision is the live
  working draft vs. the published version.
- **Lifecycle:** edit → mutate the draft revision's `blocks`. Publish → snapshot
  the draft into a new immutable `kind='published'` revision and point
  `published_revision_id` at it (atomic, single-row update). Rollback → copy a
  past revision's `blocks` into the draft ("restore as new draft").
- **Public read = one row**, via a `SECURITY DEFINER` RPC `get_published_page`
  so anonymous visitors get only the published blocks of active tenants and
  never see drafts. Authenticated members read/write via RLS on the tables.
- **No normalized `page_blocks` source-of-truth table.**

## Ticket reconciliation (resolves the contradiction)

- **SCRUM-179** — `pages` is metadata + pointers (not blocks).
- **SCRUM-182** — "edit blocks" = mutate the `blocks` array of the current draft
  revision, not write `page_blocks` rows.
- **SCRUM-186 / SCRUM-187** — canonical model: `page_revisions.blocks jsonb`,
  publish snapshots an immutable revision, rollback restores one as a new draft.
- **SCRUM-188** — reserved pages (`home, products, vehicles, contact`) are seeded
  rows with `is_reserved = true`; editable, not deletable.

## Consequences

- ✅ Atomic publish & free rollback; trivial revision history (immutable
  snapshots); one-row, cacheable public reads; render path is a direct array map.
- ✅ Tolerates dangling refs inside `props` (e.g. a deleted `vehicleId`) — resolve
  + validate at render with a graceful fallback rather than FK cascades.
- ⚠️ Cannot cheaply query "which pages use block X" across tenants. Acceptable;
  add a GIN index on `blocks` or a derived index table later if needed.
- ⚠️ Whole-document writes per save. Fine — pages are tens of blocks / a few KB.
- Cache the published document per `(tenant, slug)`, bust on publish (where
  Upstash / SCRUM-120 pays off).
- Theme stays separate on `tenants.theme` (SCRUM-184), not in page blocks.

## Decisions this forces (locked)

- Block `id`s: client-generated UUIDs, stable across edits (React keys + clean diffs).
- Autosave: one mutable draft revision per page, updated in place (debounced);
  immutable snapshot only on publish (+ optional named manual snapshots).
- Concurrency: optimistic via `updated_at`/version check; last-writer-wins + warning.
- Validation: at write (admin) and at render (graceful fallback) — never trust stored jsonb.
