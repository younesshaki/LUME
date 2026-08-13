import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearTenantInventoryCountCache,
  tenantLiveVehicleCount,
} from "./tenantInventoryCount";

beforeEach(() => {
  clearTenantInventoryCountCache();
});

describe("tenantLiveVehicleCount", () => {
  it("reads once and serves the rest of the minute from cache", async () => {
    const read = vi.fn(async () => 42);
    const now = 1_000_000;

    expect(await tenantLiveVehicleCount("t1", read, now)).toBe(42);
    expect(await tenantLiveVehicleCount("t1", read, now + 30_000)).toBe(42);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again once the entry expires", async () => {
    const read = vi.fn(async () => 42);
    const now = 1_000_000;

    await tenantLiveVehicleCount("t1", read, now);
    await tenantLiveVehicleCount("t1", read, now + 60_001);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("keeps tenants separate", async () => {
    const read = vi.fn(async (tenantId: string) => (tenantId === "t1" ? 10 : 20));
    expect(await tenantLiveVehicleCount("t1", read, 0)).toBe(10);
    expect(await tenantLiveVehicleCount("t2", read, 0)).toBe(20);
  });

  it("returns undefined rather than throwing when the read fails", async () => {
    // The count is decoration on the prompt. A failure must never fail the
    // turn — the prompt just omits the line, as it did before this existed.
    const read = vi.fn(async () => {
      throw new Error("connection reset");
    });
    expect(await tenantLiveVehicleCount("t1", read, 0)).toBeUndefined();
  });

  it("caches a failure too, so a broken read is not retried every turn", async () => {
    const read = vi.fn(async () => {
      throw new Error("connection reset");
    });
    await tenantLiveVehicleCount("t1", read, 0);
    await tenantLiveVehicleCount("t1", read, 1_000);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("passes a zero count through instead of treating it as absent", async () => {
    // A tenant with no live stock is a real state; the prompt should say 0,
    // not omit the line as though the count were unknown.
    expect(await tenantLiveVehicleCount("t1", async () => 0, 0)).toBe(0);
  });
});
