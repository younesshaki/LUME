/**
 * Tenant provisioning — the one implementation behind self-serve signup
 * (admin onboarding) and operator tooling (scripts/create-tenant.ts).
 *
 * Requires a service-role client: provisioning writes across tables the new
 * owner can't touch yet (they only become a member here). Callers gate it —
 * the admin flow requires an authenticated session and provisions for that
 * user only.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TENANT_THEME } from "@lume/types";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export type PageSeed = {
  slug: string;
  title: string;
  navOrder: number;
  isReserved: boolean;
  seoMeta: Record<string, unknown>;
  blocks: { version: number; blocks: Array<{ id: string; type: string; props: Record<string, unknown> }> };
};

export type ProvisionTenantInput = {
  ownerUserId: string;
  name: string;
  /** Page documents to seed (pass @lume/blocks DEFAULT_PAGES). */
  pages: readonly PageSeed[];
};

export type ProvisionTenantResult = {
  tenantId: string;
  slug: string;
  name: string;
  created: boolean;
};

const MAX_SLUG_ATTEMPTS = 20;
const RESERVED_SLUGS = new Set(["default", "www", "app", "api", "admin", "static", "cdn"]);

/** URL-safe slug from a display name: "Acme Motors!" → "acme-motors". */
export function slugifyTenantName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * If the caller already owns a tenant, provisioning is a no-op returning it —
 * signup double-submits and email-confirm round trips stay harmless.
 */
export async function findOwnedTenant(
  client: DbClient,
  ownerUserId: string
): Promise<ProvisionTenantResult | null> {
  const { data: membership } = await client
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", ownerUserId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data: tenant } = await client
    .from("tenants")
    .select("id, slug, name")
    .eq("id", membership.tenant_id)
    .maybeSingle();
  if (!tenant) return null;
  return { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, created: false };
}

export async function provisionTenant(
  client: DbClient,
  input: ProvisionTenantInput
): Promise<ProvisionTenantResult> {
  const existing = await findOwnedTenant(client, input.ownerUserId);
  if (existing) return existing;

  const name = input.name.trim();
  if (!name) throw new Error("Tenant name is required.");

  const base = slugifyTenantName(name) || "site";
  let tenant: { id: string; slug: string; name: string } | null = null;
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS && !tenant; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    if (RESERVED_SLUGS.has(candidate)) continue;
    const { data, error } = await client
      .from("tenants")
      // Starter theme so a brand-new public site never renders unthemed;
      // the owner customizes it later in the branding editor.
      .insert({ slug: candidate, name, status: "active", theme: DEFAULT_TENANT_THEME })
      .select("id, slug, name")
      .maybeSingle();
    if (!error && data) {
      tenant = data;
      break;
    }
    // 23505 = unique violation on slug: another tenant got there first.
    if (error && !`${error.code}`.includes("23505")) {
      throw new Error(`tenant insert failed: ${error.message}`);
    }
  }
  if (!tenant) throw new Error(`Could not find a free slug for "${name}".`);

  const { error: memberErr } = await client
    .from("tenant_members")
    .upsert({ tenant_id: tenant.id, user_id: input.ownerUserId, role: "owner" });
  if (memberErr) throw new Error(`owner membership failed: ${memberErr.message}`);

  const { error: personaErr } = await client
    .from("bot_personas")
    .insert({ tenant_id: tenant.id });
  if (personaErr) throw new Error(`default persona failed: ${personaErr.message}`);

  await seedTenantPages(client, tenant.id, input.pages);

  return { tenantId: tenant.id, slug: tenant.slug, name: tenant.name, created: true };
}

/**
 * Seed page documents: page row + published & draft revisions, pointers set.
 * Pages that already have a published revision are left untouched.
 */
export async function seedTenantPages(
  client: DbClient,
  tenantId: string,
  pages: readonly PageSeed[]
): Promise<void> {
  for (const seed of pages) {
    const { data: existing, error: lookupErr } = await client
      .from("pages")
      .select("id, published_revision_id")
      .eq("tenant_id", tenantId)
      .eq("slug", seed.slug)
      .maybeSingle();
    if (lookupErr) throw new Error(`page "${seed.slug}" lookup failed: ${lookupErr.message}`);
    // A page that already has a published revision is customer content — never touch it.
    if (existing?.published_revision_id) continue;

    let pageId = existing?.id;
    if (!pageId) {
      const { data: inserted, error: insertErr } = await client
        .from("pages")
        .insert({
          tenant_id: tenantId,
          slug: seed.slug,
          title: seed.title,
          nav_order: seed.navOrder,
          is_reserved: seed.isReserved,
          seo_meta: seed.seoMeta,
          draft_revision_id: null,
          published_revision_id: null,
        })
        .select("id")
        .single();
      if (insertErr || !inserted) {
        throw new Error(`page "${seed.slug}" insert failed: ${insertErr?.message ?? "no row"}`);
      }
      pageId = inserted.id;
    }

    const publishedId = await insertRevision(client, pageId, tenantId, "published", seed.blocks);
    const draftId = await insertRevision(client, pageId, tenantId, "draft", seed.blocks);

    const { error: ptrErr } = await client
      .from("pages")
      .update({ draft_revision_id: draftId, published_revision_id: publishedId })
      .eq("id", pageId);
    if (ptrErr) throw new Error(`page "${seed.slug}" pointer update failed: ${ptrErr.message}`);
  }
}

async function insertRevision(
  client: DbClient,
  pageId: string,
  tenantId: string,
  kind: "draft" | "published",
  blocks: PageSeed["blocks"]
): Promise<string> {
  const { data, error } = await client
    .from("page_revisions")
    .insert({ page_id: pageId, tenant_id: tenantId, kind, blocks, created_by: null })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`insert ${kind} revision failed: ${error?.message ?? "no row"}`);
  }
  return data.id;
}
