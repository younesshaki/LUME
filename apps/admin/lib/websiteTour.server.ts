import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";
import {
  websiteTourOutcomeUpdate,
  type WebsiteTourOutcome,
  type WebsiteTourPreference,
} from "./websiteTour";

type PreferenceRow = Pick<
  Database["public"]["Tables"]["tenant_member_preferences"]["Row"],
  "website_tour_version" | "website_tour_completed_at" | "website_tour_skipped_at" | "website_tour_dismissed_at"
>;

export function websiteTourPreferenceFromRow(row: PreferenceRow | null): WebsiteTourPreference | null {
  if (!row) return null;
  return {
    websiteTourVersion: row.website_tour_version,
    websiteTourCompletedAt: row.website_tour_completed_at,
    websiteTourSkippedAt: row.website_tour_skipped_at,
    websiteTourDismissedAt: row.website_tour_dismissed_at,
  };
}

/**
 * Save one terminal Website-tour outcome. The caller must already have proved
 * authentication, membership, and rollout eligibility; this helper performs
 * the RLS-scoped read/merge/write so replay never erases historical completion.
 */
export async function persistWebsiteTourOutcome(
  supabase: SupabaseClient<Database, "public">,
  input: {
    tenantId: string;
    userId: string;
    outcome: WebsiteTourOutcome;
    at?: string;
  },
): Promise<boolean> {
  const { data: current, error: readError } = await supabase
    .from("tenant_member_preferences")
    .select("website_tour_version, website_tour_completed_at, website_tour_skipped_at, website_tour_dismissed_at")
    .eq("tenant_id", input.tenantId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (readError) return false;

  const next = websiteTourOutcomeUpdate(
    websiteTourPreferenceFromRow(current),
    input.outcome,
    input.at ?? new Date().toISOString(),
  );
  const { error: writeError } = await supabase.from("tenant_member_preferences").upsert(
    {
      tenant_id: input.tenantId,
      user_id: input.userId,
      website_tour_version: next.websiteTourVersion,
      website_tour_completed_at: next.websiteTourCompletedAt,
      website_tour_skipped_at: next.websiteTourSkippedAt,
      website_tour_dismissed_at: next.websiteTourDismissedAt,
    },
    { onConflict: "tenant_id,user_id" },
  );
  return !writeError;
}
