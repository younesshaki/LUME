import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import { isSupabaseConfigured, supabase } from "./supabase";

export const DEFAULT_PUBLIC_TENANT_SLUG = "default";

export const publicTenantSlug = normalizeTenantSlug(
  (import.meta.env.VITE_LUME_TENANT as string | undefined) ??
    DEFAULT_PUBLIC_TENANT_SLUG
);

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
