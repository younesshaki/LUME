/**
 * Typed, durable queue helpers for managed inventory sources and syndication.
 *
 * These are thin wrappers around migration 077's service-only RPCs. Keeping
 * lease/retry math here makes cron workers auditable and prevents callers from
 * mutating queue rows directly.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;

export const INVENTORY_RUN_MAX_RETRY_DELAYS = 10;
export const INVENTORY_RUN_MAX_RETRY_SECONDS = 86_400;

export type InventoryRunDiagnostic = {
  stage: "fetch" | "parse" | "preflight" | "normalize" | "sync" | "export";
  message: string;
  line?: number;
};

export type ClaimedInventoryFeedRun = {
  id: string;
  tenantId: string;
  feedSourceId: string;
  trigger: "manual" | "scheduled";
  sourceSnapshot: Record<string, unknown>;
  attemptCount: number;
  credentialCiphertext: string | null;
  retryDelaysSeconds: number[];
  lastSourceHash: string | null;
  sourceConfigVersion: number;
};

export type ClaimedInventoryExportRun = {
  id: string;
  tenantId: string;
  exportDestinationId: string;
  trigger: "manual" | "scheduled";
  destinationSnapshot: Record<string, unknown>;
  attemptCount: number;
  credentialCiphertext: string | null;
  retryDelaysSeconds: number[];
  lastPayloadHash: string | null;
  destinationConfigVersion: number;
};

export type InventoryFeedRunCompletion = {
  status: "succeeded" | "partial" | "skipped";
  sourceHash: string | null;
  inputBytes: number | null;
  totalRows: number;
  processedRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  conflictRows: number;
  failedRows: number;
  errors: readonly InventoryRunDiagnostic[];
};

export type InventoryExportRunCompletion = {
  status: "succeeded" | "skipped";
  payloadHash: string;
  recordCount: number;
  responseStatus: number | null;
};

/** Validate retry policy from a source snapshot before calculating an attempt. */
export function normalizeInventoryRetryDelays(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > INVENTORY_RUN_MAX_RETRY_DELAYS) {
    return null;
  }
  const normalized = value.map(Number);
  return normalized.every((delay) =>
    Number.isInteger(delay) && delay >= 1 && delay <= INVENTORY_RUN_MAX_RETRY_SECONDS,
  ) ? normalized : null;
}

export function nextInventoryRunAttemptAt(
  attemptCount: number,
  retryDelaysSeconds: readonly number[],
  nowMs = Date.now(),
): string | null {
  const delay = retryDelaysSeconds[attemptCount - 1];
  return delay === undefined ? null : new Date(nowMs + delay * 1_000).toISOString();
}

export async function enqueueDueInventoryFeedRuns(client: DbClient, limit = 25): Promise<number> {
  const { data, error } = await client.rpc("enqueue_due_inventory_feed_runs", {
    p_limit: normalizedLimit(limit),
  });
  if (error) throw new Error(`Unable to enqueue scheduled inventory feed runs: ${error.message}`);
  return data?.length ?? 0;
}

export async function enqueueDueInventoryExportRuns(client: DbClient, limit = 25): Promise<number> {
  const { data, error } = await client.rpc("enqueue_due_inventory_export_runs", {
    p_limit: normalizedLimit(limit),
  });
  if (error) throw new Error(`Unable to enqueue scheduled inventory exports: ${error.message}`);
  return data?.length ?? 0;
}

export async function enqueueInventoryFeedRun(
  client: DbClient,
  feedSourceId: string,
  tenantId: string,
  trigger: "manual" | "scheduled" = "manual",
): Promise<string | null> {
  const { data, error } = await client.rpc("enqueue_inventory_feed_run", {
    p_feed_source_id: feedSourceId,
    p_tenant_id: tenantId,
    p_run_trigger: trigger,
  });
  if (error) throw new Error(`Unable to enqueue inventory feed run: ${error.message}`);
  return typeof data === "string" ? data : null;
}

export async function enqueueInventoryExportRun(
  client: DbClient,
  exportDestinationId: string,
  tenantId: string,
  trigger: "manual" | "scheduled" = "manual",
): Promise<string | null> {
  const { data, error } = await client.rpc("enqueue_inventory_export_run", {
    p_export_destination_id: exportDestinationId,
    p_tenant_id: tenantId,
    p_run_trigger: trigger,
  });
  if (error) throw new Error(`Unable to enqueue inventory export run: ${error.message}`);
  return typeof data === "string" ? data : null;
}

/** Archive configuration without deleting immutable run history. */
export async function archiveInventoryFeedSource(
  client: DbClient,
  feedSourceId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("archive_inventory_feed_source", {
    p_feed_source_id: feedSourceId,
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(`Unable to archive inventory feed source: ${error.message}`);
  return data === true;
}

/** Archive a destination and cancel only work that has not started delivery. */
export async function archiveInventoryExportDestination(
  client: DbClient,
  exportDestinationId: string,
  tenantId: string,
): Promise<boolean> {
  const { data, error } = await client.rpc("archive_inventory_export_destination", {
    p_export_destination_id: exportDestinationId,
    p_tenant_id: tenantId,
  });
  if (error) throw new Error(`Unable to archive inventory export destination: ${error.message}`);
  return data === true;
}

/** Atomically pause/resume future work and cancel superseded queued snapshots. */
export async function setInventoryFeedSourceEnabled(
  client: DbClient,
  feedSourceId: string,
  tenantId: string,
  enabled: boolean,
): Promise<boolean> {
  const { data, error } = await client.rpc("set_inventory_feed_source_enabled", {
    p_feed_source_id: feedSourceId,
    p_tenant_id: tenantId,
    p_enabled: enabled,
  });
  if (error) throw new Error(`Unable to change managed feed source state: ${error.message}`);
  return data === true;
}

/** Atomically pause/resume a destination without reviving an old snapshot. */
export async function setInventoryExportDestinationEnabled(
  client: DbClient,
  exportDestinationId: string,
  tenantId: string,
  enabled: boolean,
): Promise<boolean> {
  const { data, error } = await client.rpc("set_inventory_export_destination_enabled", {
    p_export_destination_id: exportDestinationId,
    p_tenant_id: tenantId,
    p_enabled: enabled,
  });
  if (error) throw new Error(`Unable to change inventory export destination state: ${error.message}`);
  return data === true;
}

export async function claimInventoryFeedRuns(
  client: DbClient,
  limit = 25,
): Promise<ClaimedInventoryFeedRun[]> {
  const { data, error } = await client.rpc("claim_inventory_feed_runs", {
    p_limit: normalizedLimit(limit),
  });
  if (error) throw new Error(`Unable to claim inventory feed runs: ${error.message}`);
  return (data ?? []).map((row) => {
    const retryDelaysSeconds = normalizeInventoryRetryDelays(row.retry_delays_seconds);
    if (!retryDelaysSeconds) throw new Error("Claimed inventory feed has an invalid retry policy.");
    return {
      id: row.id,
      tenantId: row.tenant_id,
      feedSourceId: row.feed_source_id,
      trigger: row.run_trigger,
      sourceSnapshot: row.source_snapshot,
      attemptCount: row.attempt_count,
      credentialCiphertext: row.credential_ciphertext,
      retryDelaysSeconds,
      lastSourceHash: row.last_source_hash,
      sourceConfigVersion: row.source_config_version,
    };
  });
}

export async function claimInventoryExportRuns(
  client: DbClient,
  limit = 25,
): Promise<ClaimedInventoryExportRun[]> {
  const { data, error } = await client.rpc("claim_inventory_export_runs", {
    p_limit: normalizedLimit(limit),
  });
  if (error) throw new Error(`Unable to claim inventory export runs: ${error.message}`);
  return (data ?? []).map((row) => {
    const retryDelaysSeconds = normalizeInventoryRetryDelays(row.retry_delays_seconds);
    if (!retryDelaysSeconds) throw new Error("Claimed inventory export has an invalid retry policy.");
    return {
      id: row.id,
      tenantId: row.tenant_id,
      exportDestinationId: row.export_destination_id,
      trigger: row.run_trigger,
      destinationSnapshot: row.destination_snapshot,
      attemptCount: row.attempt_count,
      credentialCiphertext: row.credential_ciphertext,
      retryDelaysSeconds,
      lastPayloadHash: row.last_payload_hash,
      destinationConfigVersion: row.destination_config_version,
    };
  });
}

/** Extend a live feed execution lease before the stale-claim window elapses. */
export async function heartbeatInventoryFeedRun(
  client: DbClient,
  run: Pick<ClaimedInventoryFeedRun, "id" | "attemptCount">,
): Promise<boolean> {
  const { data, error } = await client.rpc("heartbeat_inventory_feed_run", {
    p_run_id: run.id,
    p_attempt_count: run.attemptCount,
  });
  if (error) throw new Error(`Unable to heartbeat inventory feed run: ${error.message}`);
  return data === true;
}

export async function completeInventoryFeedRun(
  client: DbClient,
  run: Pick<ClaimedInventoryFeedRun, "id" | "attemptCount">,
  completion: InventoryFeedRunCompletion,
): Promise<boolean> {
  assertFeedCompletion(completion);
  const { data, error } = await client.rpc("complete_inventory_feed_run", {
    p_run_id: run.id,
    p_attempt_count: run.attemptCount,
    p_status: completion.status,
    p_source_hash: completion.sourceHash,
    p_input_bytes: completion.inputBytes,
    p_total_rows: completion.totalRows,
    p_processed_rows: completion.processedRows,
    p_created_rows: completion.createdRows,
    p_updated_rows: completion.updatedRows,
    p_skipped_rows: completion.skippedRows,
    p_conflict_rows: completion.conflictRows,
    p_failed_rows: completion.failedRows,
    p_errors: sanitizeInventoryRunDiagnostics(completion.errors),
  });
  if (error) throw new Error(`Unable to complete inventory feed run: ${error.message}`);
  return data === true;
}

export async function completeInventoryExportRun(
  client: DbClient,
  run: Pick<ClaimedInventoryExportRun, "id" | "attemptCount">,
  completion: InventoryExportRunCompletion,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(completion.payloadHash)) {
    throw new Error("Inventory export completion needs a SHA-256 payload hash.");
  }
  if (!Number.isInteger(completion.recordCount) || completion.recordCount < 0) {
    throw new Error("Inventory export record count is invalid.");
  }
  if (completion.responseStatus !== null && (!Number.isInteger(completion.responseStatus) || completion.responseStatus < 100 || completion.responseStatus > 599)) {
    throw new Error("Inventory export response status is invalid.");
  }
  const { data, error } = await client.rpc("complete_inventory_export_run", {
    p_run_id: run.id,
    p_attempt_count: run.attemptCount,
    p_status: completion.status,
    p_payload_hash: completion.payloadHash.toLowerCase(),
    p_record_count: completion.recordCount,
    p_response_status: completion.responseStatus,
  });
  if (error) throw new Error(`Unable to complete inventory export run: ${error.message}`);
  return data === true;
}

export async function failInventoryFeedRun(
  client: DbClient,
  run: Pick<ClaimedInventoryFeedRun, "id" | "attemptCount" | "retryDelaysSeconds">,
  errorMessage: string,
  nowMs = Date.now(),
): Promise<{ retrying: boolean; nextAttemptAt: string | null }> {
  const nextAttemptAt = nextInventoryRunAttemptAt(run.attemptCount, run.retryDelaysSeconds, nowMs);
  const { data, error } = await client.rpc("fail_inventory_feed_run", {
    p_run_id: run.id,
    p_attempt_count: run.attemptCount,
    p_next_attempt_at: nextAttemptAt,
    p_error: safeFailureMessage(errorMessage),
  });
  if (error || data !== true) throw new Error(`Unable to fail inventory feed run: ${error?.message ?? "stale lease"}`);
  return { retrying: nextAttemptAt !== null, nextAttemptAt };
}

export async function failInventoryExportRun(
  client: DbClient,
  run: Pick<ClaimedInventoryExportRun, "id" | "attemptCount" | "retryDelaysSeconds">,
  errorMessage: string,
  nowMs = Date.now(),
): Promise<{ retrying: boolean; nextAttemptAt: string | null }> {
  const nextAttemptAt = nextInventoryRunAttemptAt(run.attemptCount, run.retryDelaysSeconds, nowMs);
  const { data, error } = await client.rpc("fail_inventory_export_run", {
    p_run_id: run.id,
    p_attempt_count: run.attemptCount,
    p_next_attempt_at: nextAttemptAt,
    p_error: safeFailureMessage(errorMessage),
  });
  if (error || data !== true) throw new Error(`Unable to fail inventory export run: ${error?.message ?? "stale lease"}`);
  return { retrying: nextAttemptAt !== null, nextAttemptAt };
}

export function sanitizeInventoryRunDiagnostics(
  diagnostics: readonly InventoryRunDiagnostic[],
): Array<Record<string, unknown>> {
  return diagnostics.slice(0, 100).map((diagnostic) => ({
    stage: diagnostic.stage,
    message: (diagnostic.message.trim() || "Inventory run issue.").slice(0, 500),
    ...(Number.isInteger(diagnostic.line) && (diagnostic.line ?? 0) > 0
      ? { line: diagnostic.line }
      : {}),
  }));
}

function normalizedLimit(limit: number): number {
  return Math.min(100, Math.max(1, Math.trunc(limit)));
}

function safeFailureMessage(errorMessage: string): string {
  return (errorMessage.trim() || "Inventory run failed.").slice(0, 500);
}

function assertFeedCompletion(value: InventoryFeedRunCompletion): void {
  const counts = [
    value.totalRows,
    value.processedRows,
    value.createdRows,
    value.updatedRows,
    value.skippedRows,
    value.conflictRows,
    value.failedRows,
  ];
  if (counts.some((count) => !Number.isInteger(count) || count < 0)) {
    throw new Error("Inventory feed counters must be non-negative integers.");
  }
  if (value.processedRows !== value.createdRows + value.updatedRows + value.skippedRows + value.conflictRows + value.failedRows) {
    throw new Error("Inventory feed counters do not add up.");
  }
  if (value.processedRows > value.totalRows) {
    throw new Error("Inventory feed processed rows cannot exceed total rows.");
  }
  if (value.inputBytes !== null && (!Number.isInteger(value.inputBytes) || value.inputBytes < 0 || value.inputBytes > 104_857_600)) {
    throw new Error("Inventory feed input byte count is invalid.");
  }
  if (value.sourceHash !== null && !/^[0-9a-f]{64}$/i.test(value.sourceHash)) {
    throw new Error("Inventory feed source hash must be a SHA-256 digest.");
  }
}
