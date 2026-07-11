import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  apiKeyFromRequest,
  generateApiKey,
  hashApiKey,
  isApiKeyScope,
} from "./apiKeys";

describe("generateApiKey", () => {
  it("produces a prefixed key whose stored hash matches and never stores the raw key", () => {
    const generated = generateApiKey();
    expect(generated.rawKey.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(generated.rawKey.length).toBe(API_KEY_PREFIX.length + 64);
    expect(generated.keyHash).toBe(hashApiKey(generated.rawKey));
    expect(generated.keyHash).not.toContain(API_KEY_PREFIX);
    expect(generated.keyPrefix).toBe(generated.rawKey.slice(0, API_KEY_PREFIX.length + 4));
  });

  it("keys are unique", () => {
    expect(generateApiKey().rawKey).not.toBe(generateApiKey().rawKey);
  });
});

describe("apiKeyFromRequest", () => {
  const req = (auth?: string) =>
    new Request("https://x.test/api/leads", {
      headers: auth ? { authorization: auth } : {},
    });

  it("extracts a bearer key with our prefix", () => {
    const key = `${API_KEY_PREFIX}${"a".repeat(64)}`;
    expect(apiKeyFromRequest(req(`Bearer ${key}`))).toBe(key);
  });

  it("ignores missing, malformed, and foreign bearer tokens", () => {
    expect(apiKeyFromRequest(req())).toBeNull();
    expect(apiKeyFromRequest(req("Basic abc"))).toBeNull();
    expect(apiKeyFromRequest(req("Bearer sk-something-else"))).toBeNull();
  });
});

describe("isApiKeyScope", () => {
  it("accepts known scopes and rejects everything else", () => {
    expect(isApiKeyScope("leads:write")).toBe(true);
    expect(isApiKeyScope("vehicles:read")).toBe(true);
    expect(isApiKeyScope("admin:*")).toBe(false);
    expect(isApiKeyScope("")).toBe(false);
  });
});
