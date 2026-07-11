/**
 * POST /api/chat
 *
 * Public, tenant-scoped chat endpoint — the single chat implementation
 * (SCRUM-119: the root Vite deployment's /api/chat proxies here).
 *
 * Flow (SCRUM-144):
 *   1. Build the system prompt server-side from the tenant's RAG corpus +
 *      vehicle inventory.
 *   2. First DeepSeek call (non-streaming) with @lume/bot tool specs.
 *   3. If the model requested tools, execute them tenant-scoped via
 *      BotToolContext, then re-call DeepSeek (streaming) with the tool
 *      results for the prose answer. Tool-emitted BotActions are sent to the
 *      client as SSE `action` events right after `meta`.
 *   4. If no tools were requested, the first call's content is re-emitted in
 *      the same SSE shape the client already parses.
 *
 * The client SHOULD NOT send a system prompt — anything received in
 * `messages` with role: "system" is dropped. The tenant is resolved from the
 * X-Lume-Tenant header (or ?tenant= or subdomain — see lib/tenant.ts).
 */
import type { BotAction, ChatMessage, ChatRequest } from "@lume/types";
import { createAnonServerClient, createServiceClient } from "@lume/db/server";
import { getTenantVehicle, queryTenantVehicles, rowToVehicle } from "@lume/db";
import {
  filterBotTools,
  parseToolCalls,
  runToolCalls,
  toToolResultMessages,
  toToolSpecs,
  type BotToolContext,
  type LlmToolCall,
} from "@lume/bot";
import {
  assembleSystemPrompt,
  extractVehicleFilters,
  isVehicleQuery,
  matchVehicles,
  retrieveByKeywords,
} from "@lume/rag";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkChatRateLimit, clientIpFromRequest } from "@/lib/rateLimit";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import {
  extractDeepseekTextDelta,
  extractInlineActions,
  parseBotActionLine,
} from "@/lib/botActions";
import {
  actionSystemPrompt,
  filterAllowedActions,
  isActionAllowed,
  loadActivePersona,
  personaBasePrompt,
} from "@/lib/chatPersona";
import { buildToolRequestFields, loadTenantToolAllowlist } from "@/lib/chatTools";
import { loadChatLoyaltyContext, loyaltySystemPrompt } from "@/lib/chatLoyalty";
import { resolveVisitor } from "@/lib/visitorSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGES = 30;
const MAX_USER_CONTENT_LENGTH = 4_000;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  // SCRUM-112: 10 chat requests/min per client IP, best-effort in-memory.
  const rate = checkChatRateLimit(clientIpFromRequest(request));
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfterSeconds),
        ...corsHeadersFor(request),
      },
    });
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

  // Persona (admin-configured voice + capabilities); degrades to the default
  // persona — chat never fails because persona storage is missing.
  const [persona, toolAllowlist, visitor] = await Promise.all([
    loadActivePersona(supabase, tenant.tenantId),
    loadTenantToolAllowlist(supabase, tenant.tenantId),
    resolveVisitor(request, tenant.tenantId, supabase).catch(() => null),
  ]);
  const enabledTools = filterBotTools(toolAllowlist);
  const enabledToolNames = enabledTools.map((tool) => tool.name);
  const toolRequestFields = buildToolRequestFields(toToolSpecs(enabledTools));
  const tenantName = tenant.name ?? tenant.slug;

  let assembled;
  let chatLoyaltyContext: Awaited<ReturnType<typeof loadChatLoyaltyContext>> = null;
  try {
    const [chunkResult, loadedLoyaltyContext] = await Promise.all([
      supabase
        .from("rag_chunks")
        .select("text, category")
        .eq("tenant_id", tenant.tenantId),
      visitor
        ? loadChatLoyaltyContext(supabase, tenant.tenantId, visitor)
        : Promise.resolve(null),
    ]);
    chatLoyaltyContext = loadedLoyaltyContext;
    const { data: chunkRows, error: chunkErr } = chunkResult;
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
        .eq("tenant_id", tenant.tenantId)
        .eq("status", "live");
      const vehicles = (vehicleRows ?? []).map(rowToVehicle);
      filters = extractVehicleFilters(lastUser.content, vehicles);
      const match = matchVehicles(vehicles, filters, lastUser.content);
      matchedVehicles = match.results;
      totalMatched = match.totalMatched;
      totalInventory = vehicles.length;
    }

    assembled = assembleSystemPrompt({
      basePrompt: personaBasePrompt(persona, tenantName),
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

  const deepseekUrl =
    process.env.DEEPSEEK_API_URL ?? "https://api.deepseek.com/v1/chat/completions";
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) {
    return json({ error: "DEEPSEEK_API_KEY not configured" }, 500, request);
  }

  const systemMessage = {
    role: "system" as const,
    content: `${assembled.prompt}${loyaltySystemPrompt(chatLoyaltyContext)}\n${actionSystemPrompt(persona.capabilities, enabledToolNames)}`,
  };

  // ── Phase 1: non-streaming call with tools ────────────────────────────────
  // parseToolCalls expects the non-streamed message.tool_calls shape; if the
  // model answers in prose we re-emit its content as SSE below, so the client
  // contract is identical either way.
  const phase1 = await fetch(deepseekUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: false,
      messages: [systemMessage, ...cleanMessages],
      ...toolRequestFields,
    }),
  });

  if (!phase1.ok) {
    const text = await phase1.text();
    return json(
      { error: `Deepseek error ${phase1.status}: ${text}` },
      phase1.status,
      request
    );
  }

  let phase1Message: DeepseekMessage;
  try {
    const parsed = (await phase1.json()) as DeepseekCompletion;
    const message = parsed.choices?.[0]?.message;
    if (!message) throw new Error("no choices in completion");
    phase1Message = message;
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad completion";
    console.error("[/api/chat] completion parse error:", message);
    return json({ error: "Malformed model response" }, 502, request);
  }

  const cors = corsHeadersFor(request);
  const sseHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Source-Categories": assembled.sourceCategories.join(","),
    ...cors,
  });

  const metaEvent = sseEvent({
    type: "meta",
    sourceCategories: assembled.sourceCategories,
    botName: persona.name,
  });

  // ── No tools requested: re-emit the prose as SSE ──────────────────────────
  if (!phase1Message.tool_calls?.length) {
    const content = phase1Message.content ?? "";
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(metaEvent));
        for (const action of filterAllowedActions(
          extractInlineActions(content),
          persona.capabilities
        )) {
          controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
        }
        if (content) {
          controller.enqueue(
            encoder.encode(sseEvent({ choices: [{ delta: { content } }] }))
          );
        }
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { headers: sseHeaders });
  }

  // ── Tools requested: execute tenant-scoped, then stream the follow-up ─────
  // Anon client for tool data access: RLS stays the backstop on top of the
  // explicit tenant filter (mirrors /api/vehicles).
  const anonDb = createAnonServerClient();
  const ctx: BotToolContext = {
    tenantId: tenant.tenantId,
    queryVehicles: (q) => queryTenantVehicles(anonDb, tenant.tenantId, q),
    getVehicleById: (id) => getTenantVehicle(anonDb, tenant.tenantId, id),
  };

  const calls = parseToolCalls(phase1Message.tool_calls);
  const turn = await runToolCalls(calls, ctx, { allowedToolNames: enabledToolNames });

  const phase2 = await fetch(deepseekUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deepseekKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: true,
      // No tools on the follow-up: one tool round per turn keeps latency and
      // failure modes bounded. Revisit if multi-round tool use proves useful.
      messages: [
        systemMessage,
        ...cleanMessages,
        {
          role: "assistant",
          content: phase1Message.content ?? "",
          tool_calls: phase1Message.tool_calls,
        },
        ...toToolResultMessages(turn.steps),
      ],
    }),
  });

  if (!phase2.ok) {
    const text = await phase2.text();
    return json(
      { error: `Deepseek error ${phase2.status}: ${text}` },
      phase2.status,
      request
    );
  }
  if (!phase2.body) {
    return json({ error: "No upstream body" }, 502, request);
  }

  const upstreamBody = phase2.body;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      controller.enqueue(encoder.encode(metaEvent));
      // Tool-emitted UI actions go out before the prose starts streaming so
      // the interface reacts (filters, highlights) while the model talks.
      for (const action of filterAllowedActions(turn.actions, persona.capabilities)) {
        controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
      }

      const reader = upstreamBody.getReader();
      let sseLineBuffer = "";
      let actionLineBuffer = "";
      let pendingActions: BotAction[] = [];

      const flushActionEvents = () => {
        for (const action of pendingActions) {
          controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
        }
        pendingActions = [];
      };

      const processSseLine = (line: string) => {
        const trimmed = line.trim();

        if (trimmed === "data: [DONE]") {
          const finalAction = parseBotActionLine(actionLineBuffer);
          if (finalAction && isActionAllowed(finalAction, persona.capabilities)) {
            pendingActions.push(finalAction);
          }
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
          if (action && isActionAllowed(action, persona.capabilities)) {
            pendingActions.push(action);
          }
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
        if (finalAction && isActionAllowed(finalAction, persona.capabilities)) {
          pendingActions.push(finalAction);
        }
        flushActionEvents();
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failure";
        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message }))
        );
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
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

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

type DeepseekMessage = {
  content?: string | null;
  tool_calls?: LlmToolCall[];
};

type DeepseekCompletion = {
  choices?: Array<{ message?: DeepseekMessage }>;
};
