/**
 * Parsing/validation of bot actions and DeepSeek stream chunks, extracted
 * from the /api/chat route so the money path is unit-testable.
 *
 * Two action sources exist: inline JSON lines the model emits in prose
 * (legacy contract, parsed here) and structured BotActions from @lume/bot
 * tool runs. Both are validated/filtered before reaching the client.
 */
import type { BotAction } from "@lume/types";

type DeepseekStreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
};

/** Extract the text delta from one `data: {...}` SSE line, if any. */
export function extractDeepseekTextDelta(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") {
    return undefined;
  }

  try {
    const chunk = JSON.parse(trimmed.slice(6)) as DeepseekStreamChunk;
    return chunk.choices?.[0]?.delta?.content;
  } catch {
    return undefined;
  }
}

/** Pull legacy inline JSON action lines out of a complete (non-streamed) reply. */
export function extractInlineActions(content: string): BotAction[] {
  const actions: BotAction[] = [];
  for (const line of content.split(/\r?\n/)) {
    const action = parseBotActionLine(line);
    if (action) actions.push(action);
  }
  return actions;
}

export function parseBotActionLine(line: string): BotAction | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isBotAction(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function isBotAction(value: unknown): value is BotAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "filter_inventory":
      return (
        isOptionalString(value.make) &&
        isOptionalNumber(value.priceMin) &&
        isOptionalNumber(value.priceMax) &&
        isOptionalString(value.bodyStyle)
      );
    case "navigate":
      return typeof value.route === "string";
    case "highlight-vehicle":
      return typeof value.vehicleId === "string";
    case "open-lead-form":
      return value.prefill === undefined || isRecord(value.prefill);
    case "capture_lead":
      return isLeadContact(value.contact) && isOptionalString(value.vehicleId);
    case "scroll-to":
      return typeof value.sectionId === "string";
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || typeof value === "number";
}

function isLeadContact(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptionalString(value.firstName) &&
    isOptionalString(value.lastName) &&
    isOptionalString(value.message) &&
    (typeof value.email === "string" || typeof value.phone === "string") &&
    isOptionalString(value.email) &&
    isOptionalString(value.phone)
  );
}
