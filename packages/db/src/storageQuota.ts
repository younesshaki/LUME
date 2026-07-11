import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./schema";

type DbClient = SupabaseClient<Database, "public">;
type StorageUsageInsert = Database["public"]["Tables"]["tenant_storage_usage"]["Insert"];

export const METERED_SUPABASE_BUCKETS = [
  "tenant-3d-models",
  "tenant-csvs",
  "tenant-logos",
  "tenant-media",
] as const;

export type MeteredSupabaseBucket = (typeof METERED_SUPABASE_BUCKETS)[number];

export type StorageProviderMeasurement = {
  bytes: number;
  objectCount: number;
};

export type SupabaseStorageMeasurement = StorageProviderMeasurement & {
  buckets: Record<MeteredSupabaseBucket, StorageProviderMeasurement>;
};

export type CombinedStorageMeasurement = StorageProviderMeasurement & {
  supabaseBytes: number;
  supabaseObjectCount: number;
  r2Bytes: number;
  r2ObjectCount: number;
  capturedAt: string;
};

export type StorageQuotaState =
  | "unavailable"
  | "unconfigured"
  | "unlimited"
  | "normal"
  | "warning"
  | "exceeded";

export type TenantStorageAllowance = {
  planId: string;
  planName: string;
  limitBytes: number | null;
};

export type StorageUploadDecision = {
  allowed: boolean;
  reason:
    | "within_limit"
    | "quota_exceeded"
    | "unconfigured"
    | "unlimited"
    | "stale_snapshot"
    | "measurement_unavailable"
    | "fail_open";
  currentBytes: number | null;
  projectedBytes: number | null;
  limitBytes: number | null;
  warning: boolean;
};

export async function measureTenantSupabaseStorage(
  client: DbClient,
  tenantId: string,
): Promise<SupabaseStorageMeasurement | null> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) return null;
  try {
    const { data, error } = await client.rpc("measure_tenant_supabase_storage", {
      p_tenant_id: normalizedTenantId,
    });
    if (error) return null;
    return normalizeSupabaseStorageMeasurement(data);
  } catch {
    return null;
  }
}

export function normalizeSupabaseStorageMeasurement(
  value: unknown,
): SupabaseStorageMeasurement | null {
  if (!Array.isArray(value) || value.length !== METERED_SUPABASE_BUCKETS.length) return null;
  const buckets = {} as Record<MeteredSupabaseBucket, StorageProviderMeasurement>;
  const seen = new Set<string>();
  let bytes = 0;
  let objectCount = 0;

  for (const row of value) {
    if (!isRecord(row) || !isMeteredBucket(row.bucket_id) || seen.has(row.bucket_id)) return null;
    const rowBytes = nonnegativeSafeInteger(row.bytes);
    const rowObjects = nonnegativeSafeInteger(row.object_count);
    const invalidObjects = nonnegativeSafeInteger(row.invalid_object_count);
    if (rowBytes === null || rowObjects === null || invalidObjects === null || invalidObjects > 0) {
      return null;
    }
    seen.add(row.bucket_id);
    buckets[row.bucket_id] = { bytes: rowBytes, objectCount: rowObjects };
    bytes += rowBytes;
    objectCount += rowObjects;
    if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(objectCount)) return null;
  }
  if (seen.size !== METERED_SUPABASE_BUCKETS.length) return null;
  return { bytes, objectCount, buckets };
}

export function combineStorageMeasurements(
  supabase: SupabaseStorageMeasurement,
  r2: StorageProviderMeasurement,
  capturedAt = new Date().toISOString(),
): CombinedStorageMeasurement | null {
  const parsedCapturedAt = new Date(capturedAt);
  if (
    Number.isNaN(parsedCapturedAt.getTime()) ||
    !validMeasurement(r2) ||
    !validMeasurement(supabase)
  ) {
    return null;
  }
  const bytes = supabase.bytes + r2.bytes;
  const objectCount = supabase.objectCount + r2.objectCount;
  if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(objectCount)) return null;
  return {
    bytes,
    objectCount,
    supabaseBytes: supabase.bytes,
    supabaseObjectCount: supabase.objectCount,
    r2Bytes: r2.bytes,
    r2ObjectCount: r2.objectCount,
    capturedAt: parsedCapturedAt.toISOString(),
  };
}

export function buildTenantStorageUsageInsert(
  tenantId: string,
  measurement: CombinedStorageMeasurement,
  metadata: Record<string, unknown> = {},
): StorageUsageInsert | null {
  const normalizedTenantId = tenantId.trim();
  const capturedAt = new Date(measurement.capturedAt);
  if (
    !normalizedTenantId ||
    !validMeasurement(measurement) ||
    Number.isNaN(capturedAt.getTime()) ||
    !isRecord(metadata)
  ) return null;
  return {
    tenant_id: normalizedTenantId,
    captured_on: capturedAt.toISOString().slice(0, 10),
    captured_at: capturedAt.toISOString(),
    total_bytes: measurement.bytes,
    supabase_bytes: measurement.supabaseBytes,
    r2_bytes: measurement.r2Bytes,
    total_object_count: measurement.objectCount,
    supabase_object_count: measurement.supabaseObjectCount,
    r2_object_count: measurement.r2ObjectCount,
    metadata,
  };
}

export async function writeTenantStorageUsage(
  client: DbClient,
  tenantId: string,
  measurement: CombinedStorageMeasurement,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const insert = buildTenantStorageUsageInsert(tenantId, measurement, metadata);
  if (!insert) return false;
  try {
    const { error } = await client
      .from("tenant_storage_usage")
      .upsert(insert, { onConflict: "tenant_id,captured_on" });
    return !error;
  } catch {
    return false;
  }
}

export async function reserveTenantStorageUpload(
  client: DbClient,
  input: {
    tenantId: string;
    reservationKey: string;
    byteSize: number;
    uploadExpiresAt: string;
  },
): Promise<StorageUploadDecision> {
  if (
    !input.tenantId.trim() ||
    !input.reservationKey.trim() ||
    !Number.isSafeInteger(input.byteSize) ||
    input.byteSize <= 0 ||
    Number.isNaN(new Date(input.uploadExpiresAt).getTime())
  ) {
    return failOpenStorageUploadDecision();
  }
  try {
    const { data, error } = await client.rpc("reserve_tenant_storage_upload", {
      p_tenant_id: input.tenantId.trim(),
      p_reservation_key: input.reservationKey,
      p_byte_size: input.byteSize,
      p_upload_expires_at: new Date(input.uploadExpiresAt).toISOString(),
    });
    if (error) return failOpenStorageUploadDecision();
    return normalizeStorageUploadDecision(data) ?? failOpenStorageUploadDecision();
  } catch {
    return failOpenStorageUploadDecision();
  }
}

export async function reconcileStorageReservations(
  client: DbClient,
  tenantId: string,
  uploadedBefore: string,
): Promise<boolean> {
  const cutoff = new Date(uploadedBefore);
  if (!tenantId.trim() || Number.isNaN(cutoff.getTime())) return false;
  try {
    const { error } = await client
      .from("storage_upload_reservations")
      .delete()
      .eq("tenant_id", tenantId.trim())
      .lte("upload_expires_at", cutoff.toISOString());
    return !error;
  } catch {
    return false;
  }
}

export async function loadTenantStorageAllowance(
  client: DbClient,
  tenantId: string,
): Promise<TenantStorageAllowance | null> {
  try {
    const { data: subscription, error: subscriptionError } = await client
      .from("subscriptions")
      .select("plan_id")
      .eq("tenant_id", tenantId.trim())
      .in("status", ["active", "trialing", "past_due", "incomplete"])
      .limit(1)
      .maybeSingle();
    if (subscriptionError || !subscription) return null;
    const { data: plan, error: planError } = await client
      .from("plans")
      .select("name, limits")
      .eq("id", subscription.plan_id)
      .maybeSingle();
    if (planError || !plan) return null;
    return {
      planId: subscription.plan_id,
      planName: plan.name,
      limitBytes: resolveStorageLimit(plan.limits),
    };
  } catch {
    return null;
  }
}

export function resolveStorageLimit(limits: Record<string, unknown>): number | null {
  const value = limits.storage_bytes;
  return typeof value === "number" && Number.isSafeInteger(value) ? value : null;
}

export function storageQuotaState(
  usedBytes: number | null,
  limitBytes: number | null,
): StorageQuotaState {
  if (usedBytes === null || !Number.isSafeInteger(usedBytes) || usedBytes < 0) return "unavailable";
  if (limitBytes === null || !Number.isSafeInteger(limitBytes)) return "unconfigured";
  if (limitBytes < 0) return "unlimited";
  if (limitBytes === 0) return usedBytes > 0 ? "exceeded" : "normal";
  if (usedBytes > limitBytes) return "exceeded";
  return isStorageWarning(usedBytes, limitBytes) ? "warning" : "normal";
}

export function isStorageWarning(usedBytes: number, limitBytes: number): boolean {
  if (
    !Number.isSafeInteger(usedBytes) ||
    usedBytes < 0 ||
    !Number.isSafeInteger(limitBytes) ||
    limitBytes <= 0
  ) {
    return false;
  }
  return usedBytes >= limitBytes - Math.floor(limitBytes / 5);
}

export function storageWarningDedupeKey(planId: string, limitBytes: number): string | null {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId || !Number.isSafeInteger(limitBytes) || limitBytes <= 0) return null;
  return `storage:80:${normalizedPlanId}:${limitBytes}`.slice(0, 200);
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return "—";
  if (bytes < 1_024) return `${bytes} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"] as const;
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1_024;
    unitIndex += 1;
  } while (value >= 1_024 && unitIndex < units.length - 1);
  const digits = value >= 100 || Number.isInteger(value) ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

function normalizeStorageUploadDecision(value: unknown): StorageUploadDecision | null {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  const reason = row.reason;
  if (
    typeof row.allowed !== "boolean" ||
    typeof row.warning !== "boolean" ||
    !isStorageUploadReason(reason)
  ) {
    return null;
  }
  const currentBytes = nullableNonnegativeSafeInteger(row.current_bytes);
  const projectedBytes = nullableNonnegativeSafeInteger(row.projected_bytes);
  const limitBytes = nullableSafeInteger(row.limit_bytes);
  if (currentBytes === undefined || projectedBytes === undefined || limitBytes === undefined) {
    return null;
  }
  return {
    allowed: row.allowed,
    reason,
    currentBytes,
    projectedBytes,
    limitBytes,
    warning: row.warning,
  };
}

function failOpenStorageUploadDecision(): StorageUploadDecision {
  return {
    allowed: true,
    reason: "fail_open",
    currentBytes: null,
    projectedBytes: null,
    limitBytes: null,
    warning: false,
  };
}

function isStorageUploadReason(value: unknown): value is StorageUploadDecision["reason"] {
  return value === "within_limit" ||
    value === "quota_exceeded" ||
    value === "unconfigured" ||
    value === "unlimited" ||
    value === "stale_snapshot" ||
    value === "measurement_unavailable" ||
    value === "fail_open";
}

function isMeteredBucket(value: unknown): value is MeteredSupabaseBucket {
  return typeof value === "string" &&
    METERED_SUPABASE_BUCKETS.includes(value as MeteredSupabaseBucket);
}

function validMeasurement(value: StorageProviderMeasurement): boolean {
  return Number.isSafeInteger(value.bytes) && value.bytes >= 0 &&
    Number.isSafeInteger(value.objectCount) && value.objectCount >= 0;
}

function nullableNonnegativeSafeInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  const parsed = nonnegativeSafeInteger(value);
  return parsed === null ? undefined : parsed;
}

function nullableSafeInteger(value: unknown): number | null | undefined {
  if (value === null) return null;
  const parsed = safeInteger(value);
  return parsed === null ? undefined : parsed;
}

function nonnegativeSafeInteger(value: unknown): number | null {
  const parsed = safeInteger(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

function safeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
