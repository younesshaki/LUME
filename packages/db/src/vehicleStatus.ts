import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export const SOLD_ARCHIVE_AFTER_DAYS = 90;

export function soldVehicleArchiveCutoff(now: Date = new Date()): string {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCDate(cutoff.getUTCDate() - SOLD_ARCHIVE_AFTER_DAYS);
  return cutoff.toISOString();
}

export async function archiveDueSoldVehicles(
  client: DbClient,
  now: Date = new Date(),
  limit = 500,
): Promise<number> {
  const boundedLimit = Math.min(5_000, Math.max(1, Math.trunc(limit) || 500));
  const { data, error } = await client.rpc("archive_due_sold_vehicles", {
    p_cutoff: soldVehicleArchiveCutoff(now),
    p_limit: boundedLimit,
  });
  if (error) throw new Error(`sold vehicle archival failed: ${error.message}`);
  return data?.length ?? 0;
}
