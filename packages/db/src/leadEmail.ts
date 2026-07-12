import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export type ClaimedLeadDigestBatch = {
  id: string;
  tenantId: string;
  windowStart: string;
  leadIds: string[];
  attemptCount: number;
};

const DIGEST_RETRY_DELAYS_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export async function enqueueLeadEmailDigest(
  client: DbClient,
  tenantId: string,
  leadId: string,
  createdAt: string,
): Promise<string | null> {
  const normalizedCreatedAt = normalizeTimestamp(createdAt);
  if (!tenantId.trim() || !leadId.trim() || !normalizedCreatedAt) return null;
  const { data, error } = await client.rpc("enqueue_lead_email_digest", {
    p_tenant_id: tenantId.trim(),
    p_lead_id: leadId.trim(),
    p_created_at: normalizedCreatedAt,
  });
  if (error) throw new Error(`Unable to enqueue lead email digest: ${error.message}`);
  return typeof data === "string" && data ? data : null;
}

export async function claimLeadEmailDigests(
  client: DbClient,
  limit = 25,
): Promise<ClaimedLeadDigestBatch[]> {
  const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const { data, error } = await client.rpc("claim_lead_email_digests", {
    p_limit: boundedLimit,
  });
  if (error) throw new Error(`Unable to claim lead email digests: ${error.message}`);
  return (data ?? []).flatMap((row) => {
    const windowStart = normalizeTimestamp(row.window_start);
    return row.id && row.tenant_id && windowStart && row.lead_ids.length > 0
      ? [{
          id: row.id,
          tenantId: row.tenant_id,
          windowStart,
          leadIds: row.lead_ids,
          attemptCount: row.attempt_count,
        }]
      : [];
  });
}

export async function finishLeadEmailDigest(
  client: DbClient,
  batch: Pick<ClaimedLeadDigestBatch, "id" | "attemptCount">,
  outcome: { success: boolean; error?: string },
  nowMs = Date.now(),
): Promise<void> {
  const nextAttemptAt = outcome.success
    ? null
    : nextLeadDigestAttempt(batch.attemptCount, nowMs);
  const update: Database["public"]["Tables"]["lead_email_digest_batches"]["Update"] =
    outcome.success
      ? {
          status: "sent",
          sent_at: new Date(nowMs).toISOString(),
          last_error: null,
        }
      : nextAttemptAt
        ? {
            status: "retrying",
            next_attempt_at: nextAttemptAt,
            last_error: boundedError(outcome.error),
          }
        : {
            status: "failed",
            last_error: boundedError(outcome.error),
          };
  const { error } = await client
    .from("lead_email_digest_batches")
    .update(update)
    .eq("id", batch.id)
    .eq("status", "delivering")
    .eq("attempt_count", batch.attemptCount);
  if (error) throw new Error(`Unable to finish lead email digest: ${error.message}`);
}

export function nextLeadDigestAttempt(completedAttempts: number, nowMs = Date.now()): string | null {
  if (!Number.isSafeInteger(completedAttempts) || completedAttempts < 1) return null;
  const delay = DIGEST_RETRY_DELAYS_MS[completedAttempts - 1];
  return delay === undefined ? null : new Date(nowMs + delay).toISOString();
}

function normalizeTimestamp(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function boundedError(value: string | undefined): string {
  return (value?.trim() || "Email delivery failed.").slice(0, 500);
}
