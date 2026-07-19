import { describe, expect, it } from "vitest";
import { assembleSystemPrompt } from "./prompt";

describe("vehicle prompt grounding", () => {
  it("states a verified zero instead of omitting inventory context", () => {
    const assembled = assembleSystemPrompt({
      basePrompt: "Be accurate.",
      contextChunks: [],
      matchedVehicles: [],
      totalMatched: 0,
      filters: { make: "Mercedes-Benz" },
    });

    expect(assembled.prompt).toContain(
      "TOTAL MATCHING (make=Mercedes-Benz): 0",
    );
    expect(assembled.prompt).toContain("No matching live vehicles.");
    expect(assembled.sourceCategories).toContain("vehicles");
  });

  it("does not invent a full-catalog total when only a filtered count is known", () => {
    const assembled = assembleSystemPrompt({
      basePrompt: "Be accurate.",
      contextChunks: [],
      matchedVehicles: [],
      totalMatched: 0,
      filters: { make: "Mercedes-Benz" },
    });

    expect(assembled.prompt).not.toContain("Total vehicles in full inventory");
  });
});
