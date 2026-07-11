"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@lume/db/server";
import { auditWrite } from "@/lib/audit";
import { normalizeLeadAssignmentMode } from "@/lib/leadAssignment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type TeamSettingResult = { error?: string };

async function authorizeTeamSettings(slug: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: tenant }, userResult] = await Promise.all([
    supabase.from("tenants").select("id").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser(),
  ]);
  const user = userResult.data.user;
  if (!tenant || !user) return null;
  const { data: allowed, error } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin"],
  });
  return !error && allowed ? { tenantId: tenant.id, userId: user.id } : null;
}

export async function updateMemberSalesAvailability(
  slug: string,
  memberUserId: string,
  salesEnabled: boolean,
  outOfOffice: boolean,
): Promise<TeamSettingResult> {
  if (!memberUserId || typeof salesEnabled !== "boolean" || typeof outOfOffice !== "boolean") {
    return { error: "Invalid member availability." };
  }
  const authorized = await authorizeTeamSettings(slug);
  if (!authorized) return { error: "Owner or admin access is required." };

  try {
    const { data, error } = await createServiceClient()
      .from("tenant_members")
      .update({ sales_enabled: salesEnabled, out_of_office: outOfOffice })
      .eq("tenant_id", authorized.tenantId)
      .eq("user_id", memberUserId)
      .select("user_id")
      .maybeSingle();
    if (error || !data) return { error: "Unable to update sales availability." };

    await auditWrite({
      tenantId: authorized.tenantId,
      actorUserId: authorized.userId,
      action: "member.sales_availability",
      resourceType: "tenant_member",
      resourceId: memberUserId,
      metadata: { salesEnabled, outOfOffice },
    }).catch(() => undefined);
    revalidatePath(`/admin/${slug}/team`);
    return {};
  } catch {
    return { error: "Lead assignment settings are not configured." };
  }
}

export async function updateLeadAssignmentMode(
  slug: string,
  rawMode: string,
): Promise<TeamSettingResult> {
  const mode = normalizeLeadAssignmentMode(rawMode);
  if (!mode) return { error: "Invalid lead assignment mode." };
  const authorized = await authorizeTeamSettings(slug);
  if (!authorized) return { error: "Owner or admin access is required." };

  try {
    const { error } = await createServiceClient().from("tenant_settings").upsert({
      tenant_id: authorized.tenantId,
      lead_assignment_mode: mode,
    }, { onConflict: "tenant_id" });
    if (error) return { error: "Unable to update lead assignment mode." };

    await auditWrite({
      tenantId: authorized.tenantId,
      actorUserId: authorized.userId,
      action: "lead.assignment_mode",
      resourceType: "tenant_settings",
      resourceId: authorized.tenantId,
      metadata: { mode },
    }).catch(() => undefined);
    revalidatePath(`/admin/${slug}/team`);
    return {};
  } catch {
    return { error: "Lead assignment settings are not configured." };
  }
}
