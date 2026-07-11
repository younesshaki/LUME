import { describe, expect, it } from "vitest";
import { classifyIntent } from "./intentClassifier";

describe("classifyIntent", () => {
  it.each([
    ["Show me the cheapest car", "price", "min"],
    ["Which one has the lowest price?", "price", "min"],
    ["Je veux la moins chère", "price", "min"],
    ["What is the newest model?", "year", "max"],
    ["Show me the most recent listing", "recency", "max"],
    ["Quel est le véhicule le plus récent ?", "recency", "max"],
    ["Find the best value in stock", "value", "max"],
    ["Quelle est la meilleure affaire ?", "value", "max"],
  ] as const)("classifies %s", (message, metric, direction) => {
    expect(classifyIntent(message)).toMatchObject({
      kind: "superlative",
      metric,
      direction,
    });
  });

  it("normalizes casing, accents, punctuation, and repeated whitespace", () => {
    expect(classifyIntent("  LE   PLUS RÉCENT!!! ")).toEqual({
      kind: "superlative",
      metric: "recency",
      direction: "max",
      matchedPhrase: "le plus recent",
    });
  });

  it("does not match keywords embedded inside unrelated words", () => {
    expect(classifyIntent("Our newestablishment opens soon")).toEqual({ kind: "unknown" });
    expect(classifyIntent("Show me red convertibles")).toEqual({ kind: "unknown" });
  });
});
