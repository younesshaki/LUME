// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { corsHeadersFor, isAllowedOrigin } from "./origin";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("isAllowedOrigin", () => {
  it("allows configured origins after trimming comma-separated values", () => {
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "https://one.example, https://two.example ");
    const request = new Request("https://api.example/chat", {
      headers: { origin: "https://two.example" },
    });

    expect(isAllowedOrigin(request)).toBe(true);
  });

  it("rejects unlisted origins when configured", () => {
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "https://allowed.example");

    expect(
      isAllowedOrigin(
        new Request("https://api.example/chat", {
          headers: { origin: "https://other.example" },
        })
      )
    ).toBe(false);
  });

  it("allows same-origin requests that omit the Origin header", () => {
    // Browsers drop Origin on same-origin GETs (e.g. the public site's
    // inventory fetch behind the local dev proxy). A cross-site attacker always
    // sends Origin, so an absent Origin is not a cross-site request and is
    // allowed — matching the public root api/*.ts origin check.
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "https://allowed.example");

    expect(isAllowedOrigin(new Request("https://api.example/chat"))).toBe(true);
  });

  it("allows empty configuration in development only", () => {
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "development");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(isAllowedOrigin(new Request("https://api.example/chat"))).toBe(true);
  });

  it("rejects empty configuration in production", () => {
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "");
    vi.stubEnv("NODE_ENV", "production");

    expect(isAllowedOrigin(new Request("https://api.example/chat"))).toBe(false);
  });
});

describe("corsHeadersFor", () => {
  it("returns CORS headers only for allowed origins", () => {
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "https://allowed.example");

    expect(
      corsHeadersFor(
        new Request("https://api.example/chat", {
          headers: { origin: "https://allowed.example" },
        })
      )
    ).toEqual({
      "Access-Control-Allow-Origin": "https://allowed.example",
      "Access-Control-Allow-Headers": "Content-Type, X-Lume-Tenant",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "X-Lume-Quota-Warning",
      Vary: "Origin",
    });

    expect(
      corsHeadersFor(
        new Request("https://api.example/chat", {
          headers: { origin: "https://other.example" },
        })
      )
    ).toEqual({});
  });
});
