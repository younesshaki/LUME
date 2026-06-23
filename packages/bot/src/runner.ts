import type { BotAction } from "@lume/types";
import type { BotToolContext, BotToolResult } from "./types";
import { runBotTool } from "./registry";

/** A single tool invocation as produced by the model. */
export type ToolCall = {
  name: string;
  args: unknown;
  /** Optional id echoed back from the LLM tool_call so results can be paired. */
  id?: string;
};

export type ToolRunStep = {
  call: ToolCall;
  result: BotToolResult;
};

export type BotTurnResult = {
  steps: ToolRunStep[];
  /** All UI actions emitted across the turn, in execution order. */
  actions: BotAction[];
  /** Per-step summaries, in order — handy for feeding back to the model. */
  summaries: string[];
  /** True when every executed step succeeded. */
  ok: boolean;
  /** True when the requested call count exceeded maxSteps and was truncated. */
  truncated: boolean;
};

/** Safety cap so a runaway model can't trigger unbounded tool execution per turn. */
export const DEFAULT_MAX_STEPS = 5;

export type RunToolCallsOptions = {
  maxSteps?: number;
  /** Stop after the first failing step instead of running the rest. */
  stopOnError?: boolean;
};

/**
 * Execute a sequence of tool calls in order within a single bot turn,
 * accumulating results and UI actions. Each call is run through
 * `runBotTool`, so schema/runtime failures become structured results rather
 * than thrown exceptions — the loop never crashes the turn. Caps the number
 * of executed steps at `maxSteps`.
 */
export async function runToolCalls(
  calls: ToolCall[],
  ctx: BotToolContext,
  options: RunToolCallsOptions = {}
): Promise<BotTurnResult> {
  const maxSteps = Math.max(1, options.maxSteps ?? DEFAULT_MAX_STEPS);
  const truncated = calls.length > maxSteps;
  const planned = calls.slice(0, maxSteps);

  const steps: ToolRunStep[] = [];
  const actions: BotAction[] = [];

  for (const call of planned) {
    const result = await runBotTool(call.name, call.args, ctx);
    steps.push({ call, result });
    if (result.actions) actions.push(...result.actions);
    if (!result.ok && options.stopOnError) break;
  }

  return {
    steps,
    actions,
    summaries: steps.map((step) => step.result.summary),
    ok: steps.every((step) => step.result.ok),
    truncated,
  };
}
