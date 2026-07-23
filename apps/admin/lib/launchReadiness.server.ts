/**
 * Server-side loader for Dealer Launch Certification: turns tenant-scoped
 * database reads into a plain TenantLaunchSnapshot for the pure evaluator
 * (lib/launchReadiness.ts). Every query is explicitly tenant-scoped, all
 * independent reads run in one parallel batch, and no full vehicle/page rows
 * are loaded when counts or projections suffice.
 *
 * Server-only by usage (RSC pages + the operator CLI) — deliberately WITHOUT
 * the `server-only` package marker so the read-only CLI
 * (scripts/tenant-launch-audit.ts) can import this module under plain
 * Node/tsx; the marker package is not installed at the workspace root.
 *
 * Callers decide the client: Admin pages pass the user-scoped SSR client
 * (RLS applies), the operator CLI passes the service client. The loader is
 * read-only by construction.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import { listPages } from "@lume/db";
import { validatePageBlocksDocument } from "@lume/blocks";
import {
  isBotPersonaConfigured,
  tenantThemeHasLogo,
} from "./onboardingChecklist";
import type { TenantLaunchSnapshot } from "./launchReadiness";

type DbClient = SupabaseClient<Database, "public">;

const OPERATIONAL_SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
] as const;

export async function loadTenantLaunchSnapshot(
  client: DbClient,
  tenantSlug: string,
): Promise<TenantLaunchSnapshot | null> {
  const { data: tenant, error: tenantError } = await client
    .from("tenants")
    .select("id, slug, name, status, theme")
    .eq("slug", tenantSlug)
    .maybeSingle();
  if (tenantError) throw new Error(tenantError.message);
  if (!tenant) return null;

  const tenantId = tenant.id;
  const countHead = (count: number | null) => count ?? 0;

  const [
    ownerCount,
    memberCount,
    pendingInviteCount,
    subscriptionResult,
    pages,
    liveVehicleCount,
    pricedVehicleCount,
    mileageVehicleCount,
    identityVehicleCount,
    imagedVehicleCount,
    personaResult,
    knowledgeChunkCount,
    verifiedDomainCount,
    settingsResult,
    logoRootObjects,
    logoFolderObjects,
  ] = await Promise.all([
    client
      .from("tenant_members")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("role", "owner")
      .then((result) => countHead(result.count)),
    client
      .from("tenant_members")
      .select("user_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .then((result) => countHead(result.count)),
    client
      .from("tenant_invites")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .then((result) => countHead(result.count)),
    client
      .from("subscriptions")
      .select("status")
      .eq("tenant_id", tenantId)
      .in("status", [...OPERATIONAL_SUBSCRIPTION_STATUSES])
      .limit(1)
      .maybeSingle(),
    listPages(client, tenantId),
    client
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "live")
      .then((result) => countHead(result.count)),
    client
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "live")
      .gt("price", 0)
      .then((result) => countHead(result.count)),
    client
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "live")
      .not("mileage", "is", null)
      .then((result) => countHead(result.count)),
    client
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "live")
      .or("external_id.not.is.null,feed_vin.not.is.null")
      .then((result) => countHead(result.count)),
    client
      .from("vehicles")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "live")
      .neq("image_src", "")
      .then((result) => countHead(result.count)),
    client
      .from("bot_personas")
      .select("name, tone, system_prompt, created_at, updated_at, capabilities")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .maybeSingle(),
    client
      .from("rag_chunks")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .then((result) => countHead(result.count)),
    client
      .from("tenant_domains")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("verified", true)
      .then((result) => countHead(result.count)),
    client
      .from("tenant_settings")
      .select("lead_email_enabled, lead_email_unassigned_address, lead_assignment_mode")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    client.storage.from("tenant-logos").list(tenantId, { limit: 100 }),
    client.storage.from("tenant-logos").list(`${tenantId}/logos`, { limit: 100 }),
  ]);

  const homePage = pages.find((page) => page.slug === "home") ?? null;
  const draftOnlyPageCount = pages.filter(
    (page) => page.slug !== "home" && !page.publishedRevisionId && !page.archivedAt,
  ).length;

  // The published home revision's blocks decide "renders real content" —
  // invalid or empty published documents are blockers, never counted as
  // published (one extra read, only when a published revision exists).
  let publishedBlockCount = 0;
  let publishedDocumentValid = false;
  if (homePage?.publishedRevisionId) {
    const { data: revision, error: revisionError } = await client
      .from("page_revisions")
      .select("blocks")
      .eq("id", homePage.publishedRevisionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    const validation = validatePageBlocksDocument(revision?.blocks ?? {});
    publishedDocumentValid = validation.ok;
    publishedBlockCount =
      revision?.blocks && Array.isArray((revision.blocks as { blocks?: unknown[] }).blocks)
        ? ((revision.blocks as { blocks: unknown[] }).blocks).length
        : 0;
  }

  const capabilities = (personaResult.data?.capabilities ?? {}) as Record<string, unknown>;
  const hasLogo =
    tenantThemeHasLogo((tenant.theme ?? {}) as Record<string, unknown>) ||
    (logoRootObjects.data ?? []).some((object) => Boolean(object.id)) ||
    (logoFolderObjects.data ?? []).some((object) => Boolean(object.id));

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
    },
    ownerCount,
    memberCount,
    pendingInviteCount,
    subscriptionStatus: subscriptionResult.data?.status ?? null,
    homePage: {
      exists: homePage !== null,
      archived: homePage?.archivedAt !== null && homePage?.archivedAt !== undefined,
      hasPublishedRevision: Boolean(homePage?.publishedRevisionId),
      publishedBlockCount,
      publishedDocumentValid,
      hasUnpublishedDraftChanges: Boolean(
        homePage?.draftRevisionId &&
          homePage.draftRevisionId !== homePage.publishedRevisionId,
      ),
    },
    vehicles: {
      live: liveVehicleCount,
      withPrice: pricedVehicleCount,
      withMileage: mileageVehicleCount,
      withIdentity: identityVehicleCount,
      withDisplayImage: imagedVehicleCount,
    },
    hasLogo,
    verifiedDomainCount,
    customDomainsEnabled: Boolean(
      process.env.VERCEL_ADMIN_TOKEN && process.env.VERCEL_PROJECT_ID,
    ),
    personaConfigured: isBotPersonaConfigured(personaResult.data ?? null),
    conciergeLeadCaptureEnabled:
      capabilities.captureLead !== false || capabilities.openLeadForm !== false,
    knowledgeChunkCount,
    leadEmailEnabled: settingsResult.data?.lead_email_enabled === true,
    // Fallback = an unassigned-lead inbox or round-robin assignment exists.
    leadNotificationFallbackConfigured: Boolean(
      settingsResult.data?.lead_email_unassigned_address ||
        settingsResult.data?.lead_assignment_mode === "round_robin",
    ),
    draftOnlyPageCount,
  };
}
