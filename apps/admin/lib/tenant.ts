/**
 * Tenant resolution. Two contexts:
 *
 *   • Admin app (this Next.js project): tenant comes from the URL path
 *     `/admin/[slug]/...`. The user must be a member of that tenant; the
 *     auth gate verifies this against tenant_members (RLS does the same on
 *     every query for defense-in-depth).
 *
 *   • Public API (/api/chat, /api/vehicles): tenant comes from a request
 *     header `X-Lume-Tenant: <slug>` OR the subdomain (when we flip on
 *     subdomain routing). Resolved via the anon-callable `tenant_by_slug`
 *     RPC.
 *
 * Keeping both lookups behind one helper means the rest of the app doesn't
 * care how the tenant got there.
 */
import { createAnonServerClient } from "@lume/db/server";
import type { TenantContext } from "@lume/types";
import { legacyTenantSlugFromHost } from "./subdomainRouting";

/**
 * Resolve a tenant by slug. Uses the anon Supabase client + tenant_by_slug RPC.
 * Returns null if the slug doesn't match an active tenant.
 */
export async function resolveTenantBySlug(slug: string): Promise<TenantContext | null> {
  if (!slug) return null;
  const client = createAnonServerClient();
  const { data, error } = await client.rpc("tenant_by_slug", { p_slug: slug });
  if (error) {
    console.error("[tenant] tenant_by_slug RPC failed:", error.message);
    return null;
  }
  const row = data?.[0];
  if (!row || row.status !== "active") return null;
  return { tenantId: row.id, slug: row.slug, name: row.name };
}

/**
 * Pull a tenant slug from a request. Order of resolution:
 *   1. X-Lume-Tenant header
 *   2. ?tenant=<slug> query param
 *   3. Subdomain (e.g. acme.lume.app → "acme"), excluding reserved names
 *
 * Returns the slug only — call resolveTenantBySlug() to verify existence.
 */
export function extractTenantSlugFromRequest(request: Request): string | null {
  const headerSlug = request.headers.get("x-lume-tenant")?.trim();
  if (headerSlug) return headerSlug;

  const url = new URL(request.url);
  const querySlug = url.searchParams.get("tenant")?.trim();
  if (querySlug) return querySlug;

  const host = request.headers.get("host") ?? url.host;
  if (!host) return null;
  return legacyTenantSlugFromHost(host);
}

/** Reject ambiguous requests before a header-selected tenant is cached under a query URL. */
export function hasConflictingTenantSelectors(request: Request): boolean {
  const headerSlug = request.headers.get("x-lume-tenant")?.trim();
  const querySlug = new URL(request.url).searchParams.get("tenant")?.trim();
  return Boolean(headerSlug && querySlug && headerSlug !== querySlug);
}

/**
 * Convenience: extract + resolve in one step. Returns null if no slug found
 * or the tenant doesn't exist / is suspended.
 */
export async function getTenantFromRequest(
  request: Request
): Promise<TenantContext | null> {
  const slug = extractTenantSlugFromRequest(request);
  if (!slug) return null;
  return resolveTenantBySlug(slug);
}

/**
 * How long a successful slug → active-tenant resolution is reused.
 *
 * Kept short on purpose: it bounds how long a tenant that was just suspended
 * can still be served. The plan entitlement cache (packages/db entitlements)
 * already accepts five minutes for a comparable admin-side change.
 */
export const TENANT_RESOLUTION_CACHE_TTL_MS = 30_000;
const MAX_CACHED_TENANT_SLUGS = 500;

const tenantResolutionCache = new Map<
  string,
  { expiresAt: number; tenant: TenantContext }
>();
const inFlightTenantResolutions = new Map<string, Promise<TenantContext | null>>();

/**
 * resolveTenantBySlug with a short, per-instance cache — for the public chat
 * route, where tenant resolution is the first of several dependent round
 * trips on every turn.
 *
 * Only an active tenant is cached, keyed by the exact slug the RPC was asked
 * about, and the cached value is that RPC's own row: a slug can only ever map
 * back to the tenant it resolved to. Unknown, inactive and failed lookups are
 * never cached, so a new or reactivated tenant is served immediately and an
 * outage cannot pin a miss. Concurrent misses for one slug share one lookup.
 */
export async function resolveTenantBySlugCached(
  slug: string,
  nowMs: number = Date.now(),
  resolve: (slug: string) => Promise<TenantContext | null> = resolveTenantBySlug,
): Promise<TenantContext | null> {
  if (!slug) return null;
  const cached = tenantResolutionCache.get(slug);
  if (cached && nowMs < cached.expiresAt) return cached.tenant;

  const existing = inFlightTenantResolutions.get(slug);
  if (existing) return existing;

  const loading = resolve(slug).then((tenant) => {
    if (tenant) {
      if (tenantResolutionCache.size >= MAX_CACHED_TENANT_SLUGS) {
        for (const [key, entry] of tenantResolutionCache) {
          if (entry.expiresAt <= nowMs) tenantResolutionCache.delete(key);
        }
        // Still full of live entries: drop the oldest insertion.
        if (tenantResolutionCache.size >= MAX_CACHED_TENANT_SLUGS) {
          const oldest = tenantResolutionCache.keys().next().value;
          if (oldest !== undefined) tenantResolutionCache.delete(oldest);
        }
      }
      tenantResolutionCache.set(slug, {
        expiresAt: nowMs + TENANT_RESOLUTION_CACHE_TTL_MS,
        tenant,
      });
    }
    return tenant;
  });
  inFlightTenantResolutions.set(slug, loading);
  try {
    return await loading;
  } finally {
    if (inFlightTenantResolutions.get(slug) === loading) {
      inFlightTenantResolutions.delete(slug);
    }
  }
}

/** getTenantFromRequest backed by resolveTenantBySlugCached. */
export async function getTenantFromRequestCached(
  request: Request
): Promise<TenantContext | null> {
  const slug = extractTenantSlugFromRequest(request);
  if (!slug) return null;
  return resolveTenantBySlugCached(slug);
}

/** Clears only process-local tenant resolution state; for deterministic tests. */
export function clearTenantResolutionCache(): void {
  tenantResolutionCache.clear();
  inFlightTenantResolutions.clear();
}
