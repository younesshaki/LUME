import { describe, expect, it, vi } from "vitest";
import {
  completeVehicleImageDescription,
  failVehicleImageDescription,
} from "./imageDescriptions";

describe("vehicle image description jobs", () => {
  it("retries three times and then dead-letters", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as Parameters<typeof failVehicleImageDescription>[0];
    await expect(failVehicleImageDescription(client, { id: "job", attemptCount: 1 }, "error", 0))
      .resolves.toEqual({ retrying: true, nextAttemptAt: "1970-01-01T00:01:00.000Z" });
    await expect(failVehicleImageDescription(client, { id: "job", attemptCount: 4 }, "error", 0))
      .resolves.toEqual({ retrying: false, nextAttemptAt: null });
  });

  it("rejects empty or oversized model output before storage", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const client = { rpc } as unknown as Parameters<typeof completeVehicleImageDescription>[0];
    await expect(completeVehicleImageDescription(client, { id: "job", attemptCount: 1 }, "", "model"))
      .resolves.toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
