import { notFound } from "next/navigation";
import { rowToLead } from "@lume/db";
import type { Database } from "@lume/db";
import {
  mergeLeadLostReasons,
  resolveLeadLostReasonForReporting,
  type TenantLeadLostReasonOverride,
} from "@/lib/leadLostReasons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { rowToLeadActivity } from "@/lib/leadActivities";
import LeadDetailClient from "./LeadDetailClient";

type PageProps = {
  params: Promise<{ tenant: string; leadId: string }>;
};

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadActivityRow = Database["public"]["Tables"]["lead_activities"]["Row"];

export default async function LeadDetailPage({ params }: PageProps) {
  const { tenant: slug, leadId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  const [leadResult, activityResult, reasonResult, membersResult] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("lead_activities")
      .select("*")
      .eq("tenant_id", tenant.id)
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lead_lost_reason_options")
      .select("key, label, sort_order, is_active")
      .eq("tenant_id", tenant.id),
    supabase
      .from("tenant_members")
      .select("user_id, role, sales_enabled, out_of_office")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true }),
  ]);
  const { data: leadRow, error: leadError } = leadResult;

  if (leadError) {
    throw new Error(`Unable to load lead: ${leadError.message}`);
  }
  if (!leadRow) notFound();

  if (activityResult.error) {
    throw new Error(`Unable to load lead activities: ${activityResult.error.message}`);
  }
  if (membersResult.error) {
    throw new Error(`Unable to load assignable team members: ${membersResult.error.message}`);
  }

  const reasonOverrides: TenantLeadLostReasonOverride[] = (reasonResult.data ?? []).map((row) => ({
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
  const lostReasons = mergeLeadLostReasons(reasonOverrides);
  const currentReason = resolveLeadLostReasonForReporting(leadRow.lost_reason, lostReasons);
  if (currentReason && !lostReasons.some((reason) => reason.key === currentReason.key)) {
    lostReasons.push(currentReason);
  }

  return (
    <LeadDetailClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      lead={rowToLead(leadRow as LeadRow)}
      initialActivities={((activityResult.data ?? []) as LeadActivityRow[]).map(rowToLeadActivity)}
      lostReasons={lostReasons}
      teamMembers={(membersResult.data ?? []).map((member) => ({
        userId: member.user_id,
        role: member.role,
        salesEnabled: member.sales_enabled,
        outOfOffice: member.out_of_office,
      }))}
    />
  );
}
