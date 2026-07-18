import { isSupabaseConfigured, supabase } from "../supabase";
import { publicTenantSlug } from "../publicTenant";

/**
 * Whether this tenant has the branded route-transition loader enabled.
 *
 * On by DEFAULT — a tenant opts OUT by setting `tenants.theme.navLoader.enabled`
 * to false. Read via the same anon-safe `get_tenant_theme` RPC the theme uses,
 * decoupled from the SiteDesign/publish flow. Cached for the session; failures
 * fall back to "on" so the loader still works if the read hiccups.
 */
let cache: Promise<boolean> | null = null;

export function loadNavLoaderEnabled(slug = publicTenantSlug): Promise<boolean> {
  if (cache) return cache;
  cache = resolve(slug).catch(() => true);
  return cache;
}

async function resolve(slug: string): Promise<boolean> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !isSupabaseConfigured) return true;
  const { data, error } = await supabase.rpc("get_tenant_theme", { p_slug: normalized });
  if (error) return true;
  const raw = data?.[0]?.theme as { navLoader?: { enabled?: unknown } } | null | undefined;
  return raw?.navLoader?.enabled !== false;
}

export function clearNavLoaderConfigCacheForTests(): void {
  cache = null;
}
