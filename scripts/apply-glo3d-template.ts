/**
 * Switch a tenant to Template Glo3D — the same path as the admin's Templates →
 * Publish (publish_site_design: snapshots the current theme for rollback and
 * keeps every non-design key such as branding/logo and header settings).
 * Optionally applies the Glo3D starter pages and a header call to action.
 *
 *   npx tsx scripts/apply-glo3d-template.ts --tenant demo-sean --env apps/admin/.env.local \
 *     [--pages home,vehicles,vehicle] [--replace] [--header-cta "Book a test drive=/contact"] [--dry-run]
 *
 * Pages are NEVER overwritten unless --replace is given; with --replace the new
 * content is added as new published + draft revisions (the previous revision
 * stays in history) and the page's title, nav order and SEO are left alone.
 * Refuses the `demo` and `default` tenants. Needs SUPABASE_URL (or
 * NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY; never prints them.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { GLO3D_STARTER_PAGES } from "@lume/blocks";
import { applyTemplateToDesign, getSiteTemplate, normalizeSiteDesign } from "@lume/types";

type AnyClient = any; // matches the other seed scripts: a few untyped admin writes

const PROTECTED_TENANTS = new Set(["demo", "default"]);

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readEnvFile(path: string | undefined): Record<string, string> {
  if (!path) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(resolve(path), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

const tenantSlug = arg("--tenant");
const dryRun = process.argv.includes("--dry-run");
const replace = process.argv.includes("--replace");
const pageSlugs = (arg("--pages") ?? "").split(",").map((slug) => slug.trim()).filter(Boolean);
const headerCta = arg("--header-cta");
const env = { ...readEnvFile(arg("--env")), ...process.env };
const supabaseUrl = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;

if (!tenantSlug) {
  console.error("Usage: apply-glo3d-template.ts --tenant <slug> [--env file] [--pages a,b] [--replace] [--header-cta 'Label=/path'] [--dry-run]");
  process.exit(1);
}
if (PROTECTED_TENANTS.has(tenantSlug)) {
  console.error(`Refusing to change the "${tenantSlug}" tenant.`);
  process.exit(1);
}
if (!supabaseUrl || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
for (const slug of pageSlugs) {
  if (!GLO3D_STARTER_PAGES.some((page) => page.slug === slug)) {
    console.error(`Unknown starter page "${slug}". Available: ${GLO3D_STARTER_PAGES.map((page) => page.slug).join(", ")}`);
    process.exit(1);
  }
}

const supabase: AnyClient = createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: tenant, error: tenantError } = await supabase
  .from("tenants")
  .select("id, slug, theme")
  .eq("slug", tenantSlug)
  .maybeSingle();
if (tenantError) throw new Error(`tenant lookup failed: ${tenantError.message}`);
if (!tenant) {
  console.error(`Tenant "${tenantSlug}" not found.`);
  process.exit(1);
}
const { data: owner } = await supabase
  .from("tenant_members")
  .select("user_id")
  .eq("tenant_id", tenant.id)
  .eq("role", "owner")
  .limit(1)
  .maybeSingle();

// 1. Template: exactly what Templates → Publish does.
const currentKey = (tenant.theme?.template?.key as string | undefined) ?? "luxury";
const current = normalizeSiteDesign(tenant.theme ?? null, getSiteTemplate(currentKey));
const next = applyTemplateToDesign(current, getSiteTemplate("glo3d"));
const designOwned = { schemaVersion: next.schemaVersion, template: next.template, shared: next.shared, modes: next.modes };
console.log(`→ ${tenantSlug}: template ${currentKey} → glo3d${dryRun ? " (dry run)" : ""}`);
if (!dryRun) {
  const { error } = await supabase.rpc("publish_site_design", {
    p_tenant_id: tenant.id,
    p_design: designOwned,
    p_actor: owner?.user_id ?? null,
    p_max_revisions: 20,
  });
  if (error) throw new Error(`publish_site_design failed: ${error.message}`);
}

// 2. Header call to action (merged; every other header setting is kept).
if (headerCta) {
  const [label, href] = headerCta.split("=").map((part) => part.trim());
  if (!label || !href?.startsWith("/")) {
    console.error('--header-cta must look like "Label=/path"');
    process.exit(1);
  }
  const { data: fresh, error: readError } = await supabase.from("tenants").select("theme").eq("id", tenant.id).single();
  if (readError) throw new Error(`theme read failed: ${readError.message}`);
  const theme = fresh.theme ?? {};
  const header = { ...(theme.header ?? {}), ctas: [{ label, href, style: "primary" }] };
  console.log(`→ ${tenantSlug}: header CTA "${label}" → ${href}${dryRun ? " (dry run)" : ""}`);
  if (!dryRun) {
    const { error } = await supabase.from("tenants").update({ theme: { ...theme, header } }).eq("id", tenant.id);
    if (error) throw new Error(`header update failed: ${error.message}`);
  }
}

// 3. Starter pages — never overwrite unless --replace.
for (const slug of pageSlugs) {
  const seed = GLO3D_STARTER_PAGES.find((page) => page.slug === slug)!;
  const { data: existing, error } = await supabase
    .from("pages")
    .select("id, published_revision_id, archived_at")
    .eq("tenant_id", tenant.id)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(`page lookup "${slug}" failed: ${error.message}`);
  if (existing?.published_revision_id && !replace) {
    console.log(`  • ${slug}: exists, left unchanged (pass --replace to add the Glo3D version as a new revision)`);
    continue;
  }
  console.log(`  • ${slug}: ${existing ? "new revision" : "create"} (${seed.blocks.blocks.length} blocks)${dryRun ? " (dry run)" : ""}`);
  if (dryRun) continue;
  let pageId = existing?.id as string | undefined;
  if (!pageId) {
    const { data: created, error: createError } = await supabase
      .from("pages")
      .insert({
        tenant_id: tenant.id,
        slug: seed.slug,
        title: seed.title,
        nav_order: seed.navOrder,
        is_reserved: seed.isReserved,
        seo_meta: seed.seoMeta,
      })
      .select("id")
      .single();
    if (createError) throw new Error(`create page "${slug}" failed: ${createError.message}`);
    pageId = created.id;
  }
  const revision = async (kind: "draft" | "published") => {
    const { data, error: revisionError } = await supabase
      .from("page_revisions")
      .insert({ page_id: pageId, tenant_id: tenant.id, kind, blocks: seed.blocks, created_by: owner?.user_id ?? null })
      .select("id")
      .single();
    if (revisionError) throw new Error(`${kind} revision "${slug}" failed: ${revisionError.message}`);
    return data.id as string;
  };
  const publishedId = await revision("published");
  const draftId = await revision("draft");
  const { error: pointerError } = await supabase
    .from("pages")
    .update({ published_revision_id: publishedId, draft_revision_id: draftId, archived_at: null })
    .eq("id", pageId);
  if (pointerError) throw new Error(`pointer update "${slug}" failed: ${pointerError.message}`);
}
console.log("✓ Done.");
