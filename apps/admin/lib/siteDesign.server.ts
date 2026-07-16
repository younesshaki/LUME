/**
 * Server-side website-design operations (Website Templates v1 foundation).
 *
 * All destructive design work goes through here, never straight from the
 * browser. Authorization mirrors the integrations pattern (owner/admin via
 * user_has_tenant_role); the tenant id always comes from the authorized context,
 * never the request body. The incoming document is normalized with the SHARED
 * validator (@lume/types) so arbitrary CSS/keys/URLs can't be persisted, and
 * background asset URLs are ownership-checked against the tenant's storage
 * ORIGIN + prefix (not just a path substring). Publishing goes through the
 * publish_site_design RPC (migration 068), which snapshots the previous
 * document into site_design_revisions (067), preserves non-editor keys, writes
 * the new design and prunes history — all atomically under a row lock.
 *
 * The admin design UI (Phase 3, Codex) calls these; it does not re-implement
 * validation or the registry.
 */
import "server-only";
import {
  applyTemplateToDesign,
  createDefaultSiteDesign,
  getSiteTemplate,
  normalizeSiteDesign,
  type SiteDesign,
} from "@lume/types";
import { createServiceClient } from "@lume/db/server";
import { TENANT_BUCKETS } from "@lume/db";
import { auditWrite } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  siteBackgroundObjectKey,
  isTenantSiteDesignAssetUrl,
  validateSiteBackgroundCandidate,
  type SiteBackgroundCandidate,
} from "@/lib/siteDesignAssets";
import { validateStoredSiteBackground } from "@/lib/siteDesignAssets.server";

export const MAX_DESIGN_REVISIONS = 20;

export type DesignResult =
  | { ok: true; design: SiteDesign }
  | { ok: false; error: string };

export type DesignRevisionSummary = {
  id: string;
  templateKey: string;
  templateVersion: number;
  publishedBy: string | null;
  createdAt: string;
};

type AuthorizedTenant = { tenantId: string; userId: string };

export type SiteBackgroundUploadResult =
  | { ok: true; objectKey: string; token: string; publicUrl: string }
  | { ok: false; error: string };

/** Owner/admin gate + tenant resolution. Returns null when unauthorized. */
async function authorizeDesignMutation(slug: string): Promise<AuthorizedTenant | null> {
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) return null;
  const { data: allowed, error } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin"],
  });
  return !error && allowed ? { tenantId: tenant.id, userId: user.id } : null;
}

/**
 * Ownership guard for a background asset URL. Root-relative product assets are
 * always allowed; a stored/uploaded asset must carry the tenant's id in its
 * path (uploads are keyed `{tenant_id}/site-design/...`). Everything else is a
 * cross-tenant or arbitrary external URL and is rejected.
 */
/** The public origin of the tenant-media storage bucket (host to pin against). */
function tenantMediaOrigin(service: ReturnType<typeof createServiceClient>): string | undefined {
  try {
    const probe = service.storage.from(TENANT_BUCKETS.media).getPublicUrl("_").data.publicUrl;
    return new URL(probe).origin;
  } catch {
    return undefined;
  }
}

async function assertOwnedBackgrounds(
  design: SiteDesign,
  tenantId: string,
  allowedOrigin: string | undefined,
): Promise<DesignResult> {
  for (const mode of ["dark", "light"] as const) {
    const url = design.modes[mode]?.assets?.siteBackground?.url;
    if (url && !isTenantSiteDesignAssetUrl(url, tenantId, allowedOrigin)) {
      return { ok: false, error: `The ${mode}-mode background image must be one you uploaded to this dealership.` };
    }
    if (url && !url.startsWith("/")) {
      const validationError = await validateStoredSiteBackground(url);
      if (validationError) return { ok: false, error: `${capitalize(mode)} background: ${validationError}` };
    }
  }
  return { ok: true, design };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Read + normalize the tenant's currently published design (RLS read). */
export async function loadSiteDesign(slug: string): Promise<SiteDesign | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("theme")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeFromRaw(data.theme);
}

function normalizeFromRaw(raw: unknown): SiteDesign {
  const key =
    typeof raw === "object" && raw !== null && "template" in raw &&
    typeof (raw as { template?: { key?: unknown } }).template?.key === "string"
      ? (raw as { template: { key: string } }).template.key
      : undefined;
  return normalizeSiteDesign(raw, getSiteTemplate(key));
}

/**
 * Compute the design that applying a template would produce, WITHOUT publishing.
 * The UI shows this as an unsaved draft for the user to customize, then publish.
 */
export async function applyTemplateDraft(slug: string, templateKey: string): Promise<DesignResult> {
  const authorized = await authorizeDesignMutation(slug);
  if (!authorized) return { ok: false, error: "Owner or admin access is required." };
  const current = (await loadSiteDesign(slug)) ?? createDefaultSiteDesign(getSiteTemplate(templateKey));
  const applied = applyTemplateToDesign(current, getSiteTemplate(templateKey));
  return { ok: true, design: applied };
}

/** Authorize direct-to-storage upload and generate the fixed tenant/mode key. */
export async function prepareSiteBackgroundUpload(
  slug: string,
  mode: "dark" | "light",
  candidate: SiteBackgroundCandidate,
): Promise<SiteBackgroundUploadResult> {
  const authorized = await authorizeDesignMutation(slug);
  if (!authorized) return { ok: false, error: "Owner or admin access is required." };
  const validationError = validateSiteBackgroundCandidate(candidate);
  if (validationError) return { ok: false, error: validationError };

  const service = createServiceClient();
  const objectKey = siteBackgroundObjectKey(
    authorized.tenantId,
    mode,
    candidate.type,
    crypto.randomUUID(),
  );
  const bucket = service.storage.from(TENANT_BUCKETS.media);
  const { data, error } = await bucket.createSignedUploadUrl(objectKey);
  if (error || !data?.token) return { ok: false, error: "Unable to prepare the background upload." };
  return {
    ok: true,
    objectKey,
    token: data.token,
    publicUrl: bucket.getPublicUrl(objectKey).data.publicUrl,
  };
}

/**
 * Validate + publish a design document. Snapshots the previous document into
 * site_design_revisions, writes the new one, prunes history, audits.
 */
export async function publishSiteDesign(slug: string, incoming: unknown): Promise<DesignResult> {
  const authorized = await authorizeDesignMutation(slug);
  if (!authorized) return { ok: false, error: "Owner or admin access is required." };

  const key =
    typeof incoming === "object" && incoming !== null && "template" in incoming
      ? (incoming as { template?: { key?: unknown } }).template?.key
      : undefined;
  const template = getSiteTemplate(typeof key === "string" ? key : undefined);
  const normalized = normalizeSiteDesign(incoming, template);

  const service = createServiceClient();
  const owned = await assertOwnedBackgrounds(
    normalized,
    authorized.tenantId,
    tenantMediaOrigin(service),
  );
  if (!owned.ok) return owned;

  // Only the design editor's keys are sent; the RPC preserves every other
  // current key (header/branding/…) under a row lock. Snapshot + replace +
  // prune all happen in ONE transaction, so a partial failure can neither
  // publish without a rollback snapshot nor clobber a concurrent save.
  const designOwned = {
    schemaVersion: normalized.schemaVersion,
    template: normalized.template,
    shared: normalized.shared,
    modes: normalized.modes,
  };
  const { data: publishedTheme, error: publishError } = await service.rpc("publish_site_design", {
    p_tenant_id: authorized.tenantId,
    p_design: designOwned,
    p_actor: authorized.userId,
    p_max_revisions: MAX_DESIGN_REVISIONS,
  });
  if (publishError) return { ok: false, error: "Unable to publish website design." };

  const published = normalizeFromRaw(publishedTheme);
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "site_design.published",
    resourceType: "tenant",
    resourceId: authorized.tenantId,
    metadata: { templateKey: published.template.key, templateVersion: published.template.version },
  }).catch(() => undefined);

  return { ok: true, design: published };
}

/** List a tenant's design revision history (RLS read; members allowed). */
export async function listSiteDesignRevisions(slug: string): Promise<DesignRevisionSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", slug).maybeSingle();
  if (!tenant) return [];
  const { data, error } = await supabase
    .from("site_design_revisions")
    .select("id, template_key, template_version, published_by, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(MAX_DESIGN_REVISIONS);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    publishedBy: row.published_by,
    createdAt: row.created_at,
  }));
}

/**
 * Restore a stored revision by re-publishing its snapshotted document. Because
 * publish snapshots first, a restore is itself undoable.
 */
export async function restoreSiteDesign(slug: string, revisionId: string): Promise<DesignResult> {
  const authorized = await authorizeDesignMutation(slug);
  if (!authorized) return { ok: false, error: "Owner or admin access is required." };
  const service = createServiceClient();
  const { data: revision, error } = await service
    .from("site_design_revisions")
    .select("design")
    .eq("tenant_id", authorized.tenantId)
    .eq("id", revisionId)
    .maybeSingle();
  if (error || !revision) return { ok: false, error: "That design revision could not be found." };
  return publishSiteDesign(slug, revision.design);
}
