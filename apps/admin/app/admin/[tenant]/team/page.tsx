import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  canManageTeam,
  rowToTeamMember,
  rowToTenantInvite,
  type TeamMemberRow,
  type TenantInviteRow,
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

  const { data: currentMembership } = await supabase
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user?.id ?? "")
    .maybeSingle();

  const { data: memberRows, error: membersError } = await supabase
    .from("tenant_members")
    .select("tenant_id, user_id, role, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: true });

  if (membersError) {
    throw new Error(`Unable to load team members: ${membersError.message}`);
  }

  const { data: inviteRows, error: invitesError } = await (supabase.from("tenant_invites") as any)
    .select("*")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false });

  if (invitesError) {
    throw new Error(`Unable to load tenant invites: ${invitesError.message}`);
  }

  return (
    <TeamClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      currentUserId={user?.id ?? ""}
      canManage={canManageTeam(currentMembership?.role ?? null)}
      initialMembers={((memberRows ?? []) as TeamMemberRow[]).map(rowToTeamMember)}
      initialInvites={((inviteRows ?? []) as TenantInviteRow[]).map(rowToTenantInvite)}
    />
  );
}
