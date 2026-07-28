import { describe, expect, it } from "vitest";

import {
  providerAvailabilityFromEnvironment,
  resolveChatProviderFromEnvironment,
} from "./chatProviderResolution";

describe("server-side concierge provider resolution", () => {
  it("resolves each configured provider without exposing one through the other", () => {
    const environment = {
      DEEPSEEK_API_KEY: "deepseek-test-key",
      MOONSHOT_API_KEY: "moonshot-test-key",
    };
    expect(providerAvailabilityFromEnvironment(environment)).toEqual({
      deepseek: true,
      moonshot: true,
      gateway: false,
    });
    expect(
      resolveChatProviderFromEnvironment("deepseek-v4-pro", environment),
    ).toMatchObject({
      profile: { id: "deepseek-v4-pro", provider: "deepseek" },
      apiKey: "deepseek-test-key",
      fellBack: false,
    });
    expect(
      resolveChatProviderFromEnvironment("kimi-k3", environment),
    ).toMatchObject({
      profile: { id: "kimi-k3", provider: "moonshot" },
      apiKey: "moonshot-test-key",
      fellBack: false,
    });
  });

  it("resolves selected GPT and Claude profiles only through the configured AI Gateway", () => {
    const environment = { AI_GATEWAY_API_KEY: "gateway-test-key" };
    expect(providerAvailabilityFromEnvironment(environment)).toEqual({
      deepseek: false,
      moonshot: false,
      gateway: true,
    });
    expect(
      resolveChatProviderFromEnvironment("openai-gpt-5.4-mini", environment),
    ).toMatchObject({
      profile: { id: "openai-gpt-5.4-mini", provider: "gateway", gatewayModelId: "openai/gpt-5.4-mini" },
      apiKey: "gateway-test-key",
      apiUrl: "https://ai-gateway.vercel.sh/v1/chat/completions",
      fellBack: false,
    });
    expect(
      resolveChatProviderFromEnvironment("anthropic-claude-sonnet-4.6", environment),
    ).toMatchObject({
      profile: { id: "anthropic-claude-sonnet-4.6", provider: "gateway", gatewayModelId: "anthropic/claude-sonnet-4.6" },
      apiKey: "gateway-test-key",
      fellBack: false,
    });
  });

  it("falls back to the cheapest available provider after environment drift", () => {
    expect(
      resolveChatProviderFromEnvironment("kimi-k3", {
        DEEPSEEK_API_KEY: "deepseek-test-key",
      }),
    ).toMatchObject({
      requestedModelId: "kimi-k3",
      profile: { id: "deepseek-v4-flash" },
      fellBack: true,
    });
    expect(
      resolveChatProviderFromEnvironment("deepseek-v4-pro", {
        MOONSHOT_API_KEY: "moonshot-test-key",
      }),
    ).toMatchObject({
      requestedModelId: "deepseek-v4-pro",
      profile: { id: "kimi-k2.6" },
      fellBack: true,
    });
  });

  it("returns null when no server provider secret exists", () => {
    expect(resolveChatProviderFromEnvironment("kimi-k3", {})).toBeNull();
  });
});
