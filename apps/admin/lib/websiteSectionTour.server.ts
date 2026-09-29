import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import {
  dismissWebsiteSectionTour,
  websiteSectionTourDismissalsFromRow,
  type WebsiteSectionTourDismissals,
  type WebsiteSectionTourKey,
} from "./websiteSectionTour";

type PreferenceRow = Pick<
  Database["public"]["Tables"]["tenant_member_preferences"]["Row"],
  "website_section_tour_dismissals"
>;

export function websiteSectionTourDismissalsFromPreference(
  row: PreferenceRow | null,
): WebsiteSectionTourDismissals {
  return websiteSectionTourDismissalsFromRow(row?.website_section_tour_dismissals);
}

/**
 * Saves only one route-local opt-out. The caller supplies an RLS-scoped client
 * after proving the member belongs to the tenant; existing Hub preferences and
 * dismissal timestamps for other Website routes are preserved.
 */
export async function persistWebsiteSectionTourDismissal(
  supabase: SupabaseClient<Database, "public">,
  input: { tenantId: string; userId: string; tourKey: WebsiteSectionTourKey; at?: string },
): Promise<boolean> {
  const { data: current, error: readError } = await supabase
    .from("tenant_member_preferences")
    .select("website_section_tour_dismissals")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (readError) return false;

  const next = dismissWebsiteSectionTour(
    websiteSectionTourDismissalsFromPreference(current),
    input.tourKey,
    input.at ?? new Date().toISOString(),
  );
  const { error: writeError } = await supabase.from("tenant_member_preferences").upsert(
    {
      tenant_id: input.tenantId,
      user_id: input.userId,
      website_section_tour_dismissals: next,
    },
    { onConflict: "tenant_id,user_id" },
  );
  return !writeError;
}
