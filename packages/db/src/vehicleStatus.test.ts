import { describe, expect, it } from "vitest";
import {
  SOLD_ARCHIVE_AFTER_DAYS,
  archiveDueSoldVehicles,
  soldVehicleArchiveCutoff,
} from "./vehicleStatus";

describe("sold vehicle archival", () => {
  it("calculates a UTC cutoff exactly 90 days before the run", () => {
    expect(SOLD_ARCHIVE_AFTER_DAYS).toBe(90);
    expect(soldVehicleArchiveCutoff(new Date("2026-07-11T12:30:00.000Z"))).toBe(
      "2026-04-12T12:30:00.000Z",
    );
  });

  it("calls the bounded service RPC and reports the changed row count", async () => {
    const calls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: [{ vehicle_id: "v1" }, { vehicle_id: "v2" }], error: null };
      },
    };
    await expect(
      archiveDueSoldVehicles(client as never, new Date("2026-07-11T00:00:00.000Z"), 9_000),
    ).resolves.toBe(2);
    expect(calls).toEqual([[
      "archive_due_sold_vehicles",
      { p_cutoff: "2026-04-12T00:00:00.000Z", p_limit: 5_000 },
    ]]);
  });

  it("surfaces archival RPC failures", async () => {
    const client = {
      rpc: async () => ({ data: null, error: { message: "not available" } }),
    };
    await expect(archiveDueSoldVehicles(client as never)).rejects.toThrow(
      "sold vehicle archival failed: not available",
    );
  });
});
