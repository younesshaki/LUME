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
        turnstileToken: null,
      },
    });
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
