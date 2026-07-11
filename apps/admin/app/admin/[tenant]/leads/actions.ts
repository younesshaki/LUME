"use server";

/**
 * Lead inbox bulk actions (SCRUM-170). RLS-scoped server client — the leads
 * write policy restricts these to editor+; tenant_id is pinned for defense in
 * depth.
 */
import { revalidatePath } from "next/cache";
import type { LeadStatus } from "@lume/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export async function bulkUpdateLeadStatus(
  slug: string,
  ids: string[],
  status: string,
): Promise<{ error?: string; updated?: number }> {
  if (!STATUSES.includes(status as LeadStatus)) return { error: "Invalid status." };
  if (ids.length === 0) return { error: "No leads selected." };

  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return { error: "Tenant not found." };

  const { error, count } = await supabase
    .from("leads")
    .update({ status: status as LeadStatus }, { count: "exact" })
    .eq("tenant_id", tenant.id)
    .in("id", ids);
  if (error) return { error: "Unable to update leads." };

  revalidatePath(`/admin/${slug}/leads`);
  return { updated: count ?? ids.length };
}
