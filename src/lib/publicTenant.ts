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
    const parts = window.location.hostname.split(".");
    if (parts.length >= 3) {
      const sub = normalizeTenantSlug(parts[0]);
      if (sub && !RESERVED_SUBDOMAINS.has(sub) && !window.location.hostname.endsWith(".vercel.app")) {
        return sub;
      }
    }

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

const tenantIdCache = new Map<string, Promise<string | null>>();

/**
 * Resolve the public tenant slug to a tenant UUID using the anon-safe
 * `tenant_by_slug` RPC. Results are cached per slug so page rendering and
 * theme/data fetches do not repeat the same lookup.
 */
export async function resolveTenantId(
  slug = publicTenantSlug,
  client: TenantLookupClient = supabase
): Promise<string | null> {
  const normalizedSlug = normalizeTenantSlug(slug);
  if (!normalizedSlug) return null;

  const cached = tenantIdCache.get(normalizedSlug);
  if (cached) return cached;

  const lookup = lookupTenantId(normalizedSlug, client);
  tenantIdCache.set(normalizedSlug, lookup);

  const tenantId = await lookup;
  if (!tenantId) tenantIdCache.delete(normalizedSlug);
  return tenantId;
}

export function clearTenantIdCacheForTests(): void {
  tenantIdCache.clear();
}

function normalizeTenantSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

async function lookupTenantId(
  slug: string,
  client: TenantLookupClient
): Promise<string | null> {
  if (!isSupabaseConfigured && client === supabase) return null;

  const { data, error } = await client.rpc("tenant_by_slug", { p_slug: slug });
  if (error) {
    console.warn("[tenant] tenant_by_slug RPC failed", error);
    return null;
  }

  const row = data?.[0];
  if (!row || row.status !== "active") return null;
  return row.id;
}
