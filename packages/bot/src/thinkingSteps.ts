import type { ToolRunStep } from "./runner";

export const DEFAULT_MAX_THINKING_STEPS = 5;
export const MAX_THINKING_TEXT_LENGTH = 120;
export const MAX_SAFE_THINKING_COUNT = 100_000;

const SUCCESS_TEXT = {
  find_vehicles: "I checked the live inventory for matching vehicles.",
  find_best_deal: "I ranked the strongest value matches in the live inventory.",
  get_vehicle_details: "I checked the selected vehicle's current details.",
  compare_vehicles: "I compared the selected vehicles side by side.",
  find_cheapest: "I checked the live inventory for its lowest-priced vehicle.",
  find_newest: "I checked the live inventory for its newest model year.",
  find_most_recent: "I checked which vehicle was listed most recently.",
} as const;

export type ThinkingToolName = keyof typeof SUCCESS_TEXT;

const FAILED_TEXT = "I couldn't complete one of the requested inventory checks.";
const UNKNOWN_TEXT = "I couldn't verify one of the requested inventory checks.";

/**
 * Render a fixed operational status for one completed tool step. This is
 * activity metadata, never model reasoning: raw calls, summaries, results,
 * errors, identifiers, prompts, and tenant configuration are not copied.
 */
export function toolThinkingText(step: ToolRunStep): string {
  if (!isThinkingToolName(step.call.name)) return UNKNOWN_TEXT;
  if (!step.result.ok) return FAILED_TEXT;

  if (step.call.name === "find_vehicles") {
    const count = safeTotalCount(step.result.data);
    if (count !== null) {
      return boundText(
        `I checked ${count.toLocaleString("en-US")} matching ` +
          `vehicle${count === 1 ? "" : "s"} in the live inventory.`,
      );
    }
  }

  return SUCCESS_TEXT[step.call.name];
}

/** Preserve one bounded public status per executed call, in execution order. */
export function turnThinkingSteps(
  steps: readonly ToolRunStep[],
  max = DEFAULT_MAX_THINKING_STEPS,
): string[] {
  const limit = normalizeLimit(max);
  if (limit === 0) return [];

  const output: string[] = [];
  for (const step of steps) {
    const status = boundText(toolThinkingText(step));
    output.push(status);
    if (output.length >= limit) break;
  }
  return output;
}

function safeTotalCount(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const count = value.totalCount;
  return typeof count === "number" &&
    Number.isSafeInteger(count) &&
    count >= 0 &&
    count <= MAX_SAFE_THINKING_COUNT
    ? count
    : null;
}

function normalizeLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_THINKING_STEPS;
  return Math.min(DEFAULT_MAX_THINKING_STEPS, Math.max(0, Math.floor(value)));
}

function boundText(value: string): string {
  return value.slice(0, MAX_THINKING_TEXT_LENGTH);
}

function isThinkingToolName(value: string): value is ThinkingToolName {
  return Object.prototype.hasOwnProperty.call(SUCCESS_TEXT, value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
