import type { ToolCall, ToolRunStep } from "./runner";

/**
 * Tool call as emitted by DeepSeek/OpenAI chat-completions. `arguments` is a
 * JSON *string* per the spec, not a parsed object.
 */
export type LlmToolCall = {
  id?: string;
  type?: "function";
  function: { name: string; arguments: string };
};

/** `role: "tool"` message appended to the conversation for the model's follow-up. */
export type ToolResultMessage = {
  role: "tool";
  tool_call_id?: string;
  name: string;
  content: string;
};

/**
 * Normalise raw LLM tool calls into the runner's ToolCall shape. Arguments are
 * JSON-parsed; if parsing fails the raw string is passed through unchanged so
 * the tool's object schema rejects it cleanly (surfacing as an `invalid_args`
 * result) rather than throwing here or silently running with empty filters.
 */
export function parseToolCalls(raw: readonly LlmToolCall[] | null | undefined): ToolCall[] {
  if (!raw) return [];
  return raw.map((call) => {
    let args: unknown = {};
    const rawArgs = call.function?.arguments;
    if (rawArgs) {
      try {
        args = JSON.parse(rawArgs);
      } catch {
        args = rawArgs;
      }
    }
    return { name: call.function?.name ?? "", args, id: call.id };
  });
}

/**
 * Render executed steps as `role: "tool"` messages to feed back to the model
 * so it can compose its natural-language reply. `content` is a compact JSON
 * string of the tool result (summary + data + any error).
 */
export function toToolResultMessages(steps: readonly ToolRunStep[]): ToolResultMessage[] {
  return steps.map((step) => ({
    role: "tool",
    tool_call_id: step.call.id,
    name: step.call.name,
    content: JSON.stringify({
      ok: step.result.ok,
      summary: step.result.summary,
      ...(step.result.data !== undefined ? { data: step.result.data } : {}),
      ...(step.result.error ? { error: step.result.error } : {}),
    }),
  }));
}
