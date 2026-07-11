// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearQuotaPlanCache } from "@lume/db";
import { checkPublicApiQuota } from "./quota.server";

beforeEach(() => {
  clearQuotaPlanCache();
});

describe("public API quota adapter", () => {
  it("delegates an unconfigured tenant to atomic best-effort metering", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      limit: () => builder,
      maybeSingle,
    };
    const rpc = vi.fn(async () => ({
      data: [{ allowed: true, usage_count: 1, period_start: "2026-07-01" }],
      error: null,
    }));

    await expect(checkPublicApiQuota(
      "tenant-1",
      "vehicle_requests",
      { from: () => builder, rpc } as never,
    )).resolves.toMatchObject({ allowed: true, reason: "unconfigured" });
    expect(rpc).toHaveBeenCalledWith("consume_usage_event", expect.objectContaining({
      p_tenant_id: "tenant-1",
      p_event_type: "vehicle_requests",
    }));
  });

  it("never throws when the client is unavailable", async () => {
    await expect(checkPublicApiQuota(
      "tenant-1",
      "lead_requests",
      {
        from: () => {
          throw new Error("database unavailable");
        },
        rpc: vi.fn(),
      } as never,
    )).resolves.toMatchObject({ allowed: true, reason: "fail_open" });
  });
});
