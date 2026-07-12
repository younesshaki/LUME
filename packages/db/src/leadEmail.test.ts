import { describe, expect, it, vi } from "vitest";
import {
  claimLeadEmailDigests,
  enqueueLeadEmailDigest,
  finishLeadEmailDigest,
  nextLeadDigestAttempt,
} from "./leadEmail";

describe("lead email digest queue", () => {
  it("enqueues a valid lead into its hourly batch", async () => {
    const rpc = vi.fn(async () => ({ data: "batch-1", error: null }));
    await expect(enqueueLeadEmailDigest(
      { rpc } as never,
      "tenant-1",
      "lead-1",
      "2026-07-12T10:15:00Z",
    )).resolves.toBe("batch-1");
    expect(rpc).toHaveBeenCalledWith("enqueue_lead_email_digest", {
      p_tenant_id: "tenant-1",
      p_lead_id: "lead-1",
      p_created_at: "2026-07-12T10:15:00.000Z",
    });
  });

  it("maps claimed batches and drops malformed provider rows", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          id: "batch-1",
          tenant_id: "tenant-1",
          window_start: "2026-07-12T10:00:00Z",
          lead_ids: ["lead-1"],
          attempt_count: 1,
        },
        {
          id: "batch-bad",
          tenant_id: "tenant-1",
          window_start: "bad",
          lead_ids: [],
          attempt_count: 1,
        },
      ],
      error: null,
    }));
    await expect(claimLeadEmailDigests({ rpc } as never, 500)).resolves.toEqual([{
      id: "batch-1",
      tenantId: "tenant-1",
      windowStart: "2026-07-12T10:00:00.000Z",
      leadIds: ["lead-1"],
      attemptCount: 1,
    }]);
    expect(rpc).toHaveBeenCalledWith("claim_lead_email_digests", { p_limit: 100 });
  });

  it("uses bounded retries then marks terminal outcomes", async () => {
    expect(nextLeadDigestAttempt(1, 0)).toBe("1970-01-01T00:05:00.000Z");
    expect(nextLeadDigestAttempt(5, 0)).toBeNull();

    const eqAttempt = vi.fn(async () => ({ error: null }));
    const eqStatus = vi.fn(() => ({ eq: eqAttempt }));
    const eqId = vi.fn(() => ({ eq: eqStatus }));
    const update = vi.fn(() => ({ eq: eqId }));
    const from = vi.fn(() => ({ update }));
    await finishLeadEmailDigest(
      { from } as never,
      { id: "batch-1", attemptCount: 1 },
      { success: false, error: "temporary" },
      0,
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: "retrying",
      next_attempt_at: "1970-01-01T00:05:00.000Z",
      last_error: "temporary",
    }));

    await finishLeadEmailDigest(
      { from } as never,
      { id: "batch-2", attemptCount: 1 },
      { success: true },
      0,
    );
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "sent",
      sent_at: "1970-01-01T00:00:00.000Z",
    }));
    expect(eqAttempt).toHaveBeenCalledWith("attempt_count", 1);
  });
});
