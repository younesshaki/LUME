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

  it("rejects missing or unlisted origins when configured", () => {
    vi.stubEnv("ALLOWED_CHAT_ORIGINS", "https://allowed.example");

    expect(
      isAllowedOrigin(
        new Request("https://api.example/chat", {
          headers: { origin: "https://other.example" },
        })
      )
    ).toBe(false);
    expect(isAllowedOrigin(new Request("https://api.example/chat"))).toBe(false);
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
