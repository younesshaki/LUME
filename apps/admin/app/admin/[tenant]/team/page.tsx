import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  rowToTeamMember,
  rowToTenantInvite,
  type TeamMemberRow,
} from "@/lib/team";
import TeamClient from "./TeamClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
};

export default async function TeamPage({ params }: PageProps) {
  const { tenant: slug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const { data: canManage } = await supabase.rpc("user_has_tenant_role", {
    p_tenant_id: tenant.id,
    p_roles: ["owner", "admin"],
  });

  const [membersResult, invitesResult, settingsResult] = await Promise.all([
    supabase
      .from("tenant_members")
      .select("tenant_id, user_id, role, sales_enabled, out_of_office, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("tenant_invites")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_settings")
      .select("lead_assignment_mode")
      .eq("tenant_id", tenant.id)
      .maybeSingle(),
  ]);

  const { data: memberRows, error: membersError } = membersResult;
  if (membersError) throw new Error(`Unable to load team members: ${membersError.message}`);

  const { data: inviteRows, error: invitesError } = invitesResult;

  if (invitesError) {
    throw new Error(`Unable to load tenant invites: ${invitesError.message}`);
  }

  return (
    <TeamClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      currentUserId={user?.id ?? ""}
      canManage={canManage === true}
      initialAssignmentMode={settingsResult.data?.lead_assignment_mode ?? "manual"}
      initialMembers={((memberRows ?? []) as TeamMemberRow[]).map(rowToTeamMember)}
      initialInvites={(inviteRows ?? []).map(rowToTenantInvite)}
    />
  );
}
