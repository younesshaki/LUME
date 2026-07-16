/**
 * Server-side website-design operations (Website Templates v1 foundation).
 *
 * All destructive design work goes through here, never straight from the
 * browser. Authorization mirrors the integrations pattern (owner/admin via
 * user_has_tenant_role); the tenant id always comes from the authorized context,
 * never the request body. The incoming document is normalized with the SHARED
 * validator (@lume/types) so arbitrary CSS/keys/URLs can't be persisted, and
 * background asset URLs are ownership-checked against the tenant's storage
 * prefix. Publishing snapshots the previous document into site_design_revisions
 * (migration 067) for rollback, then prunes to a bounded history.
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
function isOwnedBackgroundUrl(url: string, tenantId: string): boolean {
  return isTenantSiteDesignAssetUrl(url, tenantId);
}

async function assertOwnedBackgrounds(design: SiteDesign, tenantId: string): Promise<DesignResult> {
  for (const mode of ["dark", "light"] as const) {
    const url = design.modes[mode]?.assets?.siteBackground?.url;
    if (url && !isOwnedBackgroundUrl(url, tenantId)) {
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
  let normalized = normalizeSiteDesign(incoming, template);

  const owned = await assertOwnedBackgrounds(normalized, authorized.tenantId);
  if (!owned.ok) return owned;

  const service = createServiceClient();

  // Snapshot the CURRENT (about-to-be-replaced) document for rollback.
  const { data: currentRow } = await service
    .from("tenants")
    .select("theme")
    .eq("id", authorized.tenantId)
    .maybeSingle();
  const previous = normalizeFromRaw(currentRow?.theme);
  // Design owns only schema/template/shared/modes. Re-read and preserve every
  // other current key so a concurrent Navigation/Branding save cannot be
  // overwritten by a stale design draft, and future keys round-trip safely.
  const preserved = Object.fromEntries(
    Object.entries(asRecord(currentRow?.theme)).filter(
      ([key]) => ![
        "schemaVersion", "template", "shared", "modes", "colors", "fonts",
        "dock", "dockVariant", "cinematic", "cinematicIntensity",
      ].includes(key),
    ),
  );
  const publishDocument = { ...normalized, ...preserved };
  normalized = normalizeSiteDesign(publishDocument, template);
  const { error: snapshotError } = await service.from("site_design_revisions").insert({
    tenant_id: authorized.tenantId,
    design: (currentRow?.theme ?? {}) as Record<string, unknown>,
    template_key: previous.template.key,
    template_version: previous.template.version,
    published_by: authorized.userId,
  });
  if (snapshotError) return { ok: false, error: "Unable to save the current design before publishing." };

  const { error: writeError } = await service
    .from("tenants")
    .update({ theme: publishDocument })
    .eq("id", authorized.tenantId);
  if (writeError) return { ok: false, error: "Unable to publish website design." };

  await pruneRevisions(service, authorized.tenantId);
  await auditWrite({
    tenantId: authorized.tenantId,
    actorUserId: authorized.userId,
    action: "site_design.published",
    resourceType: "tenant",
    resourceId: authorized.tenantId,
    metadata: { templateKey: normalized.template.key, templateVersion: normalized.template.version },
  }).catch(() => undefined);

  return { ok: true, design: normalized };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
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

/** Keep only the newest MAX_DESIGN_REVISIONS rows for a tenant. */
async function pruneRevisions(
  service: ReturnType<typeof createServiceClient>,
  tenantId: string,
): Promise<void> {
  const { data: stale } = await service
    .from("site_design_revisions")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(MAX_DESIGN_REVISIONS, MAX_DESIGN_REVISIONS + 500);
  if (stale && stale.length > 0) {
    await service
      .from("site_design_revisions")
      .delete()
      .in("id", stale.map((row) => row.id));
  }
}
