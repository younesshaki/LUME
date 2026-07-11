import { describe, expect, it, vi } from "vitest";
import {
  buildTenantStorageUsageInsert,
  combineStorageMeasurements,
  formatStorageBytes,
  isStorageWarning,
  measureTenantSupabaseStorage,
  normalizeSupabaseStorageMeasurement,
  reconcileStorageReservations,
  reserveTenantStorageUpload,
  resolveStorageLimit,
  storageQuotaState,
  storageWarningDedupeKey,
  writeTenantStorageUsage,
} from "./storageQuota";

const providerRows = () => [
  { bucket_id: "tenant-3d-models", bytes: 10, object_count: 1, invalid_object_count: 0 },
  { bucket_id: "tenant-csvs", bytes: "20", object_count: "2", invalid_object_count: 0 },
  { bucket_id: "tenant-logos", bytes: 30, object_count: 3, invalid_object_count: 0 },
  { bucket_id: "tenant-media", bytes: 40, object_count: 4, invalid_object_count: 0 },
];

describe("Supabase storage measurements", () => {
  it("requires one valid row for every tenant bucket and totals safely", () => {
    expect(normalizeSupabaseStorageMeasurement(providerRows())).toEqual({
      bytes: 100,
      objectCount: 10,
      buckets: {
        "tenant-3d-models": { bytes: 10, objectCount: 1 },
        "tenant-csvs": { bytes: 20, objectCount: 2 },
        "tenant-logos": { bytes: 30, objectCount: 3 },
        "tenant-media": { bytes: 40, objectCount: 4 },
      },
    });
  });

  it("rejects partial, duplicate, invalid-size, and unsafe measurements", () => {
    expect(normalizeSupabaseStorageMeasurement(providerRows().slice(1))).toBeNull();
    expect(normalizeSupabaseStorageMeasurement([
      ...providerRows().slice(0, 3),
      providerRows()[0],
    ])).toBeNull();
    expect(normalizeSupabaseStorageMeasurement(providerRows().map((row, index) =>
      index === 0 ? { ...row, invalid_object_count: 1 } : row
    ))).toBeNull();
    expect(normalizeSupabaseStorageMeasurement(providerRows().map((row, index) =>
      index === 0 ? { ...row, bytes: Number.MAX_SAFE_INTEGER } : row
    ))).toBeNull();
  });

  it("calls the service-only measurement RPC and fails closed on errors", async () => {
    const rpc = vi.fn(async () => ({ data: providerRows(), error: null }));
    await expect(measureTenantSupabaseStorage({ rpc } as never, " tenant-1 "))
      .resolves.toMatchObject({ bytes: 100, objectCount: 10 });
    expect(rpc).toHaveBeenCalledWith("measure_tenant_supabase_storage", {
      p_tenant_id: "tenant-1",
    });

    const failedRpc = vi.fn(async () => ({ data: null, error: { message: "missing" } }));
    await expect(measureTenantSupabaseStorage({ rpc: failedRpc } as never, "tenant-1"))
      .resolves.toBeNull();
  });
});

describe("combined storage snapshots", () => {
  it("combines providers and builds a daily complete snapshot", () => {
    const supabase = normalizeSupabaseStorageMeasurement(providerRows())!;
    const combined = combineStorageMeasurements(
      supabase,
      { bytes: 900, objectCount: 5 },
      "2026-07-11T12:34:56Z",
    );
    expect(combined).toEqual({
      bytes: 1_000,
      objectCount: 15,
      supabaseBytes: 100,
      supabaseObjectCount: 10,
      r2Bytes: 900,
      r2ObjectCount: 5,
      capturedAt: "2026-07-11T12:34:56.000Z",
    });
    expect(buildTenantStorageUsageInsert(" tenant-1 ", combined!, { complete: true }))
      .toMatchObject({
        tenant_id: "tenant-1",
        captured_on: "2026-07-11",
        total_bytes: 1_000,
        supabase_bytes: 100,
        r2_bytes: 900,
        metadata: { complete: true },
      });
  });

  it("upserts by tenant and day and never writes invalid totals", async () => {
    const supabase = normalizeSupabaseStorageMeasurement(providerRows())!;
    const combined = combineStorageMeasurements(supabase, { bytes: 1, objectCount: 1 })!;
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    await expect(writeTenantStorageUsage({ from } as never, "tenant-1", combined))
      .resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("tenant_storage_usage");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ total_bytes: 101 }), {
      onConflict: "tenant_id,captured_on",
    });
    expect(buildTenantStorageUsageInsert("", combined)).toBeNull();
  });
});

describe("storage upload reservations", () => {
  it("maps the atomic RPC decision and normalizes bigint strings", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        allowed: true,
        reason: "within_limit",
        current_bytes: "80",
        projected_bytes: "90",
        limit_bytes: "100",
        warning: true,
      }],
      error: null,
    }));
    await expect(reserveTenantStorageUpload({ rpc } as never, {
      tenantId: " tenant-1 ",
      reservationKey: "acme/vehicles/v/image.webp",
      byteSize: 10,
      uploadExpiresAt: "2026-07-11T12:10:00Z",
    })).resolves.toEqual({
      allowed: true,
      reason: "within_limit",
      currentBytes: 80,
      projectedBytes: 90,
      limitBytes: 100,
      warning: true,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_tenant_storage_upload", {
      p_tenant_id: "tenant-1",
      p_reservation_key: "acme/vehicles/v/image.webp",
      p_byte_size: 10,
      p_upload_expires_at: "2026-07-11T12:10:00.000Z",
    });
  });

  it("fails open on invalid input, RPC error, or malformed output", async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));
    await expect(reserveTenantStorageUpload({ rpc } as never, {
      tenantId: "tenant-1",
      reservationKey: "",
      byteSize: 10,
      uploadExpiresAt: "invalid",
    })).resolves.toMatchObject({ allowed: true, reason: "fail_open" });
    expect(rpc).not.toHaveBeenCalled();
    await expect(reserveTenantStorageUpload({ rpc } as never, {
      tenantId: "tenant-1",
      reservationKey: "key",
      byteSize: 10,
      uploadExpiresAt: "2026-07-11T12:10:00Z",
    })).resolves.toMatchObject({ allowed: true, reason: "fail_open" });
  });

  it("cleans only reservations whose signed upload window was reconciled", async () => {
    const lte = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(() => ({ lte }));
    const remove = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: remove }));
    await expect(reconcileStorageReservations(
      { from } as never,
      " tenant-1 ",
      "2026-07-11T12:00:00Z",
    )).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("storage_upload_reservations");
    expect(eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(lte).toHaveBeenCalledWith("upload_expires_at", "2026-07-11T12:00:00.000Z");
  });
});

describe("storage quota presentation policy", () => {
  it("distinguishes unavailable, unlimited, warning, and exceeded usage", () => {
    expect(storageQuotaState(null, 100)).toBe("unavailable");
    expect(storageQuotaState(10, null)).toBe("unconfigured");
    expect(storageQuotaState(10, -1)).toBe("unlimited");
    expect(storageQuotaState(79, 100)).toBe("normal");
    expect(storageQuotaState(80, 100)).toBe("warning");
    expect(storageQuotaState(100, 100)).toBe("warning");
    expect(storageQuotaState(101, 100)).toBe("exceeded");
    expect(isStorageWarning(1, 1)).toBe(true);
  });

  it("uses only integer byte limits and builds stable warning dedupe keys", () => {
    expect(resolveStorageLimit({ storage_bytes: 100 })).toBe(100);
    expect(resolveStorageLimit({ storage_bytes: "100" })).toBeNull();
    expect(resolveStorageLimit({ storage_bytes: 1.5 })).toBeNull();
    expect(storageWarningDedupeKey("plan-1", 100)).toBe("storage:80:plan-1:100");
    expect(storageWarningDedupeKey("", 100)).toBeNull();
  });

  it("formats byte gauges with bounded IEC units", () => {
    expect(formatStorageBytes(0)).toBe("0 B");
    expect(formatStorageBytes(1_024)).toBe("1 KiB");
    expect(formatStorageBytes(5 * 1_024 ** 3)).toBe("5 GiB");
    expect(formatStorageBytes(-1)).toBe("—");
  });
});
