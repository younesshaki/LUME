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
