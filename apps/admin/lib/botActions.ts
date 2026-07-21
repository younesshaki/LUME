/**
 * Parsing/validation of bot actions and DeepSeek stream chunks, extracted
 * from the /api/chat route so the money path is unit-testable.
 *
 * Two action sources exist: inline JSON lines the model emits in prose
 * (legacy contract, parsed here) and structured BotActions from @lume/bot
 * tool runs. Both are validated/filtered before reaching the client.
 */
import type { LlmToolCall } from "@lume/bot";
import type { BotAction } from "@lume/types";

const DSML_TOKEN_SOURCE = String.raw`[|｜]{1,2}DSML[|｜]{1,2}`;
const MAX_RECOVERED_TOOL_CALLS = 5;
const MAX_DSML_PARAMETERS = 8;
const MAX_DSML_BLOCK_LENGTH = 16_000;
const MAX_DSML_PARAMETER_LENGTH = 4_000;
const DSML_PREFIXES = [
  "<｜｜DSML｜｜",
  "</｜｜DSML｜｜",
  "<||DSML||",
  "</||DSML||",
  "<｜DSML｜",
  "</｜DSML｜",
  "<|DSML|",
  "</|DSML|",
] as const;

export type BotActionEnvelope = { action: BotAction };

export type BotActionEnvelopeValidation =
  | { ok: true; value: BotActionEnvelope }
  | { ok: false; error: string };

type ChatCompletionStreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
};

export type NormalizedDeepseekAssistantMessage = {
  content: string;
  toolCalls: LlmToolCall[];
  recoveredDsmlToolCallCount: number;
  discardedDsml: boolean;
};

/** Extract the text delta from one `data: {...}` SSE line, if any. */
export function extractChatCompletionTextDelta(line: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") {
    return undefined;
  }

  try {
    const chunk = JSON.parse(trimmed.slice(6)) as ChatCompletionStreamChunk;
    return chunk.choices?.[0]?.delta?.content;
  } catch {
    return undefined;
  }
}

/** @deprecated Use the provider-neutral OpenAI-compatible parser. */
export const extractDeepseekTextDelta = extractChatCompletionTextDelta;

/**
 * DeepSeek occasionally serializes its private DSML tool protocol into
 * `message.content` instead of returning OpenAI-compatible `tool_calls`.
 * Recover only tools already exposed to this tenant and always remove the
 * provider control syntax from visitor-visible text and conversation memory.
 */
export function normalizeDeepseekAssistantMessage(
  message: {
    content?: string | null;
    tool_calls?: readonly LlmToolCall[] | null;
  },
  allowedToolNames: readonly string[],
): NormalizedDeepseekAssistantMessage {
  const rawContent = message.content ?? "";
  const structured = message.tool_calls?.length ? [...message.tool_calls] : [];
  const recovered =
    structured.length === 0
      ? extractDeepseekDsmlToolCalls(rawContent, allowedToolNames)
      : [];
  return {
    content: stripDeepseekDsml(rawContent),
    toolCalls: structured.length > 0 ? structured : recovered,
    recoveredDsmlToolCallCount: recovered.length,
    discardedDsml: containsDsmlMarker(rawContent),
  };
}

/** Recover strictly bounded, allowlisted function calls from complete DSML. */
export function extractDeepseekDsmlToolCalls(
  content: string,
  allowedToolNames: readonly string[],
): LlmToolCall[] {
  const allowed = new Set(allowedToolNames);
  if (allowed.size === 0 || !containsDsmlMarker(content)) return [];

  const calls: LlmToolCall[] = [];
  const invokePattern = new RegExp(
    `<${DSML_TOKEN_SOURCE}invoke\\b([^>]*)>([\\s\\S]*?)<\\/${DSML_TOKEN_SOURCE}invoke\\s*>`,
    "gi",
  );

  for (const invoke of content.matchAll(invokePattern)) {
    if (calls.length >= MAX_RECOVERED_TOOL_CALLS) break;
    const block = invoke[0] ?? "";
    if (!block || block.length > MAX_DSML_BLOCK_LENGTH) continue;
    const toolName = readDsmlAttribute(invoke[1] ?? "", "name");
    if (
      !toolName ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(toolName) ||
      !allowed.has(toolName)
    ) {
      continue;
    }

    const args: Record<string, unknown> = {};
    const seenNames = new Set<string>();
    let valid = true;
    let parameterCount = 0;
    const parameterPattern = new RegExp(
      `<${DSML_TOKEN_SOURCE}parameter\\b([^>]*)>([\\s\\S]*?)<\\/${DSML_TOKEN_SOURCE}parameter\\s*>`,
      "gi",
    );
    for (const parameter of (invoke[2] ?? "").matchAll(parameterPattern)) {
      parameterCount += 1;
      const attributes = parameter[1] ?? "";
      const name = readDsmlAttribute(attributes, "name");
      const rawValue = parameter[2] ?? "";
      if (
        parameterCount > MAX_DSML_PARAMETERS ||
        !name ||
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name) ||
        seenNames.has(name) ||
        rawValue.length > MAX_DSML_PARAMETER_LENGTH
      ) {
        valid = false;
        break;
      }
      seenNames.add(name);
      const stringAttribute = readDsmlAttribute(attributes, "string");
      args[name] =
        stringAttribute === "true"
          ? decodeDsmlText(rawValue).trim()
          : parseDsmlJsonValue(rawValue);
    }
    if (!valid) continue;

    calls.push({
      id: `recovered_dsml_${calls.length + 1}`,
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    });
  }
  return calls;
}

/**
 * Remove complete DSML blocks. If a provider emits a malformed or truncated
 * block, fail closed by dropping everything from its first control marker.
 */
export function stripDeepseekDsml(content: string): string {
  let cursor = 0;
  let visible = "";

  while (cursor < content.length) {
    const markerIndex = findDsmlMarkerIndex(content, cursor);
    if (markerIndex < 0) {
      const partialIndex = trailingDsmlPrefixIndex(content.slice(cursor));
      if (partialIndex >= 0) {
        visible += content.slice(cursor, cursor + partialIndex);
      } else {
        visible += content.slice(cursor);
      }
      break;
    }
    visible += content.slice(cursor, markerIndex);
    const segmentEnd = completeDsmlSegmentEnd(content, markerIndex);
    if (segmentEnd < 0) break;
    cursor = segmentEnd;
  }
  return visible;
}

/** Pull legacy inline JSON action lines out of a complete (non-streamed) reply. */
export function extractInlineActions(content: string): BotAction[] {
  const actions: BotAction[] = [];
  for (const line of stripDeepseekDsml(content).split(/\r?\n/)) {
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
  let inJsonFence = false;
  const visibleLines: string[] = [];
  for (const line of stripDeepseekDsml(content).split(/\r?\n/)) {
    if (isJsonFenceOpening(line)) {
      inJsonFence = true;
      continue;
    }
    if (inJsonFence && isMarkdownFenceClosing(line)) {
      inJsonFence = false;
      continue;
    }
    const extracted = extractActionSegments(line);
    if (extracted.actions.length > 0 && !extracted.visibleText) continue;
    visibleLines.push(extracted.visibleText);
  }
  return visibleLines
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
  private providerBuffer = "";
  private lineBuffer = "";
  private inJsonFence = false;

  push(delta: string): InlineActionFilterResult {
    return this.pushInline(this.consumeProviderText(delta, false));
  }

  flush(): InlineActionFilterResult {
    const fromProvider = this.pushInline(this.consumeProviderText("", true));
    const buffered = this.lineBuffer;
    this.lineBuffer = "";
    if (!buffered) return fromProvider;
    if (isJsonFenceOpening(buffered)) {
      this.inJsonFence = true;
      return fromProvider;
    }
    if (this.inJsonFence && isMarkdownFenceClosing(buffered)) {
      this.inJsonFence = false;
      return fromProvider;
    }
    const final = extractActionSegments(buffered);
    return {
      visibleText: fromProvider.visibleText + final.visibleText,
      actions: [...fromProvider.actions, ...final.actions],
    };
  }

  /**
   * Withhold possible DSML prefixes across arbitrary stream chunks, discard
   * complete blocks, and fail closed on a truncated block at finalization.
   */
  private consumeProviderText(delta: string, final: boolean): string {
    this.providerBuffer += delta;
    let visible = "";

    while (this.providerBuffer) {
      const markerIndex = findDsmlMarkerIndex(this.providerBuffer);
      if (markerIndex >= 0) {
        visible += this.providerBuffer.slice(0, markerIndex);
        this.providerBuffer = this.providerBuffer.slice(markerIndex);
        const segmentEnd = completeDsmlSegmentEnd(this.providerBuffer, 0);
        if (segmentEnd < 0) {
          if (final) this.providerBuffer = "";
          break;
        }
        this.providerBuffer = this.providerBuffer.slice(segmentEnd);
        continue;
      }

      const partialIndex = trailingDsmlPrefixIndex(this.providerBuffer, 1);
      if (partialIndex >= 0) {
        visible += this.providerBuffer.slice(0, partialIndex);
        this.providerBuffer = this.providerBuffer.slice(partialIndex);
        if (final) this.providerBuffer = "";
        break;
      }

      visible += this.providerBuffer;
      this.providerBuffer = "";
    }
    return visible;
  }

  private pushInline(delta: string): InlineActionFilterResult {
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
      if (isJsonFenceOpening(line)) {
        this.inJsonFence = true;
        continue;
      }
      if (this.inJsonFence && isMarkdownFenceClosing(line)) {
        this.inJsonFence = false;
        continue;
      }
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
      if (isPossibleJsonFenceLinePrefix(this.lineBuffer, this.inJsonFence)) {
        return { visibleText, actions };
      }
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

function isJsonFenceOpening(value: string): boolean {
  return /^\s*```\s*json\s*$/i.test(value);
}

function isMarkdownFenceClosing(value: string): boolean {
  return /^\s*```\s*$/.test(value);
}

function isPossibleJsonFenceLinePrefix(
  value: string,
  inJsonFence: boolean,
): boolean {
  const normalized = value.trimStart().toLowerCase();
  if (!normalized || !normalized.startsWith("`")) return false;
  if ("```json".startsWith(normalized)) return true;
  return inJsonFence && "```".startsWith(normalized);
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

function containsDsmlMarker(value: string): boolean {
  return findDsmlMarkerIndex(value) >= 0 || trailingDsmlPrefixIndex(value) >= 0;
}

function findDsmlMarkerIndex(value: string, fromIndex = 0): number {
  const pattern = new RegExp(`<\\/?${DSML_TOKEN_SOURCE}`, "i");
  const match = pattern.exec(value.slice(fromIndex));
  return match?.index === undefined ? -1 : fromIndex + match.index;
}

function trailingDsmlPrefixIndex(value: string, minimumLength = 2): number {
  const start = Math.max(0, value.length - Math.max(...DSML_PREFIXES.map((item) => item.length)));
  for (let index = start; index < value.length; index += 1) {
    const suffix = value.slice(index);
    if (
      suffix.length >= minimumLength &&
      DSML_PREFIXES.some((prefix) => prefix.startsWith(suffix))
    ) {
      return index;
    }
  }
  return -1;
}

function completeDsmlSegmentEnd(value: string, start: number): number {
  const tagEnd = value.indexOf(">", start);
  if (tagEnd < 0 || tagEnd - start > 500) return -1;
  const tag = value.slice(start, tagEnd + 1);
  const tagPattern = new RegExp(
    `^<(/?)${DSML_TOKEN_SOURCE}(tool_calls|invoke|parameter)\\b`,
    "i",
  );
  const parsed = tagPattern.exec(tag);
  if (!parsed) {
    const newlineEnd = value.indexOf("\n", tagEnd + 1);
    return newlineEnd < 0 ? tagEnd + 1 : newlineEnd + 1;
  }
  if (parsed[1] === "/") return tagEnd + 1;

  const tagName = parsed[2];
  const closingPattern = new RegExp(
    `<\\/${DSML_TOKEN_SOURCE}${tagName}\\s*>`,
    "i",
  );
  const closing = closingPattern.exec(value.slice(tagEnd + 1));
  return closing?.index === undefined
    ? -1
    : tagEnd + 1 + closing.index + closing[0].length;
}

function readDsmlAttribute(attributes: string, name: string): string | null {
  const pattern = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const match = pattern.exec(attributes);
  return match ? decodeDsmlText(match[1] ?? match[2] ?? "") : null;
}

function decodeDsmlText(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseDsmlJsonValue(value: string): unknown {
  const decoded = decodeDsmlText(value).trim();
  if (!decoded) return "";
  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    return decoded;
  }
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
        isOptionalString(value.model) &&
        isOptionalString(value.stockType) &&
        isOptionalNumber(value.priceMin) &&
        isOptionalNumber(value.priceMax) &&
        isOptionalString(value.bodyStyle) &&
        isOptionalString(value.fuelType) &&
        isOptionalString(value.drivetrain) &&
        isOptionalString(value.sellerState) &&
        isOptionalString(value.sellerCity) &&
        isOptionalNumber(value.yearMin) &&
        isOptionalNumber(value.yearMax) &&
        isOptionalNumber(value.mileageMax) &&
        isOptionalVehicleSort(value.sort)
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
    case "compare_vehicles":
      return isVehicleIdList(value.vehicleIds);
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

function isOptionalVehicleSort(value: unknown): boolean {
  return value === undefined || [
    "recommended",
    "created_desc",
    "price_asc",
    "price_desc",
    "year_desc",
    "year_asc",
    "mileage_asc",
    "mileage_desc",
  ].includes(String(value));
}

function isVehicleIdList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 3 &&
    value.every((id) => typeof id === "string" && id.trim().length > 0) &&
    new Set(value).size === value.length
  );
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
