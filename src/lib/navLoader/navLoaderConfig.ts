import { isSupabaseConfigured, supabase } from "../supabase";
import { publicTenantSlug } from "../publicTenant";

/**
 * Whether this tenant has enabled the branded route-transition loader.
 *
 * Read from `tenants.theme.navLoader.enabled` via the same anon-safe
 * `get_tenant_theme` RPC the theme uses. Intentionally decoupled from the
 * SiteDesign/TenantTheme pipeline so a simple website toggle never touches the
 * design-publish flow. Cached for the session; failures fall back to "off".
 */
let cache: Promise<boolean> | null = null;

export function loadNavLoaderEnabled(slug = publicTenantSlug): Promise<boolean> {
  if (cache) return cache;
  cache = resolve(slug).catch(() => false);
  return cache;
}

async function resolve(slug: string): Promise<boolean> {
  const normalized = slug.trim().toLowerCase();
  if (!normalized || !isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc("get_tenant_theme", { p_slug: normalized });
  if (error) return false;
  const raw = data?.[0]?.theme as { navLoader?: { enabled?: unknown } } | null | undefined;
  return raw?.navLoader?.enabled === true;
}

export function clearNavLoaderConfigCacheForTests(): void {
  cache = null;
}
