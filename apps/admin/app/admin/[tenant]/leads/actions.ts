"use server";

/**
 * Lead inbox bulk actions (SCRUM-170). RLS-scoped server client — the leads
 * write policy restricts these to editor+; tenant_id is pinned for defense in
 * depth.
 */
import { revalidatePath } from "next/cache";
import type { LeadStatus } from "@lume/types";
import {
  mergeLeadLostReasons,
  normalizeLeadLostReasonKey,
  selectableLeadLostReasons,
} from "@/lib/leadLostReasons";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "won", "lost"];

export async function bulkUpdateLeadStatus(
  slug: string,
  ids: string[],
  status: string,
  lostReason?: string | null,
): Promise<{ error?: string; updated?: number }> {
  const nextStatus = status as LeadStatus;
  if (!STATUSES.includes(nextStatus)) return { error: "Invalid status." };
  if (ids.length === 0) return { error: "No leads selected." };
  if (ids.length > 500) return { error: "Update at most 500 leads at a time." };

  const supabase = await createSupabaseServerClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) return { error: "Tenant not found." };

  let normalizedReason: string | null = null;
  if (nextStatus === "lost") {
    normalizedReason = normalizeLeadLostReasonKey(lostReason ?? "");
    if (!normalizedReason) return { error: "Choose a lost reason." };

    const { data: rows } = await supabase
      .from("lead_lost_reason_options")
      .select("key, label, sort_order, is_active")
      .eq("tenant_id", tenant.id);
    const allowed = selectableLeadLostReasons(mergeLeadLostReasons(
      (rows ?? []).map((row) => ({
        key: row.key,
        label: row.label,
        sortOrder: row.sort_order,
        isActive: row.is_active,
      }))
    ));
    if (!allowed.some((reason) => reason.key === normalizedReason)) {
      return { error: "Choose an active lost reason." };
    }
  }

  const { error, count } = await supabase
    .from("leads")
    .update({ status: nextStatus, lost_reason: normalizedReason }, { count: "exact" })
    .eq("tenant_id", tenant.id)
    .in("id", ids);
  if (error) return { error: "Unable to update leads." };

  revalidatePath(`/admin/${slug}/leads`);
  return { updated: count ?? ids.length };
}
