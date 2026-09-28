/**
 * Provider-neutral accumulator for OpenAI-compatible streamed tool calls.
 *
 * A tool call arrives as several `delta.tool_calls[index]` fragments. Keeping
 * this parser out of the route lets the latency path be tested against the
 * actual wire shape without coupling it to a particular concierge provider.
 */
import type { LlmToolCall } from "@lume/bot";

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
};

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: ToolCallDelta[];
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type PhaseOneStreamUpdate = {
  contentDelta?: string;
  completed: boolean;
};

export type PhaseOneStreamMessage = {
  content: string;
  reasoningContent: string | null;
  toolCalls: LlmToolCall[];
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
};

/**
 * Accumulate complete SSE lines. The caller remains responsible for buffering
 * arbitrary byte chunks into lines; that is where the fetch reader belongs.
 */
export class PhaseOneStreamAccumulator {
  private content = "";
  private reasoningContent = "";
  private sawReasoning = false;
  private readonly toolCalls = new Map<number, LlmToolCall>();
  private usage: PhaseOneStreamMessage["usage"] = null;

  pushSseLine(line: string): PhaseOneStreamUpdate {
    const trimmed = line.trim();
    if (trimmed === "data: [DONE]") return { completed: true };
    if (!trimmed.startsWith("data: ")) return { completed: false };

    let parsed: StreamChunk;
    try {
      parsed = JSON.parse(trimmed.slice(6)) as StreamChunk;
    } catch {
      return { completed: false };
    }
    if (parsed.usage) {
      this.usage = {
        inputTokens: finiteIntegerOrNull(parsed.usage.prompt_tokens),
        outputTokens: finiteIntegerOrNull(parsed.usage.completion_tokens),
      };
    }

    const delta = parsed.choices?.[0]?.delta;
    const contentDelta = typeof delta?.content === "string" ? delta.content : undefined;
    if (contentDelta) this.content += contentDelta;
    if (typeof delta?.reasoning_content === "string") {
      this.reasoningContent += delta.reasoning_content;
      this.sawReasoning = true;
    }
    for (const [position, fragment] of (delta?.tool_calls ?? []).entries()) {
      this.mergeToolCall(fragment.index ?? position, fragment);
    }
    return { ...(contentDelta ? { contentDelta } : {}), completed: false };
  }

  message(): PhaseOneStreamMessage {
    return {
      content: this.content,
      reasoningContent: this.sawReasoning ? this.reasoningContent : null,
      toolCalls: [...this.toolCalls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, call]) => ({
          ...(call.id ? { id: call.id } : {}),
          ...(call.type ? { type: call.type } : {}),
          function: { ...call.function },
        })),
      usage: this.usage,
    };
  }

  private mergeToolCall(index: number, fragment: ToolCallDelta): void {
    if (!Number.isSafeInteger(index) || index < 0 || index > 32) return;
    const existing = this.toolCalls.get(index) ?? {
      function: { name: "", arguments: "" },
    };
    if (fragment.id) existing.id = mergeFragment(existing.id ?? "", fragment.id);
    if (fragment.type) existing.type = fragment.type;
    if (fragment.function?.name) {
      existing.function.name = mergeFragment(existing.function.name, fragment.function.name);
    }
    if (fragment.function?.arguments) {
      existing.function.arguments += fragment.function.arguments;
    }
    this.toolCalls.set(index, existing);
  }
}

function mergeFragment(current: string, next: string): string {
  if (!current) return next;
  if (current === next || current.endsWith(next)) return current;
  return current + next;
}

function finiteIntegerOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}
