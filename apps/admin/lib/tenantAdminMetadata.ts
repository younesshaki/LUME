import type { Metadata } from "next";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";

type TenantBranding = { favicon32Url?: unknown; favicon192Url?: unknown } | null | undefined;

function httpsUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Browser-tab icons for a tenant's admin pages, from its uploaded favicons.
 * Null when the tenant has none, so the admin's default metadata applies.
 */
export function tenantAdminIcons(branding: TenantBranding): Metadata["icons"] | null {
  const icons = [
    { url: httpsUrl(branding?.favicon32Url), sizes: "32x32" },
    { url: httpsUrl(branding?.favicon192Url), sizes: "192x192" },
  ].flatMap(({ url, sizes }) => (url ? [{ url, sizes, type: "image/png" }] : []));
  return icons.length ? { icon: icons } : null;
}

/**
 * Metadata for `/admin/[tenant]/*`. Reads through the caller's RLS-scoped
 * client, so a tenant the user cannot see yields the default metadata.
 */
export async function loadTenantAdminMetadata(
  supabase: SupabaseClient<Database, "public">,
  slug: string,
): Promise<Metadata> {
  const { data } = await supabase.from("tenants").select("theme").eq("slug", slug).maybeSingle();
  const theme = (data?.theme ?? null) as { branding?: TenantBranding } | null;
  const icons = tenantAdminIcons(theme?.branding);
  return icons ? { icons } : {};
}
