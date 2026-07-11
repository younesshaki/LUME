import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;
type UsageSnapshotInsert = Database["public"]["Tables"]["usage_snapshots"]["Insert"];

export const USAGE_EVENT_TYPES = [
  "chat_requests",
  "vehicle_requests",
  "bot_action_requests",
  "lead_requests",
] as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];

export type RecordUsageEventInput = {
  tenantId: string;
  eventType: UsageEventType;
  increment?: number;
  now?: Date;
};

export type StorageUsageSnapshotInput = {
  tenantId: string;
  bytes: number;
  objectCount: number;
  source: string;
  capturedOn?: string;
  metadata?: Record<string, unknown>;
};

export function utcUsagePeriod(now = new Date()): string {
  if (Number.isNaN(now.getTime())) throw new TypeError("now must be a valid date");
  return now.toISOString().slice(0, 10);
}

/** Atomic, best-effort request accounting. Metering never breaks a route. */
export async function recordUsageEvent(
  client: DbClient,
  input: RecordUsageEventInput,
): Promise<boolean> {
  const tenantId = input.tenantId.trim();
  const increment = input.increment ?? 1;
  if (
    !tenantId ||
    !USAGE_EVENT_TYPES.includes(input.eventType) ||
    !Number.isSafeInteger(increment) ||
    increment < 1 ||
    increment > 1_000
  ) {
    return false;
  }

  try {
    const { error } = await client.rpc("increment_usage_event", {
      p_tenant_id: tenantId,
      p_event_type: input.eventType,
      // Let PostgreSQL derive the active subscription bucket in production;
      // `now` provides a deterministic date override for reconciliation.
      p_period_start: input.now ? utcUsagePeriod(input.now) : null,
      p_increment: increment,
    });
    return !error;
  } catch {
    return false;
  }
}

export function buildStorageUsageSnapshot(
  input: StorageUsageSnapshotInput,
): UsageSnapshotInsert | null {
  const tenantId = input.tenantId.trim();
  const source = input.source.trim().slice(0, 40);
  const capturedOn = input.capturedOn ?? new Date().toISOString().slice(0, 10);
  if (
    !tenantId ||
    !source ||
    !isIsoDate(capturedOn) ||
    !isNonnegativeSafeInteger(input.bytes) ||
    !isNonnegativeSafeInteger(input.objectCount)
  ) {
    return null;
  }

  return {
    tenant_id: tenantId,
    metric: "r2_storage_bytes",
    captured_on: capturedOn,
    value: input.bytes,
    object_count: input.objectCount,
    source,
    metadata: input.metadata ?? {},
  };
}

export async function writeStorageUsageSnapshot(
  client: DbClient,
  input: StorageUsageSnapshotInput,
): Promise<boolean> {
  const snapshot = buildStorageUsageSnapshot(input);
  if (!snapshot) return false;
  try {
    const { error } = await client
      .from("usage_snapshots")
      .upsert(snapshot, { onConflict: "tenant_id,metric,captured_on" });
    return !error;
  } catch {
    return false;
  }
}

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
