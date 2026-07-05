/**
 * Seed Epic L page documents for a tenant — storage per ADR-003 (Option B).
 *
 * Writes the DEFAULT_PAGES (which mirror the current hardcoded site) into
 * `pages` + `page_revisions` for the target tenant. For each page it creates a
 * published revision and a draft revision (clone) and points the page at both.
 *
 * Run from repo root:
 *   tsx scripts/seed-default-pages.ts
 *   FORCE=1 tsx scripts/seed-default-pages.ts      # re-seed even if published
 *
 * Requires (repo-root .env.local or exported):
 *   SUPABASE_URL                https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   server-only; bypasses RLS
 * Optional:
 *   SEED_TENANT_SLUG=default
 *
 * Idempotent: upserts the page by (tenant_id, slug). Skips revision creation if
 * the page is already published, unless FORCE=1.
 */
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_PAGES } from "@lume/blocks";

// Untyped client (matches scripts/seed-default-tenant.ts) — the seed writes a
// handful of rows and doesn't need the generated Database typing.
type AnyClient = any;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✖ Missing required env: ${name}`);
    process.exit(1);
  }
  return v;
}

const TENANT_SLUG = process.env.SEED_TENANT_SLUG ?? "default";
const FORCE = process.env.FORCE === "1";

async function main() {
  const supabase: AnyClient = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id, slug")
    .eq("slug", TENANT_SLUG)
    .maybeSingle();
  if (tenantErr) throw new Error(`tenant lookup failed: ${tenantErr.message}`);
  if (!tenant) {
    console.error(`✖ Tenant "${TENANT_SLUG}" not found. Run seed-default-tenant first.`);
    process.exit(1);
  }
  const tenantId = tenant.id as string;
  console.log(`→ Seeding ${DEFAULT_PAGES.length} pages for tenant "${TENANT_SLUG}" (${tenantId})`);

  for (const seed of DEFAULT_PAGES) {
    await seedPage(supabase, tenantId, seed);
  }
  console.log("✓ Done.");
}

async function seedPage(
  supabase: AnyClient,
  tenantId: string,
  seed: (typeof DEFAULT_PAGES)[number]
) {
  // Upsert page metadata by (tenant_id, slug).
  const { data: pageRow, error: upsertErr } = await supabase
    .from("pages")
    .upsert(
      {
        tenant_id: tenantId,
        slug: seed.slug,
        title: seed.title,
        nav_order: seed.navOrder,
        is_reserved: seed.isReserved,
        seo_meta: seed.seoMeta,
      },
      { onConflict: "tenant_id,slug" }
    )
    .select("id, published_revision_id")
    .single();
  if (upsertErr) throw new Error(`upsert page "${seed.slug}" failed: ${upsertErr.message}`);

  const pageId = pageRow.id as string;

  if (pageRow.published_revision_id && !FORCE) {
    console.log(`  • ${seed.slug}: already published, skipping (FORCE=1 to overwrite)`);
    return;
  }

  // Published revision (immutable snapshot) + draft revision (working copy).
  const publishedId = await insertRevision(supabase, pageId, tenantId, "published", seed.blocks);
  const draftId = await insertRevision(supabase, pageId, tenantId, "draft", seed.blocks);

  const { error: ptrErr } = await supabase
    .from("pages")
    .update({ draft_revision_id: draftId, published_revision_id: publishedId })
    .eq("id", pageId);
  if (ptrErr) throw new Error(`pointer update "${seed.slug}" failed: ${ptrErr.message}`);

  console.log(`  • ${seed.slug}: seeded (${seed.blocks.blocks.length} blocks)`);
}

async function insertRevision(
  supabase: AnyClient,
  pageId: string,
  tenantId: string,
  kind: "draft" | "published",
  blocks: unknown
): Promise<string> {
  const { data, error } = await supabase
    .from("page_revisions")
    .insert({ page_id: pageId, tenant_id: tenantId, kind, blocks })
    .select("id")
    .single();
  if (error || !data) throw new Error(`insert ${kind} revision failed: ${error?.message ?? "no row"}`);
  return data.id as string;
}

main().catch((err) => {
  console.error("✖ Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
