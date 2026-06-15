/**
 * POST /api/chat
 *
 * Public, tenant-scoped chat endpoint. Builds the system prompt server-side
 * from the tenant's RAG corpus + vehicle inventory, then streams Deepseek's
 * SSE response back unchanged.
 *
 * The client SHOULD NOT send a system prompt — anything received in
 * `messages` with role: "system" is dropped. The tenant is resolved from the
 * X-Lume-Tenant header (or ?tenant= or subdomain — see lib/tenant.ts).
 */
import type { BotAction, ChatMessage, ChatRequest } from "@lume/types";
import { createServiceClient } from "@lume/db/server";
import { rowToVehicle } from "@lume/db";
import {
  assembleSystemPrompt,
  extractVehicleFilters,
  isVehicleQuery,
  matchVehicles,
  retrieveByKeywords,
} from "@lume/rag";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 30;
const MAX_USER_CONTENT_LENGTH = 4_000;
const BOT_ACTION_SYSTEM_PROMPT = `
Structured actions:
When an action would help the user, you may emit exactly one JSON object on its own line. Keep normal helpful text streaming as usual. The JSON line must match one of these shapes:
{"type":"filter_inventory","make":"string","priceMin":0,"priceMax":0,"bodyStyle":"string"}
{"type":"navigate","route":"string"}
{"type":"highlight-vehicle","vehicleId":"string"}
{"type":"open-lead-form","prefill":{}}
{"type":"scroll-to","sectionId":"string"}
Only include fields that are useful. Do not wrap action JSON in markdown.`;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400, request);
  }

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages must be a non-empty array" }, 400, request);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json({ error: `messages must be ≤ ${MAX_MESSAGES}` }, 400, request);
  }

  // Drop any client-supplied system messages — only the server defines those.
  const cleanMessages: ChatMessage[] = body.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role,
      content: String(m.content ?? "").slice(0, MAX_USER_CONTENT_LENGTH),
    }));

  const lastUser = [...cleanMessages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return json({ error: "no user message found" }, 400, request);
  }

  // Resolve tenant.
  const tenant = await getTenantFromRequest(request);
  if (!tenant) {
    return json({ error: "Unknown or inactive tenant" }, 404, request);
  }

  // Build the tenant-scoped system prompt. Keyword + fuzzy retrieval over
  // this tenant's chunks — no embedder needed. When the corpus outgrows
  // in-memory scoring (~thousands of chunks), swap retrieveByKeywords()
  // for retrieveContext() from @lume/rag/server + an embedder.
  const supabase = createServiceClient();

  let assembled;
  try {
    const { data: chunkRows, error: chunkErr } = await supabase
      .from("rag_chunks")
      .select("text, category")
      .eq("tenant_id", tenant.tenantId);
    if (chunkErr) throw new Error(`rag_chunks query failed: ${chunkErr.message}`);

    const contextChunks = retrieveByKeywords(
      chunkRows ?? [],
      lastUser.content,
      7
    );

    let matchedVehicles;
    let totalMatched: number | undefined;
    let totalInventory: number | undefined;
    let filters;

    if (isVehicleQuery(lastUser.content)) {
      // Pull this tenant's vehicles for filter extraction + matching.
      // For very large catalogs, replace this with a server-side filtered
      // query using the same filter logic.
      const { data: vehicleRows } = await supabase
        .from("vehicles")
        .select("*")
        .eq("tenant_id", tenant.tenantId);
      const vehicles = (vehicleRows ?? []).map(rowToVehicle);
      filters = extractVehicleFilters(lastUser.content, vehicles);
      const match = matchVehicles(vehicles, filters, lastUser.content);
      matchedVehicles = match.results;
      totalMatched = match.totalMatched;
      totalInventory = vehicles.length;
    }

    assembled = assembleSystemPrompt({
      contextChunks,
      matchedVehicles,
      totalMatched,
      totalInventory,
      filters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RAG failure";
    console.error("[/api/chat] RAG error:", message);
    return json({ error: "Failed to build context" }, 500, request);
  }

  // Forward to Deepseek.
  const deepseekUrl =
    process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    return json({ error: "DEEPSEEK_API_KEY not configured" }, 500, request);
  }

  const upstream = await fetch(deepseekUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: body.stream ?? true,
      messages: [
        { role: "system", content: `${assembled.prompt}\n\n${BOT_ACTION_SYSTEM_PROMPT}` },
        ...cleanMessages,
      ],
    }),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return json(
      { error: `Deepseek error ${upstream.status}: ${text}` },
      upstream.status,
      request
    );
  }

  // Pass-through SSE. Prepend a one-line `data: { type: "meta", ... }` event
  // so the client can know which source categories were used.
  const cors = corsHeadersFor(request);
  const headers = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Source-Categories": assembled.sourceCategories.join(","),
    ...cors,
  });

  if (!upstream.body) {
    return json({ error: "No upstream body" }, 502, request);
  }

  const meta = `data: ${JSON.stringify({
    type: "meta",
    sourceCategories: assembled.sourceCategories,
  })}\n\n`;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      controller.enqueue(encoder.encode(meta));
      const reader = upstream.body!.getReader();
      let sseLineBuffer = "";
      let actionLineBuffer = "";
      let pendingActions: BotAction[] = [];

      const flushActionEvents = () => {
        for (const action of pendingActions) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "action", action })}\n\n`
            )
          );
        }
        pendingActions = [];
      };

      const processSseLine = (line: string) => {
        const trimmed = line.trim();

        if (trimmed === "data: [DONE]") {
          const finalAction = parseBotActionLine(actionLineBuffer);
          if (finalAction) pendingActions.push(finalAction);
          actionLineBuffer = "";
          flushActionEvents();
        }

        controller.enqueue(encoder.encode(`${line}\n`));

        if (!trimmed) {
          flushActionEvents();
          return;
        }

        const textDelta = extractDeepseekTextDelta(line);
        if (!textDelta) return;

        actionLineBuffer += textDelta;
        const actionLines = actionLineBuffer.split(/\r?\n/);
        actionLineBuffer = actionLines.pop() ?? "";

        for (const actionLine of actionLines) {
          const action = parseBotActionLine(actionLine);
          if (action) pendingActions.push(action);
        }
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          sseLineBuffer += decoder.decode(value, { stream: true });

          const sseLines = sseLineBuffer.split("\n");
          sseLineBuffer = sseLines.pop() ?? "";

          for (const sseLine of sseLines) {
            processSseLine(sseLine);
          }
        }
        if (sseLineBuffer) {
          processSseLine(sseLineBuffer);
        }
        const finalAction = parseBotActionLine(actionLineBuffer);
        if (finalAction) pendingActions.push(finalAction);
        flushActionEvents();
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failure";
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message })}\n\n`
          )
        );
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers });
}

function json(payload: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
    },
  });
}

type DeepseekStreamChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
};

function extractDeepseekTextDelta(line: string): string | undefined {
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

function parseBotActionLine(line: string): BotAction | undefined {
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
