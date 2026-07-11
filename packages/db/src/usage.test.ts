import { describe, expect, it, vi } from "vitest";
import {
  buildStorageUsageSnapshot,
  utcUsagePeriod,
  recordUsageEvent,
  writeStorageUsageSnapshot,
} from "./usage";

describe("usage event accounting", () => {
  it("computes daily periods in UTC", () => {
    expect(utcUsagePeriod(new Date("2026-07-31T23:59:59-11:00"))).toBe("2026-08-01");
    expect(() => utcUsagePeriod(new Date("invalid"))).toThrow("valid date");
  });

  it("calls the atomic RPC with bounded tenant usage", async () => {
    const rpc = vi.fn(async () => ({ data: 4, error: null }));
    await expect(recordUsageEvent({ rpc } as never, {
      tenantId: " tenant-1 ",
      eventType: "chat_requests",
      increment: 2,
      now: new Date("2026-07-11T12:00:00Z"),
    })).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("increment_usage_event", {
      p_tenant_id: "tenant-1",
      p_event_type: "chat_requests",
      p_period_start: "2026-07-11",
      p_increment: 2,
    });
  });

  it("rejects invalid increments and degrades on RPC failure", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "missing migration" } }));
    await expect(recordUsageEvent({ rpc } as never, {
      tenantId: "tenant-1",
      eventType: "lead_requests",
      increment: 0,
    })).resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    await expect(recordUsageEvent({ rpc } as never, {
      tenantId: "tenant-1",
      eventType: "lead_requests",
    })).resolves.toBe(false);
  });
});

describe("storage usage snapshots", () => {
  it("builds a daily bounded storage measurement", () => {
    expect(buildStorageUsageSnapshot({
      tenantId: " tenant-1 ",
      bytes: 5_000,
      objectCount: 3,
      source: " cloudflare-r2 ",
      capturedOn: "2026-07-11",
      metadata: { prefix: "acme/" },
    })).toEqual({
      tenant_id: "tenant-1",
      metric: "r2_storage_bytes",
      captured_on: "2026-07-11",
      value: 5_000,
      object_count: 3,
      source: "cloudflare-r2",
      metadata: { prefix: "acme/" },
    });
  });

  it("rejects unsafe values and upserts by tenant, metric, and day", async () => {
    expect(buildStorageUsageSnapshot({
      tenantId: "tenant-1",
      bytes: -1,
      objectCount: 0,
      source: "r2",
    })).toBeNull();

    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    await expect(writeStorageUsageSnapshot({ from } as never, {
      tenantId: "tenant-1",
      bytes: 10,
      objectCount: 1,
      source: "r2",
      capturedOn: "2026-07-11",
    })).resolves.toBe(true);
    expect(from).toHaveBeenCalledWith("usage_snapshots");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ value: 10 }), {
      onConflict: "tenant_id,metric,captured_on",
    });
  });
});
