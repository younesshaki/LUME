import { notFound } from "next/navigation";
import { rowToLead } from "@lume/db";
import type { Database } from "@lume/db";
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

  const { data: leadRow, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", leadId)
    .maybeSingle();

  if (leadError) {
    throw new Error(`Unable to load lead: ${leadError.message}`);
  }
  if (!leadRow) notFound();

  const { data: activityRows, error: activityError } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (activityError) {
    throw new Error(`Unable to load lead activities: ${activityError.message}`);
  }

  return (
    <LeadDetailClient
      tenantId={tenant.id}
      tenantSlug={tenant.slug}
      tenantName={tenant.name}
      lead={rowToLead(leadRow as LeadRow)}
      initialActivities={((activityRows ?? []) as LeadActivityRow[]).map(rowToLeadActivity)}
    />
  );
}
