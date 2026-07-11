/**
 * Chat client. Talks to the tenant-scoped /api/chat route on the admin app —
 * the server builds the system prompt from the tenant's RAG corpus and
 * vehicle inventory and streams Deepseek's response back as SSE.
 *
 * The browser never sees the system prompt, the RAG chunks, or the Deepseek
 * API key. It only sends user/assistant turns and consumes deltas.
 */
import type { BotAction } from "@lume/types";
import { publicTenantSlug } from "./publicTenant";

const CHAT_ENDPOINT = "/api/chat";

/** Tenant whose RAG/vehicles should be used — runtime-resolved (subdomain /
 * ?tenant= override / build default), shared with the rest of the app. */
const TENANT_SLUG = publicTenantSlug;

export type DeepseekMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type ChatMetaEvent = { type: "meta"; sourceCategories: string[]; botName?: string };
type ChatActionEvent = { type: "action"; action: BotAction };
type ChatErrorEvent = { type: "error"; message: string };

export type ChatStreamYield =
  | { kind: "meta"; sourceCategories: string[]; botName?: string }
  | { kind: "delta"; text: string }
  | { kind: "action"; action: BotAction };

type DeepseekStreamChunk = {
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
  error?: string;
};

/**
 * Stream a chat turn from /api/chat. Yields meta first (source categories)
 * then a sequence of text deltas. Drops any system messages — the server
 * supplies the system prompt.
 */
export async function* streamChat(
  messages: DeepseekMessage[],
  signal?: AbortSignal
): AsyncGenerator<ChatStreamYield, void, unknown> {
  const sanitized = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: m.content }));

  const response = await fetch(CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lume-Tenant": TENANT_SLUG,
    },
    body: JSON.stringify({ messages: sanitized, stream: true }),
    credentials: "include",
    signal,
  });

  if (!response.ok) {
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    throw new Error(`Chat API ${response.status}: ${body || response.statusText}`);
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
          };
          continue;
        }
        if (isActionEvent(parsed)) {
          yield { kind: "action", action: parsed.action };
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

function isMetaEvent(v: unknown): v is ChatMetaEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { type?: string }).type === "meta" &&
    Array.isArray((v as ChatMetaEvent).sourceCategories)
  );
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

function isBotAction(value: unknown): value is BotAction {
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
