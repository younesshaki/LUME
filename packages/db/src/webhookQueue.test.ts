import { describe, expect, it, vi } from "vitest";
import { claimWebhookDeliveries, finishWebhookDelivery } from "./webhookQueue";

describe("webhook delivery queue", () => {
  it("normalizes claimed attempts for the delivery retry policy", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{
      id: "delivery-1",
      tenant_id: "tenant-1",
      webhook_id: "hook-1",
      endpoint_url: "https://example.com/hook",
      event_type: "lead.created",
      event_id: "lead-1",
      payload: { lead: { id: "lead-1" } },
      attempt_count: 1,
      signing_secret_ciphertext: "ciphertext",
      retry_delays_seconds: [60, 300],
    }], error: null });
    const client = { rpc } as unknown as Parameters<typeof claimWebhookDeliveries>[0];
    await expect(claimWebhookDeliveries(client)).resolves.toMatchObject([{
      attemptCount: 0,
      claimedAttemptCount: 1,
      retryDelaysSeconds: [60, 300],
    }]);
  });

  it("leases the completion update to the claimed attempt", async () => {
    const calls: Array<{ operation: string; value: unknown }> = [];
    const chain = {
      update(value: unknown) { calls.push({ operation: "update", value }); return this; },
      eq(column: string, value: unknown) { calls.push({ operation: `eq:${column}`, value }); return this; },
      then(resolve: (value: unknown) => void) { resolve({ error: null }); },
    };
    const client = { from: vi.fn(() => chain) } as unknown as Parameters<typeof finishWebhookDelivery>[0];
    await finishWebhookDelivery(client, { id: "delivery-1", claimedAttemptCount: 2 }, {
      status: "dead_letter",
      responseStatus: 500,
      error: "failed",
    });
    expect(calls).toContainEqual({ operation: "eq:attempt_count", value: 2 });
    expect(calls[0]?.value).toMatchObject({ status: "dead_letter", last_error: "failed" });
  });
});
