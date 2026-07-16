import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import { isSupabaseConfigured, supabase } from "./supabase";

export const DEFAULT_PUBLIC_TENANT_SLUG = "default";

const TENANT_STORAGE_KEY = "lume.public-tenant.v1";
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "static", "cdn"]);

/**
 * Which tenant this browser session renders, resolved at boot:
 *   1. Subdomain (acme.lume.app → "acme") — the eventual SaaS routing.
 *   2. ?tenant=<slug> query param — persisted per browser (localStorage),
 *      so one deployment can present any tenant's site (admin "View
 *      website" uses this). ?tenant=<build default> clears the override.
 *   3. Build-time VITE_LUME_TENANT (today's single-tenant deployments).
 */
function computePublicTenantSlug(): string {
  const buildDefault = normalizeTenantSlug(
    (import.meta.env.VITE_LUME_TENANT as string | undefined) ??
      DEFAULT_PUBLIC_TENANT_SLUG
  );
  if (typeof window === "undefined") return buildDefault;

  try {
    const hostnameSlug = publicTenantSlugFromHostname(window.location.hostname);
    if (hostnameSlug) return hostnameSlug;

    const param = new URLSearchParams(window.location.search).get("tenant");
    if (param !== null) {
      const slug = normalizeTenantSlug(param);
      if (!slug || slug === buildDefault) {
        window.localStorage.removeItem(TENANT_STORAGE_KEY);
        return buildDefault;
      }
      window.localStorage.setItem(TENANT_STORAGE_KEY, slug);
      return slug;
    }

    const stored = window.localStorage.getItem(TENANT_STORAGE_KEY);
    if (stored) return normalizeTenantSlug(stored) || buildDefault;
  } catch {
    // storage/URL access unavailable — fall through to the build default
  }
  return buildDefault;
}

export const publicTenantSlug = computePublicTenantSlug();

type TenantLookupClient = Pick<SupabaseClient<Database>, "rpc">;

export type PublicTenant = {
  id: string;
  slug: string;
  name: string;
};

const tenantCache = new Map<string, Promise<PublicTenant | null>>();

/** Resolve the active public tenant using the existing anon-safe RPC. */
export async function resolvePublicTenant(
  slug = publicTenantSlug,
  client: TenantLookupClient = supabase
): Promise<PublicTenant | null> {
  const normalizedSlug = normalizeTenantSlug(slug);
  if (!normalizedSlug) return null;

  const cached = tenantCache.get(normalizedSlug);
  if (cached) return cached;

  const lookup = lookupTenant(normalizedSlug, client);
  tenantCache.set(normalizedSlug, lookup);

  const tenant = await lookup;
  if (!tenant) tenantCache.delete(normalizedSlug);
  return tenant;
}

/**
 * Resolve the public tenant slug to a tenant UUID using the anon-safe
 * `tenant_by_slug` RPC. Results are cached per slug so page rendering and
 * theme/data fetches do not repeat the same lookup.
 */
export async function resolveTenantId(
  slug = publicTenantSlug,
  client: TenantLookupClient = supabase
): Promise<string | null> {
  return (await resolvePublicTenant(slug, client))?.id ?? null;
}

export function clearTenantIdCacheForTests(): void {
  tenantCache.clear();
}

function normalizeTenantSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

/** Return a real tenant subdomain, never a local/IP or Vercel preview label. */
export function publicTenantSlugFromHostname(hostname: string): string | null {
  const normalizedHostname = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (
    !normalizedHostname ||
    normalizedHostname === "localhost" ||
    normalizedHostname.endsWith(".localhost") ||
    normalizedHostname.endsWith(".vercel.app") ||
    normalizedHostname.includes(":") ||
    isIpv4Address(normalizedHostname)
  ) {
    return null;
  }

  const parts = normalizedHostname.split(".");
  if (parts.length < 3) return null;
  const subdomain = normalizeTenantSlug(parts[0]);
  if (!subdomain || RESERVED_SUBDOMAINS.has(subdomain)) return null;
  return subdomain;
}

function isIpv4Address(hostname: string): boolean {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
  );
}

async function lookupTenant(
  slug: string,
  client: TenantLookupClient
): Promise<PublicTenant | null> {
  if (!isSupabaseConfigured && client === supabase) return null;

  const { data, error } = await client.rpc("tenant_by_slug", { p_slug: slug });
  if (error) {
    console.warn("[tenant] tenant_by_slug RPC failed", error);
    return null;
  }

  const row = data?.[0];
  if (!row || row.status !== "active") return null;
  return { id: row.id, slug: row.slug, name: row.name };
}
