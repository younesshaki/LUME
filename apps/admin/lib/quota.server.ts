import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkQuota,
  failOpenQuotaDecision,
  type Database,
  type QuotaDecision,
  type QuotaEventType,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";

type DbClient = SupabaseClient<Database, "public">;

/** Trusted-server adapter shared by every tenant-facing public API route. */
export async function checkPublicApiQuota(
  tenantId: string,
  eventType: QuotaEventType,
  client?: DbClient,
): Promise<QuotaDecision> {
  try {
    return await checkQuota(client ?? createServiceClient(), { tenantId, eventType });
  } catch {
    return failOpenQuotaDecision(eventType);
  }
}
