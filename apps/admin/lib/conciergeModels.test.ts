import { describe, expect, it } from "vitest";
import {
  CONCIERGE_MODEL_PROFILES,
  clampConciergeModelToCeiling,
  DEFAULT_CONCIERGE_MODEL_ID,
  conciergeModelIndex,
  getConciergeModelProfile,
  isConciergeModelId,
  isPremiumConciergeModel,
  isProviderAvailable,
  normalizeConciergeModelId,
} from "./conciergeModels";

describe("concierge model registry", () => {
  it("keeps stable, unique model ids in intelligence-level order", () => {
    expect(CONCIERGE_MODEL_PROFILES.map((profile) => profile.id)).toEqual([
      "deepseek-v4-flash",
      "kimi-k2.6",
      "deepseek-v4-pro",
      "kimi-k3",
      "openai-gpt-5.4-mini",
      "anthropic-claude-sonnet-4.6",
    ]);
    expect(
      new Set(CONCIERGE_MODEL_PROFILES.map((profile) => profile.id)).size,
    ).toBe(CONCIERGE_MODEL_PROFILES.length);
  });

  it("normalizes retired aliases and rejects unknown database values", () => {
    expect(normalizeConciergeModelId("deepseek-chat")).toBe(
      "deepseek-v4-flash",
    );
    expect(normalizeConciergeModelId("deepseek-reasoner")).toBe(
      "deepseek-v4-flash",
    );
    expect(normalizeConciergeModelId("attacker/model")).toBe(
      DEFAULT_CONCIERGE_MODEL_ID,
    );
    expect(normalizeConciergeModelId(null)).toBe(DEFAULT_CONCIERGE_MODEL_ID);
    expect(isConciergeModelId("kimi-k3")).toBe(true);
    expect(isConciergeModelId("kimi-latest")).toBe(false);
  });

  it("resolves profiles, slider indexes, and provider availability", () => {
    expect(getConciergeModelProfile("kimi-k2.6").provider).toBe("moonshot");
    expect(conciergeModelIndex("deepseek-v4-pro")).toBe(2);
    expect(conciergeModelIndex("unknown")).toBe(0);
    expect(
      isProviderAvailable("kimi-k3", {
        deepseek: true,
        moonshot: false,
        gateway: false,
      }),
    ).toBe(false);
  });

  it("marks every level above the base model as premium (plan-gated)", () => {
    expect(isPremiumConciergeModel(DEFAULT_CONCIERGE_MODEL_ID)).toBe(false);
    expect(isPremiumConciergeModel("kimi-k2.6")).toBe(true);
    expect(isPremiumConciergeModel("deepseek-v4-pro")).toBe(true);
    expect(isPremiumConciergeModel("kimi-k3")).toBe(true);
    expect(isPremiumConciergeModel("openai-gpt-5.4-mini")).toBe(true);
    expect(isPremiumConciergeModel("anthropic-claude-sonnet-4.6")).toBe(true);
    // Unknown ids normalize to the base model — never premium by accident.
    expect(isPremiumConciergeModel("attacker/model")).toBe(false);
  });
});

describe("clampConciergeModelToCeiling", () => {
  // The regression this exists for: /api/editor/chat takes modelId from the
  // request body, so an editor on an Ultra tenant could bill Pro from the
  // browser regardless of the tenant's configured level. Pro usage spiked
  // after 2026-07-24 with nothing in the config to explain it.
  it("blocks a request above the tenant ceiling", () => {
    expect(clampConciergeModelToCeiling("deepseek-v4-pro", "deepseek-v4-flash"))
      .toBe("deepseek-v4-flash");
    expect(clampConciergeModelToCeiling("anthropic-claude-sonnet-4.6", "deepseek-v4-flash"))
      .toBe("deepseek-v4-flash");
  });

  it("allows moving down from the ceiling", () => {
    expect(clampConciergeModelToCeiling("deepseek-v4-flash", "deepseek-v4-pro"))
      .toBe("deepseek-v4-flash");
  });

  it("allows exactly the ceiling", () => {
    expect(clampConciergeModelToCeiling("deepseek-v4-pro", "deepseek-v4-pro"))
      .toBe("deepseek-v4-pro");
  });

  // An unset tenant_bot_config must not become an open ceiling.
  it("treats an unset or unknown ceiling as the default, not unlimited", () => {
    expect(clampConciergeModelToCeiling("deepseek-v4-pro", null)).toBe(DEFAULT_CONCIERGE_MODEL_ID);
    expect(clampConciergeModelToCeiling("deepseek-v4-pro", "nonsense")).toBe(DEFAULT_CONCIERGE_MODEL_ID);
    expect(clampConciergeModelToCeiling("deepseek-v4-pro", undefined)).toBe(DEFAULT_CONCIERGE_MODEL_ID);
  });

  it("normalizes legacy ids on both sides", () => {
    // deepseek-chat is a legacy alias for flash, so it must not act as a
    // higher ceiling than flash.
    expect(clampConciergeModelToCeiling("deepseek-v4-pro", "deepseek-chat"))
      .toBe("deepseek-v4-flash");
  });

  it("never returns a model outside the registry", () => {
    expect(clampConciergeModelToCeiling("nonsense", "nonsense")).toBe(DEFAULT_CONCIERGE_MODEL_ID);
  });
});
