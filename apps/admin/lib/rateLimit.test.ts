import { beforeEach, describe, expect, it } from "vitest";
import {
  checkChatRateLimit,
  checkRateLimit,
  clientIpFromRequest,
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
