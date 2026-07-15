import { describe, expect, it } from "vitest";
import { normalizeLeadCaptureInput, verifyTurnstileToken } from "./leads";

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
    });
  });

  it("keeps bounded vehicle-detail inquiry context and drops unknown fields", () => {
    const result = normalizeLeadCaptureInput({
      email: "visitor@example.com",
      source: "contact-form",
      vehicleId: "11111111-1111-4111-8111-111111111111",
      sourceContext: {
        trigger: "vehicle-detail",
        actionType: "request-info",
        vehicleId: " 11111111-1111-4111-8111-111111111111 ",
        vehicleTitle: ` ${"Luxury vehicle ".repeat(30)} `,
        pagePath: "/vehicles/11111111-1111-4111-8111-111111111111?utm_source=test",
        rawProfile: "must not persist",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sourceContext).toEqual({
      trigger: "vehicle-detail",
      actionType: "request-info",
      vehicleId: "11111111-1111-4111-8111-111111111111",
      vehicleTitle: "Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle Luxury vehicle",
      pagePath: "/vehicles/11111111-1111-4111-8111-111111111111?utm_source=test",
    });
    expect(result.value.sourceContext?.vehicleTitle).toHaveLength(240);
  });

  it("drops malformed or source-incompatible context", () => {
    const nonChatBot = normalizeLeadCaptureInput({
      phone: "123",
      source: "contact-form",
      sourceContext: { trigger: "bot-action", actionType: "open-lead-form" },
    });
    const malformedBot = normalizeLeadCaptureInput({
      phone: "123",
      source: "chat",
      sourceContext: { trigger: "bot-action", actionType: "delete_lead" },
    });
    const missingVehicle = normalizeLeadCaptureInput({
      phone: "123",
      source: "contact-form",
      sourceContext: { trigger: "vehicle-detail", actionType: "request-info" },
    });
    expect(nonChatBot.ok && nonChatBot.value.sourceContext).toBeNull();
    expect(malformedBot.ok && malformedBot.value.sourceContext).toBeNull();
    expect(missingVehicle.ok && missingVehicle.value.sourceContext).toBeNull();
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
