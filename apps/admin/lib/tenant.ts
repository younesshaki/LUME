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

const SUBDOMAIN_RESERVED = new Set(["www", "app", "api", "admin", "static", "cdn"]);

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
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  if (parts.length < 3) return null; // need at least sub.domain.tld
  const sub = parts[0];
  if (SUBDOMAIN_RESERVED.has(sub)) return null;
  return sub || null;
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
