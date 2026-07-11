import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsageEvent, type Database, type UsageEventType } from "@lume/db";
import { createServiceClient } from "@lume/db/server";

type DbClient = SupabaseClient<Database, "public">;

/** Public API metering is fail-open until SCRUM-104 enforces plan quotas. */
export async function recordPublicApiUsage(
  tenantId: string,
  eventType: UsageEventType,
  client?: DbClient,
): Promise<boolean> {
  try {
    return await recordUsageEvent(client ?? createServiceClient(), {
      tenantId,
      eventType,
    });
  } catch {
    return false;
  }
}
