"use server";

import { revalidatePath } from "next/cache";
import { auditWrite } from "@/lib/audit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updatePublicPriceSignal(
  slug: string,
  enabled: boolean,
): Promise<{ error?: string }> {
  if (typeof enabled !== "boolean") return { error: "Invalid price signal setting." };

  try {
    const supabase = await createSupabaseServerClient();
    const [tenantResult, userResult] = await Promise.all([
      supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    const tenant = tenantResult.data;
    const user = userResult.data.user;
    if (!user) return { error: "Sign in to change public pricing settings." };
    if (!tenant) return { error: "Tenant not found." };

    const { data: changed, error } = await supabase.rpc("set_public_vehicle_price_signal", {
      p_tenant_id: tenant.id,
      p_enabled: enabled,
    });
    if (error || !changed) return { error: "Owner or admin access is required." };

    await auditWrite({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: "vehicle.price_signal_setting",
      resourceType: "tenant",
      resourceId: tenant.id,
      metadata: { enabled },
    }).catch(() => undefined);
    revalidatePath(`/admin/${slug}/vehicles`, "layout");
    return {};
  } catch {
    return { error: "Public price signals are not configured." };
  }
}
