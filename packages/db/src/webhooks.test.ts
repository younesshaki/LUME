import { describe, expect, it, vi } from "vitest";
import {
  deliverTenantWebhook,
  isAllowedWebhookEndpoint,
  nextWebhookAttempt,
  signWebhookPayload,
  WEBHOOK_RETRY_DELAYS_MS,
  type WebhookDeliveryJob,
} from "./webhooks";

const job: WebhookDeliveryJob = {
  id: "delivery-1",
  endpointUrl: "https://example.com/hooks/lume",
  eventType: "lead.created",
  eventId: "lead-1",
  payload: { email: "guest@example.com" },
  attemptCount: 0,
};

describe("tenant webhook delivery", () => {
  it("rejects unsafe webhook destinations before transport", () => {
    expect(isAllowedWebhookEndpoint("https://hooks.example.com/lume")).toBe(true);
    expect(isAllowedWebhookEndpoint("http://hooks.example.com/lume")).toBe(false);
    expect(isAllowedWebhookEndpoint("https://user:pass@hooks.example.com/lume")).toBe(false);
    expect(isAllowedWebhookEndpoint("https://localhost/hook")).toBe(false);
    expect(isAllowedWebhookEndpoint("https://127.0.0.1/hook")).toBe(false);
    expect(isAllowedWebhookEndpoint("https://10.0.0.5/hook")).toBe(false);
    expect(isAllowedWebhookEndpoint("https://192.168.1.5/hook")).toBe(false);
    expect(isAllowedWebhookEndpoint("https://[::1]/hook")).toBe(false);
  });

  it("builds a standard HMAC-SHA256 signature", async () => {
    await expect(signWebhookPayload("key", "The quick brown fox jumps over the lazy dog"))
      .resolves.toBe("sha256=f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8");
  });

  it("uses the documented retry schedule and then dead-letters", () => {
    expect(WEBHOOK_RETRY_DELAYS_MS).toEqual([
      60_000,
      300_000,
      1_800_000,
      3_600_000,
      21_600_000,
    ]);
    expect(nextWebhookAttempt(0, 0)).toBe("1970-01-01T00:01:00.000Z");
    expect(nextWebhookAttempt(5, 0)).toBeNull();
    expect(() => nextWebhookAttempt(-1)).toThrow(/non-negative/i);
  });

  it("is a safe no-op until transport and secret configuration are injected", async () => {
    await expect(deliverTenantWebhook(job)).resolves.toEqual({ status: "not_configured" });
  });

  it("sends a signed envelope through an injected transport", async () => {
    const transport = vi.fn().mockResolvedValue({ status: 204 });
    const outcome = await deliverTenantWebhook(job, {
      signingSecret: "test-only-secret",
      transport,
    });

    expect(outcome).toEqual({ status: "succeeded", responseStatus: 204 });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({
      url: job.endpointUrl,
      headers: expect.objectContaining({
        "X-Lume-Event": "lead.created",
        "X-Lume-Delivery": "delivery-1",
        "X-Lume-Signature": expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
      }),
    }));
  });

  it("returns retry and dead-letter decisions without throwing", async () => {
    const retry = await deliverTenantWebhook(job, {
      signingSecret: "test-only-secret",
      transport: async () => ({ status: 503 }),
      nowMs: 0,
    });
    expect(retry).toEqual({
      status: "retrying",
      responseStatus: 503,
      nextAttemptAt: "1970-01-01T00:01:00.000Z",
      error: "Webhook responded with HTTP 503.",
    });

    const dead = await deliverTenantWebhook({ ...job, attemptCount: 5 }, {
      signingSecret: "test-only-secret",
      transport: async () => { throw new Error("timeout"); },
      nowMs: 0,
    });
    expect(dead).toEqual({ status: "dead_letter", responseStatus: null, error: "timeout" });
  });

  it("does not invoke transport for a private destination", async () => {
    const transport = vi.fn().mockResolvedValue({ status: 204 });
    await expect(deliverTenantWebhook(
      { ...job, endpointUrl: "https://127.0.0.1/internal" },
      { signingSecret: "test-only-secret", transport },
    )).resolves.toEqual({
      status: "dead_letter",
      responseStatus: null,
      error: "Webhook endpoint is not allowed.",
    });
    expect(transport).not.toHaveBeenCalled();
  });
});
