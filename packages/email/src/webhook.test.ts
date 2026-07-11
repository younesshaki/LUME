import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readResendWebhookSecret } from "./config";
import { normalizeResendWebhookEvent, verifyResendWebhook } from "./webhook";

const tenantId = "123e4567-e89b-42d3-a456-426614174000";

function emailEvent(
  type: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type,
    created_at: "2026-07-11T18:00:00.000Z",
    data: {
      email_id: "email-provider-1",
      to: ["Ada <ADA@example.com>"],
      tags: { tenant_id: tenantId, template: "welcome" },
      ...overrides,
    },
  };
}

describe("Resend webhook normalization", () => {
  it("tracks delivered events using only canonical operational fields", () => {
    expect(normalizeResendWebhookEvent(emailEvent("email.delivered"))).toEqual({
      kind: "tracked",
      event: {
        tenantId,
        providerEmailId: "email-provider-1",
        eventType: "email.delivered",
        occurredAt: "2026-07-11T18:00:00.000Z",
        recipients: ["ada@example.com"],
        templateKey: "welcome",
        bounceType: null,
        bounceSubtype: null,
        bounceMessage: null,
        suppressionReason: null,
        suppressedRecipients: [],
      },
    });
  });

  it("logs complaints without applying the hard-bounce suppression policy", () => {
    const decision = normalizeResendWebhookEvent(emailEvent("email.complained", {
      to: ["Ada <ADA@example.com>", "ada@example.com", "bob@example.com"],
    }));
    expect(decision).toMatchObject({
      kind: "tracked",
      event: {
        recipients: ["ada@example.com", "bob@example.com"],
        suppressionReason: null,
        suppressedRecipients: [],
      },
    });
  });

  it("suppresses permanent bounces but records transient bounces without suppressing", () => {
    const permanent = normalizeResendWebhookEvent(emailEvent("email.bounced", {
      bounce: { type: "pErMaNeNt", subType: "General", message: "Mailbox unavailable" },
    }));
    expect(permanent).toMatchObject({
      kind: "tracked",
      event: {
        bounceType: "pErMaNeNt",
        suppressionReason: "hard_bounce",
        suppressedRecipients: ["ada@example.com"],
      },
    });

    const transient = normalizeResendWebhookEvent(emailEvent("email.bounced", {
      bounce: { type: "Transient", subType: "General", message: "Try later" },
    }));
    expect(transient).toMatchObject({
      kind: "tracked",
      event: { suppressionReason: null, suppressedRecipients: [] },
    });

    const undetermined = normalizeResendWebhookEvent(emailEvent("email.bounced", {
      bounce: { type: "Undetermined", subType: "General", message: "Unknown response" },
    }));
    expect(undetermined).toMatchObject({
      kind: "tracked",
      event: { suppressionReason: null, suppressedRecipients: [] },
    });
  });

  it("acknowledges unsupported and untagged events without cross-tenant attribution", () => {
    expect(normalizeResendWebhookEvent(emailEvent("email.opened"))).toEqual({
      kind: "ignored",
      reason: "unsupported_event",
    });
    expect(normalizeResendWebhookEvent(emailEvent("email.delivered", { tags: {} }))).toEqual({
      kind: "ignored",
      reason: "unattributed",
    });
    expect(normalizeResendWebhookEvent(emailEvent("email.delivered", {
      tags: { tenant_id: "not-a-tenant", template: "welcome" },
    }))).toEqual({ kind: "ignored", reason: "unattributed" });
  });

  it("rejects malformed tracked events and noncanonical recipient data", () => {
    expect(normalizeResendWebhookEvent(emailEvent("email.delivered", { to: [] }))).toEqual({
      kind: "invalid",
      reason: "Tracked email event is missing required fields.",
    });
    expect(normalizeResendWebhookEvent(emailEvent("email.bounced"))).toEqual({
      kind: "invalid",
      reason: "Bounce event is missing its type.",
    });
  });
});

describe("Resend webhook verification", () => {
  it("reads only a bounded configured webhook secret", () => {
    expect(readResendWebhookSecret({})).toBeNull();
    expect(readResendWebhookSecret({ RESEND_WEBHOOK_SECRET: "  whsec_test  " }))
      .toBe("whsec_test");
    expect(readResendWebhookSecret({ RESEND_WEBHOOK_SECRET: "x".repeat(513) })).toBeNull();
  });

  it("verifies the exact raw payload and rejects tampering", () => {
    const rawSecret = "test-only-webhook-secret";
    const webhookSecret = `whsec_${Buffer.from(rawSecret).toString("base64")}`;
    const payload = JSON.stringify(emailEvent("email.delivered"));
    const id = "msg_test_1";
    const timestamp = String(Math.floor(Date.now() / 1_000));
    const signature = `v1,${createHmac("sha256", rawSecret)
      .update(`${id}.${timestamp}.${payload}`)
      .digest("base64")}`;
    const headers = { id, timestamp, signature };

    expect(verifyResendWebhook({ payload, headers, webhookSecret }))
      .toMatchObject({ type: "email.delivered" });
    expect(() => verifyResendWebhook({
      payload: `${payload} `,
      headers,
      webhookSecret,
    })).toThrow();
  });
});
