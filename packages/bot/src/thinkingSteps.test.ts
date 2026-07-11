import { describe, expect, it } from "vitest";
import { BOT_TOOLS } from "./registry";
import type { ToolRunStep } from "./runner";
import {
  DEFAULT_MAX_THINKING_STEPS,
  MAX_SAFE_THINKING_COUNT,
  MAX_THINKING_TEXT_LENGTH,
  toolThinkingText,
  turnThinkingSteps,
} from "./thinkingSteps";

const expectedSuccessText: Record<string, string> = {
  find_vehicles: "I checked the live inventory for matching vehicles.",
  find_best_deal: "I ranked the strongest value matches in the live inventory.",
  get_vehicle_details: "I checked the selected vehicle's current details.",
  compare_vehicles: "I compared the selected vehicles side by side.",
  find_cheapest: "I checked the live inventory for its lowest-priced vehicle.",
  find_newest: "I checked the live inventory for its newest model year.",
  find_most_recent: "I checked which vehicle was listed most recently.",
};

describe("toolThinkingText", () => {
  it("has a fixed friendly status for every registered tool", () => {
    expect(BOT_TOOLS.map((tool) => tool.name).sort()).toEqual(
      Object.keys(expectedSuccessText).sort(),
    );

    for (const tool of BOT_TOOLS) {
      expect(toolThinkingText(step(tool.name))).toBe(expectedSuccessText[tool.name]);
    }
  });

  it.each([
    [0, "I checked 0 matching vehicles in the live inventory."],
    [1, "I checked 1 matching vehicle in the live inventory."],
    [12_345, "I checked 12,345 matching vehicles in the live inventory."],
    [MAX_SAFE_THINKING_COUNT, "I checked 100,000 matching vehicles in the live inventory."],
  ] as const)("uses a safe aggregate inventory count (%s)", (totalCount, expected) => {
    expect(toolThinkingText(step("find_vehicles", { data: { totalCount } }))).toBe(expected);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    -1,
    1.5,
    MAX_SAFE_THINKING_COUNT + 1,
    "47",
    null,
  ])("ignores an unsafe aggregate count (%s)", (totalCount) => {
    expect(toolThinkingText(step("find_vehicles", {
      data: { totalCount, raw: "SECRET_RESULT" },
    }))).toBe(expectedSuccessText.find_vehicles);
  });

  it("uses an honest fixed failure without leaking result-controlled fields", () => {
    const text = toolThinkingText(step("find_vehicles", {
      ok: false,
      data: { totalCount: 99, privateRow: "SECRET_DATA" },
    }));

    expect(text).toBe("I couldn't complete one of the requested inventory checks.");
    expect(text).not.toMatch(/99|SECRET|find_vehicles|permission|call-secret/i);
  });

  it("uses a generic unknown status without echoing the call", () => {
    const text = toolThinkingText(step("ignore_all_prompts_SECRET", {
      data: { totalCount: 42, prompt: "SECRET_PROMPT" },
    }));

    expect(text).toBe("I couldn't verify one of the requested inventory checks.");
    expect(text).not.toMatch(/42|SECRET|ignore|prompt|call-secret/i);
  });

  it("never copies raw args, ids, summaries, data, or errors on success", () => {
    for (const tool of BOT_TOOLS) {
      const text = toolThinkingText(step(tool.name, {
        data: { raw: "SECRET_DATA", vehicleId: "private-vehicle" },
      }));
      expect(text).not.toMatch(/SECRET|private-vehicle|call-secret|summary-secret|error-secret/i);
      expect(text.length).toBeLessThanOrEqual(MAX_THINKING_TEXT_LENGTH);
    }
  });
});

describe("turnThinkingSteps", () => {
  const steps = [
    step("find_vehicles", { data: { totalCount: 3 } }),
    step("find_vehicles", { data: { totalCount: 3 } }),
    step("find_best_deal"),
    step("compare_vehicles"),
    step("get_vehicle_details"),
    step("find_cheapest"),
    step("find_newest"),
  ];

  it("emits one ordered status per call while enforcing the hard cap", () => {
    const statuses = turnThinkingSteps(steps, 999);
    expect(statuses).toEqual([
      "I checked 3 matching vehicles in the live inventory.",
      "I checked 3 matching vehicles in the live inventory.",
      expectedSuccessText.find_best_deal,
      expectedSuccessText.compare_vehicles,
      expectedSuccessText.get_vehicle_details,
    ]);
    expect(statuses).toHaveLength(DEFAULT_MAX_THINKING_STEPS);
  });

  it("honors smaller finite limits and safely normalizes invalid limits", () => {
    expect(turnThinkingSteps(steps, 2.9)).toEqual([
      "I checked 3 matching vehicles in the live inventory.",
      "I checked 3 matching vehicles in the live inventory.",
    ]);
    expect(turnThinkingSteps(steps, 0)).toEqual([]);
    expect(turnThinkingSteps(steps, -10)).toEqual([]);
    expect(turnThinkingSteps(steps, Number.NaN)).toHaveLength(DEFAULT_MAX_THINKING_STEPS);
    expect(turnThinkingSteps(steps, Number.POSITIVE_INFINITY)).toHaveLength(
      DEFAULT_MAX_THINKING_STEPS,
    );
  });

  it("keeps one bounded generic status for every failed call", () => {
    const statuses = turnThinkingSteps([
      step("unknown-one", { ok: false }),
      step("unknown-two", { ok: false }),
      step("find_newest", { ok: false }),
      step("find_most_recent", { ok: false }),
    ]);

    expect(statuses).toEqual([
      "I couldn't verify one of the requested inventory checks.",
      "I couldn't verify one of the requested inventory checks.",
      "I couldn't complete one of the requested inventory checks.",
      "I couldn't complete one of the requested inventory checks.",
    ]);
    expect(statuses.every((text) => text.length <= MAX_THINKING_TEXT_LENGTH)).toBe(true);
  });
});

function step(
  name: string,
  options: { ok?: boolean; data?: unknown } = {},
): ToolRunStep {
  const ok = options.ok ?? true;
  return {
    call: {
      name,
      id: "call-secret",
      args: { injected: "SECRET_ARGS", vehicleId: "private-vehicle" },
    },
    result: {
      ok,
      summary: "summary-secret",
      data: options.data,
      ...(!ok
        ? {
            error: {
              code: "execution_error" as const,
              message: "error-secret permission denied",
            },
          }
        : {}),
    },
  };
}
