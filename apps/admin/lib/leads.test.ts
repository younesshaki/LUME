import { describe, expect, it } from "vitest";
import {
  conciergeConversionMetadata,
  normalizeLeadCaptureInput,
  verifyTurnstileToken,
} from "./leads";

describe("normalizeLeadCaptureInput", () => {
  it("requires at least one reachable contact method", () => {
    expect(normalizeLeadCaptureInput({ message: "Hello" })).toEqual({
      ok: false,
      error: "Email or phone is required.",
    });
  });

  it("rejects invalid email addresses", () => {
    expect(normalizeLeadCaptureInput({ email: "not-email" })).toEqual({
      ok: false,
      error: "Email is invalid.",
    });
  });

  it("normalizes public lead capture fields", () => {
    expect(
      normalizeLeadCaptureInput({
        firstName: " Ada ",
        lastName: " Lovelace ",
        email: " ada@example.com ",
        source: "chat",
        message: "Interested",
      })
    ).toEqual({
      ok: true,
      value: {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada@example.com",
        phone: null,
        message: "Interested",
        vehicleId: null,
        source: "chat",
        utmSource: null,
        utmMedium: null,
        utmCampaign: null,
        utmContent: null,
        referrer: null,
        sourceContext: null,
        turnstileToken: null,
      },
    });
  });

  it("bounds attribution and keeps only safe bot trigger context", () => {
    const result = normalizeLeadCaptureInput({
      email: "visitor@example.com",
      source: "chat",
      utmContent: `  ${"x".repeat(140)}  `,
      referrer: "https://publisher.example/article",
      sourceContext: {
        trigger: "bot-action",
        actionType: "capture_lead",
        vehicleId: " vehicle-1 ",
        targetKey: " vehicle-inquiry ",
        chatSessionId: " chat-1 ",
        conversationContext: `  ${"context ".repeat(220)}  `,
        rawConversation: "must not persist",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.utmContent).toHaveLength(120);
    expect(result.value.referrer).toBe("https://publisher.example/article");
    expect(result.value.sourceContext).toEqual({
      trigger: "bot-action",
      actionType: "capture_lead",
      vehicleId: "vehicle-1",
      targetKey: "vehicle-inquiry",
      chatSessionId: "chat-1",
      conversationContext: `${"context ".repeat(150)}`,
    });
    expect(result.value.sourceContext?.trigger).toBe("bot-action");
    if (result.value.sourceContext?.trigger === "bot-action") {
      expect(result.value.sourceContext.conversationContext).toHaveLength(1_200);
    }
  });

  it("keeps the safe vehicle inquiry context for contact-form submissions", () => {
    const inquiry = normalizeLeadCaptureInput({
      email: "visitor@example.com",
      source: "contact-form",
      sourceContext: {
        trigger: "vehicle-inquiry",
        actionType: "request-info",
        pagePath: "/vehicles/vehicle-1",
        vehicleTitle: "2024 LUME Grand Touring",
        untrusted: "must not persist",
      },
    });
    expect(inquiry.ok).toBe(true);
    if (!inquiry.ok) return;
    expect(inquiry.value.sourceContext).toEqual({
      trigger: "vehicle-inquiry",
      actionType: "request-info",
      pagePath: "/vehicles/vehicle-1",
      vehicleTitle: "2024 LUME Grand Touring",
    });
  });

  it("drops unsupported source context submissions", () => {
    const nonChat = normalizeLeadCaptureInput({
      phone: "123",
      source: "contact-form",
      sourceContext: { trigger: "bot-action", actionType: "open-lead-form" },
    });
    const malformed = normalizeLeadCaptureInput({
      phone: "123",
      source: "chat",
      sourceContext: { trigger: "bot-action", actionType: "delete_lead" },
    });
    expect(nonChat.ok && nonChat.value.sourceContext).toBeNull();
    expect(malformed.ok && malformed.value.sourceContext).toBeNull();
  });

  it("accepts a bounded Turnstile token without persisting it as lead data", () => {
    const result = normalizeLeadCaptureInput({
      phone: "123",
      turnstileToken: `  ${"x".repeat(2_100)}  `,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.turnstileToken).toHaveLength(2_048);
  });
});

describe("conciergeConversionMetadata", () => {
  it("records bounded structured concierge attribution without conversation text", () => {
    expect(
      conciergeConversionMetadata({
        sourceContext: {
          trigger: "bot-action",
          actionType: "open-lead-form",
          targetKey: "contact-lead-form",
          chatSessionId: "chat-1",
          conversationContext: "private visitor context",
        },
      }),
    ).toEqual({
      conciergeDriven: true,
      conciergeAction: "open-lead-form",
      conciergeTargetKey: "contact-lead-form",
      conciergeSessionId: "chat-1",
    });
    expect(
      conciergeConversionMetadata({
        sourceContext: {
          trigger: "vehicle-inquiry",
          actionType: "request-info",
        },
      }),
    ).toEqual({});
  });
});

describe("verifyTurnstileToken", () => {
  it("posts the token to Cloudflare and accepts a successful verification", async () => {
    const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        secret: "secret",
        response: "token",
        remoteip: "203.0.113.1",
      });
      return Response.json({ success: true });
    };

    await expect(
      verifyTurnstileToken({
        secret: "secret",
        token: "token",
        remoteIp: "203.0.113.1",
        fetcher: fetcher as typeof fetch,
      })
    ).resolves.toBe(true);
  });

  it("fails closed for invalid input, upstream rejection, and network errors", async () => {
    await expect(verifyTurnstileToken({ secret: "secret", token: "" })).resolves.toBe(false);
    await expect(
      verifyTurnstileToken({
        secret: "secret",
        token: "token",
        fetcher: (async () => Response.json({ success: false })) as typeof fetch,
      })
    ).resolves.toBe(false);
    await expect(
      verifyTurnstileToken({
        secret: "secret",
        token: "token",
        fetcher: (async () => {
          throw new Error("offline");
        }) as typeof fetch,
      })
    ).resolves.toBe(false);
  });
});
