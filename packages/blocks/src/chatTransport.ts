/**
 * Framework-agnostic concierge chat transport.
 *
 * Ported verbatim (behaviour-preserving) from the Vite app's
 * `src/lib/deepseekService.ts` so the Vite public site and the Next `apps/web`
 * app stream a chat turn through the exact same wire contract. The only
 * difference from the original is that environment-specific inputs — the
 * tenant slug, the current page path and the two in-app-history booleans — are
 * passed in via {@link ChatStreamConfig} instead of being read from
 * `window`/`publicTenantSlug`/`inAppHistory`. Each host supplies its own.
 *
 * The browser never sees the system prompt, the RAG chunks, or the model key:
 * it POSTs user/assistant turns to the tenant-scoped `/api/chat` route and
 * consumes Server-Sent Events.
 */
import {
  validateConciergeTargetDestination,
  type BotAction,
  type ChatStreamThinking,
  type ConciergeTargetKind,
} from "@lume/types";
export type { BotAction } from "@lume/types";

const DEFAULT_CHAT_ENDPOINT = "/api/chat";

export type ChatTransportMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** Two booleans derived from same-origin in-app history, never a path: the
 * server only uses them to word a "go back" reply truthfully. */
export type ChatNavigationSummary = {
  hasPrevious: boolean;
  hasResults: boolean;
};

export type ChatStreamConfig = {
  /** Tenant whose RAG/vehicles should be used. */
  tenantSlug: string;
  /** Defaults to `/api/chat` (same-origin; proxied to the admin app). */
  endpoint?: string;
  /** `window.location.pathname` (host supplies it); truncated to 300 chars. */
  pagePath?: string;
  /** In-app-history summary; omitted means neither previous nor results. */
  navigation?: ChatNavigationSummary;
};

type ChatMetaEvent = {
  type: "meta";
  sourceCategories: string[];
  botName?: string;
  sessionId?: string;
  requestId?: string;
  capabilities?: { actions?: boolean };
};
type ChatActionEvent = { type: "action"; action: BotAction };
/** Another delivery of this exact turn is already being answered. */
type ChatDuplicateEvent = { type: "duplicate" };
type ChatErrorEvent = { type: "error"; message: string };

export type ChatStreamYield =
  | {
      kind: "meta";
      sourceCategories: string[];
      botName?: string;
      sessionId?: string;
      requestId?: string;
      capabilities?: { actions: boolean };
    }
  | { kind: "delta"; text: string }
  | { kind: "action"; action: BotAction }
  | { kind: "thinking"; text: string }
  | { kind: "duplicate" }
  | { kind: "timing"; timing: Record<string, unknown> };

/** Transport milestones the caller may time. Never affects the stream. */
export type ChatStreamObserver = {
  onRequestSent?: () => void;
  onResponseHeaders?: () => void;
};

export type ChatStreamOptions = {
  signal?: AbortSignal;
  sessionId?: string;
  startNewSession?: boolean;
  /** Opaque turn id generated once per turn and reused verbatim on retry; the
   * server treats a repeat as a duplicate delivery, not a second turn. */
  requestId?: string;
  observer?: ChatStreamObserver;
};

type DeepseekStreamChunk = {
  choices?: Array<{
    delta?: { content?: string };
    finish_reason?: string | null;
  }>;
  error?: string;
};

/**
 * Stream a chat turn from the configured endpoint. Yields `meta` first, then a
 * sequence of text deltas and optional action/thinking/timing events. Drops any
 * system messages — the server supplies the system prompt.
 */
export async function* streamChat(
  config: ChatStreamConfig,
  messages: ChatTransportMessage[],
  options: ChatStreamOptions = {},
): AsyncGenerator<ChatStreamYield, void, unknown> {
  const { signal, sessionId, startNewSession = false, requestId, observer } =
    options;
  const endpoint = config.endpoint ?? DEFAULT_CHAT_ENDPOINT;

  const sanitized = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  notify(observer?.onRequestSent);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": config.tenantSlug,
    },
    body: JSON.stringify({
      messages: sanitized,
      stream: true,
      ...(config.pagePath
        ? { pagePath: config.pagePath.slice(0, 300) }
        : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(startNewSession ? { startNewSession: true } : {}),
      ...(requestId ? { requestId } : {}),
      navigation: config.navigation ?? { hasPrevious: false, hasResults: false },
    }),
    credentials: "include",
    signal,
  });
  notify(observer?.onResponseHeaders);

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Chat API ${response.status}: ${body || response.statusText}`,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Chat API response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "data: [DONE]") return;
        if (!trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        let parsed: unknown;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          continue;
        }

        if (isMetaEvent(parsed)) {
          yield {
            kind: "meta",
            sourceCategories: parsed.sourceCategories,
            ...(typeof parsed.botName === "string" && parsed.botName.trim()
              ? { botName: parsed.botName.trim() }
              : {}),
            ...(typeof parsed.sessionId === "string" && parsed.sessionId.trim()
              ? { sessionId: parsed.sessionId.trim() }
              : {}),
            ...(typeof parsed.requestId === "string" && parsed.requestId.trim()
              ? { requestId: parsed.requestId.trim() }
              : {}),
            ...(isRecord(parsed.capabilities) &&
            typeof parsed.capabilities.actions === "boolean"
              ? { capabilities: { actions: parsed.capabilities.actions } }
              : {}),
          };
          continue;
        }
        if (isDuplicateEvent(parsed)) {
          yield { kind: "duplicate" };
          return;
        }
        if (isActionEvent(parsed)) {
          yield { kind: "action", action: parsed.action };
          continue;
        }
        if (isThinkingEvent(parsed)) {
          yield {
            kind: "thinking",
            text: Array.from(parsed.text.trim()).slice(0, 120).join(""),
          };
          continue;
        }
        if (isTimingEvent(parsed)) {
          yield { kind: "timing", timing: parsed.timing };
          continue;
        }
        if (isErrorEvent(parsed)) {
          throw new Error(parsed.message);
        }

        const chunk = parsed as DeepseekStreamChunk;
        if (chunk.error) throw new Error(`Chat error: ${chunk.error}`);
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) yield { kind: "delta", text: content };
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function notify(callback: (() => void) | undefined): void {
  try {
    callback?.();
  } catch {
    // Timing observers are best-effort and never affect the stream.
  }
}

function isTimingEvent(
  v: unknown,
): v is { type: "timing"; timing: Record<string, unknown> } {
  return isRecord(v) && v.type === "timing" && isRecord(v.timing);
}

function isMetaEvent(v: unknown): v is ChatMetaEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: string }).type === "meta" &&
    Array.isArray((v as ChatMetaEvent).sourceCategories)
  );
}

function isDuplicateEvent(v: unknown): v is ChatDuplicateEvent {
  return isRecord(v) && v.type === "duplicate";
}

function isErrorEvent(v: unknown): v is ChatErrorEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: string }).type === "error" &&
    typeof (v as ChatErrorEvent).message === "string"
  );
}

function isActionEvent(v: unknown): v is ChatActionEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: string }).type === "action" &&
    isBotAction((v as { action?: unknown }).action)
  );
}

function isThinkingEvent(v: unknown): v is ChatStreamThinking {
  return (
    isRecord(v) &&
    v.type === "thinking" &&
    typeof v.text === "string" &&
    v.text.trim().length > 0
  );
}

/**
 * Hard allowlist of action shapes the client will accept from the stream.
 * Retired (scroll-to) and deferred (schedule_*) types fail closed. The server
 * is the real authority (plan/entitlement scoped); this is defence in depth.
 */
export function isBotAction(value: unknown): value is BotAction {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "filter_inventory":
      return isInventoryFilterFields(value);
    case "navigate":
      return typeof value.route === "string";
    case "navigate-target":
      return (
        typeof value.targetKey === "string" &&
        (value.params === undefined || isStringRecord(value.params)) &&
        isConciergeTargetDescriptor(value.target, value.targetKey)
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
    case "navigate-back":
      // No path, URL or history index is ever accepted: the destination is
      // resolved locally from same-origin in-app history.
      return (
        (value.destination === "previous" || value.destination === "results") &&
        (value.fallback === undefined ||
          (isRecord(value.fallback) &&
            value.fallback.type === "filter_inventory" &&
            isInventoryFilterFields(value.fallback)))
      );
    default:
      return false;
  }
}

function isInventoryFilterFields(value: Record<string, unknown>): boolean {
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
    isOptionalVehicleSort(value.sort) &&
    isOptionalResultLimit(value.limit)
  );
}

function isConciergeTargetDescriptor(
  value: unknown,
  targetKey: string,
): boolean {
  if (
    !isRecord(value) ||
    value.key !== targetKey ||
    typeof value.label !== "string" ||
    typeof value.destination !== "string" ||
    typeof value.isConversion !== "boolean" ||
    !["route", "section-anchor", "form", "modal"].includes(String(value.kind))
  ) {
    return false;
  }
  return (
    validateConciergeTargetDestination(
      value.kind as ConciergeTargetKind,
      value.destination,
    ) === null
  );
}

function isStringRecord(value: unknown): boolean {
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

function isOptionalResultLimit(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 1 &&
      value <= 20)
  );
}

function isOptionalVehicleSort(value: unknown): boolean {
  return (
    value === undefined ||
    [
      "recommended",
      "created_desc",
      "price_asc",
      "price_desc",
      "year_desc",
      "year_asc",
      "mileage_asc",
      "mileage_desc",
    ].includes(String(value))
  );
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
