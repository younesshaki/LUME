"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

/**
 * Toggle the branded route-transition loader on the tenant's PUBLIC website.
 *
 * The flag is stored as a top-level `navLoader.enabled` key on `tenants.theme`
 * (the JSONB the public site already reads via get_tenant_theme). It is
 * deliberately NOT a design-owned key, so it survives design publishes (RPC 068
 * preserves non-editor keys) and applies immediately without a publish.
 * Owner/admin only; the tenant id always comes from the authorized context.
 */
export async function setSiteNavLoaderEnabled(
  slug: string,
  enabled: boolean,
): Promise<ActionResult> {
  if (typeof enabled !== "boolean") return { error: "Invalid value." };

  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) return { error: "Tenant not found." };

  const { data: allowed, error: roleError } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin"],
  });
  if (roleError || !allowed) return { error: "Owner or admin access is required." };

  const service = createServiceClient();
  const { data: current, error: readError } = await service
    .from("tenants")
    .select("theme")
    .eq("id", tenant.id)
    .maybeSingle();
  if (readError) return { error: "Unable to load website settings." };

  const theme =
    current?.theme && typeof current.theme === "object" && !Array.isArray(current.theme)
      ? (current.theme as Record<string, unknown>)
      : {};
  const currentNavLoader =
    theme.navLoader && typeof theme.navLoader === "object" && !Array.isArray(theme.navLoader)
      ? (theme.navLoader as Record<string, unknown>)
      : {};
  const nextTheme = { ...theme, navLoader: { ...currentNavLoader, enabled } };

  const { error: updateError } = await service
    .from("tenants")
    .update({ theme: nextTheme })
    .eq("id", tenant.id);
  if (updateError) return { error: "Unable to update the loading animation setting." };

  await auditWrite({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "site_nav_loader.updated",
    resourceType: "tenant",
    resourceId: tenant.id,
    metadata: { enabled },
  }).catch(() => undefined);

  revalidatePath(`/admin/${slug}/website`);
  return {};
}
