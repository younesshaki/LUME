import { describe, expect, it, vi } from "vitest";
import { recordPublicUsage, type UsageRpc } from "../../api/usage";

describe("root API usage metering", () => {
  it("records one tenant-scoped event through the atomic RPC", async () => {
    const rpc = vi.fn<UsageRpc>(async () => ({ error: null }));
    await expect(recordPublicUsage(rpc, " tenant-1 ", "vehicle_requests"))
      .resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("increment_usage_event", {
      p_tenant_id: "tenant-1",
      p_event_type: "vehicle_requests",
      p_period_start: null,
      p_increment: 1,
    });
  });

  it("fails open when the service client or migration is unavailable", async () => {
    await expect(recordPublicUsage(null, "tenant-1", "lead_requests"))
      .resolves.toBe(false);
    const rpc = vi.fn<UsageRpc>(async () => ({ error: { message: "missing" } }));
    await expect(recordPublicUsage(rpc, "tenant-1", "lead_requests"))
      .resolves.toBe(false);
  });
});
