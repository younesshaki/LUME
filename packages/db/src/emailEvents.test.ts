import { describe, expect, it, vi } from "vitest";
import { isEmailRecipientSuppressed, recordResendEmailEvent } from "./emailEvents";

const event = {
  tenantId: "123e4567-e89b-42d3-a456-426614174000",
  providerEventId: "msg_event_1",
  providerEmailId: "email_1",
  eventType: "email.bounced" as const,
  recipients: ["ada@example.com"],
  templateKey: "welcome",
  bounceType: "Permanent",
  bounceSubtype: "General",
  bounceMessage: "Mailbox unavailable",
  occurredAt: "2026-07-11T18:00:00.000Z",
};

describe("Resend email event persistence", () => {
  it("maps the atomic RPC and distinguishes provider retries", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: "recorded", error: null })
      .mockResolvedValueOnce({ data: "duplicate", error: null })
      .mockResolvedValueOnce({ data: "unknown_tenant", error: null });
    await expect(recordResendEmailEvent({ rpc } as never, event)).resolves.toBe("recorded");
    await expect(recordResendEmailEvent({ rpc } as never, event)).resolves.toBe("duplicate");
    await expect(recordResendEmailEvent({ rpc } as never, event)).resolves.toBe("unknown_tenant");
    expect(rpc).toHaveBeenCalledWith("record_resend_email_event", {
      p_tenant_id: event.tenantId,
      p_provider_event_id: event.providerEventId,
      p_provider_email_id: event.providerEmailId,
      p_event_type: event.eventType,
      p_recipients: event.recipients,
      p_template_key: event.templateKey,
      p_bounce_type: event.bounceType,
      p_bounce_subtype: event.bounceSubtype,
      p_bounce_message: event.bounceMessage,
      p_occurred_at: event.occurredAt,
    });
  });

  it("throws on provider storage errors or malformed RPC output", async () => {
    await expect(recordResendEmailEvent({
      rpc: vi.fn(async () => ({ data: null, error: { message: "database unavailable" } })),
    } as never, event)).rejects.toThrow(/database unavailable/);
    await expect(recordResendEmailEvent({
      rpc: vi.fn(async () => ({ data: "yes", error: null })),
    } as never, event)).rejects.toThrow(/invalid result/);
  });
});

describe("email suppression lookup", () => {
  function client(result: { data: unknown; error: { message: string } | null }) {
    const maybeSingle = vi.fn(async () => result);
    const recipientEq = vi.fn(() => ({ maybeSingle }));
    const tenantEq = vi.fn(() => ({ eq: recipientEq }));
    const select = vi.fn(() => ({ eq: tenantEq }));
    const from = vi.fn(() => ({ select }));
    return { from, tenantEq, recipientEq };
  }

  it("normalizes a bare mailbox and returns whether a row exists", async () => {
    const found = client({ data: { recipient_email: "ada@example.com" }, error: null });
    await expect(isEmailRecipientSuppressed(
      found as never,
      " ADA@Example.com ",
      event.tenantId,
    )).resolves.toBe(true);
    expect(found.tenantEq).toHaveBeenCalledWith("tenant_id", event.tenantId);
    expect(found.recipientEq).toHaveBeenCalledWith("recipient_email", "ada@example.com");

    await expect(isEmailRecipientSuppressed(
      client({ data: null, error: null }) as never,
      "nobody@example.com",
      event.tenantId,
    )).resolves.toBe(false);
  });

  it("fails closed on invalid input and database errors", async () => {
    await expect(isEmailRecipientSuppressed(
      client({ data: null, error: null }) as never,
      "not-an-email",
      event.tenantId,
    )).rejects.toThrow(/invalid tenant or recipient/);
    await expect(isEmailRecipientSuppressed(
      client({ data: null, error: { message: "unavailable" } }) as never,
      "ada@example.com",
      event.tenantId,
    )).rejects.toThrow(/unavailable/);
  });
});
