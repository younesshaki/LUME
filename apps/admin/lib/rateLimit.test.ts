import { beforeEach, describe, expect, it } from "vitest";
import {
  checkChatRateLimit,
  checkPublicRouteRateLimit,
  checkRateLimit,
  clientIpFromRequest,
  PUBLIC_ROUTE_LIMITS,
  rateLimitedResponse,
  resetRateLimits,
} from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  const at = (ms: number) => () => ms;

  it("allows up to the limit inside a window, then rejects with retry-after", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", { limit: 3, windowMs: 1000, now: at(0) }).allowed).toBe(true);
    }
    const rejected = checkRateLimit("k", { limit: 3, windowMs: 1000, now: at(400) });
    expect(rejected.allowed).toBe(false);
    expect(rejected.remaining).toBe(0);
    expect(rejected.retryAfterSeconds).toBe(1);
  });

  it("slides: old hits expire and free capacity", () => {
    checkRateLimit("k", { limit: 2, windowMs: 1000, now: at(0) });
    checkRateLimit("k", { limit: 2, windowMs: 1000, now: at(100) });
    expect(checkRateLimit("k", { limit: 2, windowMs: 1000, now: at(500) }).allowed).toBe(false);
    // t=1050: the t=0 hit has left the window.
    expect(checkRateLimit("k", { limit: 2, windowMs: 1000, now: at(1050) }).allowed).toBe(true);
  });

  it("keys are independent", () => {
    checkRateLimit("a", { limit: 1, windowMs: 1000, now: at(0) });
    expect(checkRateLimit("a", { limit: 1, windowMs: 1000, now: at(1) }).allowed).toBe(false);
    expect(checkRateLimit("b", { limit: 1, windowMs: 1000, now: at(1) }).allowed).toBe(true);
  });

  it("chat policy allows 10/min then 429s", () => {
    for (let i = 0; i < 10; i++) {
      expect(checkChatRateLimit("ip1", () => i * 1000).allowed).toBe(true);
    }
    expect(checkChatRateLimit("ip1", () => 10_000).allowed).toBe(false);
    expect(checkChatRateLimit("ip2", () => 10_000).allowed).toBe(true);
  });
});

describe("checkPublicRouteRateLimit (SCRUM-112)", () => {
  beforeEach(() => resetRateLimits());

  const req = (ip: string) =>
    new Request("https://x.test/api/y", { headers: { "x-forwarded-for": ip } });

  it("enforces the per-scope budget within a one-minute window", () => {
    const limit = PUBLIC_ROUTE_LIMITS["visitor-signup"];
    for (let i = 0; i < limit; i++) {
      expect(checkPublicRouteRateLimit("visitor-signup", req("1.1.1.1"), () => i).allowed).toBe(
        true,
      );
    }
    expect(checkPublicRouteRateLimit("visitor-signup", req("1.1.1.1"), () => limit).allowed).toBe(
      false,
    );
  });

  it("scopes are independent for the same client IP", () => {
    const limit = PUBLIC_ROUTE_LIMITS["gdpr-export"];
    for (let i = 0; i < limit; i++) {
      checkPublicRouteRateLimit("gdpr-export", req("2.2.2.2"), () => i);
    }
    expect(checkPublicRouteRateLimit("gdpr-export", req("2.2.2.2"), () => limit).allowed).toBe(
      false,
    );
    // A different scope from the same IP still has budget.
    expect(checkPublicRouteRateLimit("gdpr-delete", req("2.2.2.2"), () => limit).allowed).toBe(
      true,
    );
  });

  it("clients are independent within a scope", () => {
    const limit = PUBLIC_ROUTE_LIMITS.leads;
    for (let i = 0; i < limit; i++) {
      checkPublicRouteRateLimit("leads", req("3.3.3.3"), () => i);
    }
    expect(checkPublicRouteRateLimit("leads", req("3.3.3.3"), () => limit).allowed).toBe(false);
    expect(checkPublicRouteRateLimit("leads", req("4.4.4.4"), () => limit).allowed).toBe(true);
  });

  it("keeps signed provider webhook bursts on a separate high-volume budget", () => {
    expect(PUBLIC_ROUTE_LIMITS["resend-webhook"]).toBe(600);
    expect(checkPublicRouteRateLimit("resend-webhook", req("5.5.5.5"), () => 0).allowed)
      .toBe(true);
  });
});

describe("rateLimitedResponse", () => {
  it("returns a 429 with Retry-After and merged CORS headers", async () => {
    const response = rateLimitedResponse(
      { allowed: false, retryAfterSeconds: 42, remaining: 0 },
      { "Access-Control-Allow-Origin": "https://site.test" },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://site.test");
    const body = (await response.json()) as { error: string };
    expect(body.error).toContain("Too many requests");
  });
});

describe("clientIpFromRequest", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://x.test/api/chat", { headers });

  it("takes the first x-forwarded-for hop", () => {
    expect(clientIpFromRequest(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip then 'unknown'", () => {
    expect(clientIpFromRequest(req({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIpFromRequest(req({}))).toBe("unknown");
  });
});
