/**
 * Parsing/validation of bot actions and DeepSeek stream chunks, extracted
 * from the /api/chat route so the money path is unit-testable.
 *
 * Two action sources exist: inline JSON lines the model emits in prose
 * (legacy contract, parsed here) and structured BotActions from @lume/bot
 * tool runs. Both are validated/filtered before reaching the client.
 */
import type { BotAction } from "@lume/types";

export type BotActionEnvelope = { action: BotAction };

export type BotActionEnvelopeValidation =
  | { ok: true; value: BotActionEnvelope }
  | { ok: false; error: string };

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
    actions.push(...extractActionSegments(line).actions);
  }
  return actions;
}

/**
 * Remove valid inline action lines from complete model output. Arbitrary JSON
 * and malformed action candidates remain visible rather than being silently
 * deleted.
 */
export function stripInlineActions(content: string): string {
  return content
    .split(/\r?\n/)
    .flatMap((line) => {
      const extracted = extractActionSegments(line);
      return extracted.actions.length > 0 && !extracted.visibleText
        ? []
        : [extracted.visibleText];
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type InlineActionFilterResult = {
  visibleText: string;
  actions: BotAction[];
};

/**
 * Streaming counterpart to stripInlineActions. Normal prose passes through as
 * soon as it is known not to be an action; a `{`-prefixed line is held only
 * until newline/finalization so action JSON split across arbitrary model
 * chunks cannot flash in the UI or enter memory.
 */
export class InlineActionStreamFilter {
  private lineBuffer = "";

  push(delta: string): InlineActionFilterResult {
    this.lineBuffer += delta;
    let visibleText = "";
    const actions: BotAction[] = [];

    while (true) {
      const newlineIndex = this.lineBuffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const lineWithCarriage = this.lineBuffer.slice(0, newlineIndex);
      const line = lineWithCarriage.endsWith("\r")
        ? lineWithCarriage.slice(0, -1)
        : lineWithCarriage;
      this.lineBuffer = this.lineBuffer.slice(newlineIndex + 1);
      const extracted = extractActionSegments(line);
      actions.push(...extracted.actions);
      if (extracted.visibleText || extracted.actions.length === 0) {
        visibleText += `${extracted.visibleText}\n`;
      }
    }

    // Stream the prose prefix without waiting for the model to finish the
    // line. Hold from the first `{` onward so an action remains suppressible
    // even when a provider puts it after prose rather than on a clean line.
    const firstNonWhitespace = this.lineBuffer.search(/\S/);
    if (firstNonWhitespace >= 0) {
      const candidateIndex = this.lineBuffer.indexOf("{", firstNonWhitespace);
      if (candidateIndex >= 0) {
        if (candidateIndex > 0) {
          visibleText += this.lineBuffer.slice(0, candidateIndex);
          this.lineBuffer = this.lineBuffer.slice(candidateIndex);
        }
      } else {
        visibleText += this.lineBuffer;
        this.lineBuffer = "";
      }
    }

    return { visibleText, actions };
  }

  flush(): InlineActionFilterResult {
    const buffered = this.lineBuffer;
    this.lineBuffer = "";
    if (!buffered) return { visibleText: "", actions: [] };
    return extractActionSegments(buffered);
  }
}

/**
 * Find complete JSON objects in a model-authored line and remove only objects
 * that validate as BotActions. This covers action JSON after prose or inside a
 * markdown fence without deleting ordinary JSON examples.
 */
function extractActionSegments(line: string): InlineActionFilterResult {
  const actions: BotAction[] = [];
  let visibleText = "";
  let visibleCursor = 0;
  let searchCursor = 0;

  while (searchCursor < line.length) {
    const start = line.indexOf("{", searchCursor);
    if (start < 0) break;
    const end = completeJsonObjectEnd(line, start);
    if (end < 0) break;
    const action = parseBotActionLine(line.slice(start, end));
    if (action) {
      visibleText += line.slice(visibleCursor, start);
      actions.push(action);
      visibleCursor = end;
    }
    searchCursor = end;
  }

  visibleText += line.slice(visibleCursor);
  if (actions.length > 0 && !visibleText.trim()) {
    visibleText = "";
  }
  return { visibleText, actions };
}

function completeJsonObjectEnd(value: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character !== "}") continue;
    depth -= 1;
    if (depth === 0) return index + 1;
    if (depth < 0) return -1;
  }
  return -1;
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

/** Validate the public /api/bot-actions request envelope. */
export function validateBotActionEnvelope(value: unknown): BotActionEnvelopeValidation {
  if (!isRecord(value)) {
    return { ok: false, error: "Request body must be an object." };
  }
  if (!isBotAction(value.action)) {
    return { ok: false, error: "Action is missing or invalid." };
  }
  return { ok: true, value: { action: value.action } };
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
    case "navigate-target":
      return (
        typeof value.targetKey === "string" &&
        (value.params === undefined || isStringRecord(value.params))
      );
    case "highlight-vehicle":
      return typeof value.vehicleId === "string";
    case "open-lead-form":
      return (
        (value.prefill === undefined || isRecord(value.prefill)) &&
        isOptionalString(value.vehicleId)
      );
    case "capture_lead":
      return isLeadContact(value.contact) && isOptionalString(value.vehicleId);
    case "scroll-to":
      return typeof value.sectionId === "string";
    default:
      return false;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.keys(value).length <= 8 &&
    Object.values(value).every((item) => typeof item === "string")
  );
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
