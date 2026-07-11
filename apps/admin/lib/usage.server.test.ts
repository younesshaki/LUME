// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { recordPublicApiUsage } from "./usage.server";

describe("public API usage metering", () => {
  it("awaits the atomic tenant usage RPC", async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    await expect(recordPublicApiUsage(
      "tenant-1",
      "chat_requests",
      { rpc } as never,
    )).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("increment_usage_event", {
      p_tenant_id: "tenant-1",
      p_event_type: "chat_requests",
      p_period_start: null,
      p_increment: 1,
    });
  });

  it("never turns a metering failure into an API failure", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("usage unavailable");
    });
    await expect(recordPublicApiUsage(
      "tenant-1",
      "lead_requests",
      { rpc } as never,
    )).resolves.toBe(false);
  });
});
