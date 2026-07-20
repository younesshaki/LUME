import { describe, expect, it } from "vitest";
import {
  CONCIERGE_MODEL_PROFILES,
  DEFAULT_CONCIERGE_MODEL_ID,
  conciergeModelIndex,
  getConciergeModelProfile,
  isConciergeModelId,
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
      }),
    ).toBe(false);
  });
});
