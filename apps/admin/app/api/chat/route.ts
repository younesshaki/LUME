/**
 * POST /api/chat
 *
 * Public, tenant-scoped chat endpoint — the single chat implementation
 * (SCRUM-119: the root Vite deployment's /api/chat proxies here).
 *
 * Flow (SCRUM-144):
 *   1. Build the system prompt server-side from the tenant's RAG corpus +
 *      vehicle inventory.
 *   2. First tenant-selected model call (non-streaming) with @lume/bot tools.
 *   3. If the model requested tools, execute them tenant-scoped via
 *      BotToolContext, then re-call the same model (streaming) with the tool
 *      results for the prose answer. Tool-emitted BotActions are sent to the
 *      client as SSE `action` events right after `meta`.
 *   4. If no tools were requested, the first call's content is re-emitted in
 *      the same SSE shape the client already parses.
 *
 * The client SHOULD NOT send a system prompt — anything received in
 * `messages` with role: "system" is dropped. The tenant is resolved from the
 * X-Lume-Tenant header (or ?tenant= or subdomain — see lib/tenant.ts).
 *
 * Plan gating: the tenant's resolved plan entitlement "chat.actions"
 * (Basic = informational concierge only; Pro/Ultra = action-capable) decides
 * whether tool specs are advertised/executable and whether BotActions from
 * any source reach the client — on top of the tenant tool allowlist and
 * persona capabilities. See lib/chatEntitlements.ts.
 */
import type { BotAction, ChatRequest, Vehicle } from "@lume/types";
import { createAnonServerClient, createServiceClient } from "@lume/db/server";
import {
  getTenantVehicle,
  queryTenantVehicles,
  quotaExceededPayload,
  quotaResponseHeaders,
  resolveTenantPlan,
} from "@lume/db";
import {
  conversationMemoryToolPrompt,
  mergeRememberedMessages,
  parseToolCalls,
  runToolCalls,
  turnThinkingSteps,
  toToolResultMessages,
  toToolSpecs,
  type BotToolContext,
  type LlmToolCall,
  type MemoryMessage,
} from "@lume/bot";
import {
  assembleSystemPrompt,
  extractVehicleFilters,
  hasVehicleFilterConstraint,
  inheritVehicleFilterContext,
  isVehicleQuery,
  mergeTrustedVehicleQuery,
  retrieveByKeywords,
  vehicleQueryFromFilters,
} from "@lume/rag";
import { getTenantFromRequest } from "@/lib/tenant";
import { checkChatRateLimit, clientIpFromRequest } from "@/lib/rateLimit";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import {
  extractChatCompletionTextDelta,
  extractInlineActions,
  InlineActionStreamFilter,
  stripInlineActions,
} from "@/lib/botActions";
import {
  actionOnlyAcknowledgement,
  filterModelNavigationActionsByUserIntent,
  isImmediateSiteNavigation,
  recentVehicleIdFromAssistantHistory,
  recentVehicleIdFromToolResults,
  resolveDeterministicConciergeNavigation,
} from "@/lib/chatNavigation";
import {
  actionSystemPrompt,
  loadActivePersona,
  personaBasePrompt,
} from "@/lib/chatPersona";
import {
  buildBotActionAttribution,
  conciergeTargetSystemPrompt,
  filterGroundedVehicleActions,
  groundLeadCaptureActions,
  loadConciergeTargets,
  prepareBotActionsForClient,
  vehicleIdFromPublicPagePath,
} from "@/lib/conciergeTargets";
import {
  buildToolRequestFields,
  loadTenantBotRuntimeConfig,
} from "@/lib/chatTools";
import {
  assistantToolCallMessage,
  buildChatCompletionBody,
  normalizeProviderAssistantMessage,
  type ProviderAssistantMessage,
} from "@/lib/chatProvider";
import { resolveChatProvider } from "@/lib/chatProvider.server";
import {
  CHAT_ACTIONS_DISABLED_CAPABILITIES,
  filterPlanAllowedActions,
  planEnabledTools,
} from "@/lib/chatEntitlements";
import { loadChatLoyaltyContext, loyaltySystemPrompt } from "@/lib/chatLoyalty";
import { resolveVisitor } from "@/lib/visitorSession";
import { isChatStreamCompletionLine } from "@/lib/chatStreamCompletion";
import { checkPublicApiQuota } from "@/lib/quota.server";
import {
  completeVisitorPreferenceTurn,
  loadVisitorPreferenceContext,
  openVisitorPreferenceTurn,
  visitorPreferenceSystemPrompt,
} from "@/lib/visitorPreferences";
import {
  conversationMemoryKey,
  getConversationMemoryStore,
} from "@/lib/conversationMemory.server";
import { captureError } from "@/lib/observability";

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

  // Drop client-supplied system messages. Sanitize assistant history as
  // untrusted display text so an older leaked provider/action protocol cannot
  // be replayed into a future model turn.
  const rawConversationMessages: MemoryMessage[] = body.messages
    .flatMap((message): MemoryMessage[] =>
      message.role === "user" || message.role === "assistant"
        ? [{
            role: message.role,
            content: String(message.content ?? "").slice(0, MAX_USER_CONTENT_LENGTH),
          }]
        : []);
  const historyVehicleId =
    recentVehicleIdFromAssistantHistory(rawConversationMessages);
  const cleanMessages: MemoryMessage[] = rawConversationMessages.flatMap(
    (message): MemoryMessage[] => {
      const content =
        message.role === "assistant"
          ? stripInlineActions(message.content)
          : message.content;
      return content.trim() ? [{ ...message, content }] : [];
    },
  );

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
  const quota = await checkPublicApiQuota(tenant.tenantId, "chat_requests", supabase);
  if (!quota.allowed) {
    return json(quotaExceededPayload(quota), 429, request);
  }
  const quotaHeaders = quotaResponseHeaders(quota);

  // Persona (admin-configured voice + capabilities); degrades to the default
  // persona — chat never fails because persona storage is missing.
  const [persona, botRuntimeConfig, visitor, targetRegistry, tenantPlan] = await Promise.all([
    loadActivePersona(supabase, tenant.tenantId),
    loadTenantBotRuntimeConfig(supabase, tenant.tenantId),
    resolveVisitor(request, tenant.tenantId, supabase).catch(() => null),
    loadConciergeTargets(supabase, tenant.tenantId),
    resolveTenantPlan(supabase, tenant.tenantId),
  ]);
  const conciergeTargets = targetRegistry.targets;
  // Plan entitlement "chat.actions" (Basic = informational concierge only)
  // gates tools and BotActions below, on top of the tenant's own allowlist
  // and persona capabilities. Fails closed to Basic — see lib/chatEntitlements.
  const chatActionsEnabled = tenantPlan.entitlements["chat.actions"];
  const enabledTools = planEnabledTools(
    chatActionsEnabled,
    botRuntimeConfig.allowedTools,
  );
  const enabledToolNames = enabledTools.map((tool) => tool.name);
  const toolRequestFields = buildToolRequestFields(toToolSpecs(enabledTools));
  const tenantName = tenant.name ?? tenant.slug;
  const memoryStore = getConversationMemoryStore();
  const memoryKey = visitor ? conversationMemoryKey(tenant.tenantId, visitor.id) : null;
  const remembered = memoryKey
    ? await memoryStore.get(memoryKey).catch((error: unknown) => {
        captureError("api/chat/memory-read", error, { tenantId: tenant.tenantId });
        return null;
      })
    : null;
  const cleanRememberedMessages: MemoryMessage[] = (
    remembered?.messages ?? []
  ).flatMap((message): MemoryMessage[] => {
    const content =
      message.role === "assistant"
        ? stripInlineActions(message.content)
        : message.content;
    return content.trim() ? [{ ...message, content }] : [];
  });
  const rememberedHistoryVehicleId = recentVehicleIdFromAssistantHistory(
    remembered?.messages ?? [],
  );
  const modelMessages: MemoryMessage[] = mergeRememberedMessages(
    cleanRememberedMessages,
    cleanMessages,
  );
  const visitorTurn = visitor
    ? await openVisitorPreferenceTurn(supabase, {
        tenantId: tenant.tenantId,
        visitorId: visitor.id,
        requestedSessionId:
          typeof body.sessionId === "string" ? body.sessionId : undefined,
        startNewSession: body.startNewSession === true,
        userContent: lastUser.content,
      })
    : null;
  const actionAttribution = buildBotActionAttribution(
    modelMessages,
    visitorTurn?.sessionId ??
      (typeof body.sessionId === "string" ? body.sessionId : undefined),
  );
  const currentPageVehicleId = vehicleIdFromPublicPagePath(body.pagePath);
  const selectedVehicleCandidate =
    currentPageVehicleId ??
    recentVehicleIdFromToolResults(remembered?.toolResults ?? []) ??
    rememberedHistoryVehicleId ??
    historyVehicleId;

  let assembled;
  const groundedVehicleIds = new Set<string>();
  let groundedVehicles: Vehicle[] = [];
  let groundedInventoryFilters: ReturnType<typeof extractVehicleFilters> | null = null;
  let selectedVehicleId: string | null = null;
  let chatLoyaltyContext: Awaited<ReturnType<typeof loadChatLoyaltyContext>> = null;
  let visitorPreferenceContext: Awaited<ReturnType<typeof loadVisitorPreferenceContext>> = null;
  try {
    const [chunkResult, loadedLoyaltyContext, loadedPreferenceContext, selectedVehicleResult] = await Promise.all([
      supabase
        .from("rag_chunks")
        .select("text, category")
        .eq("tenant_id", tenant.tenantId),
      visitor
        ? loadChatLoyaltyContext(supabase, tenant.tenantId, visitor)
        : Promise.resolve(null),
      visitor
        ? loadVisitorPreferenceContext(supabase, {
            tenantId: tenant.tenantId,
            visitorId: visitor.id,
          })
        : Promise.resolve(null),
      selectedVehicleCandidate
        ? supabase
            .from("vehicles")
            .select("id, year, make, model, trim")
            .eq("tenant_id", tenant.tenantId)
            .eq("id", selectedVehicleCandidate)
            .eq("status", "live")
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    chatLoyaltyContext = loadedLoyaltyContext;
    visitorPreferenceContext = loadedPreferenceContext;
    const { data: chunkRows, error: chunkErr } = chunkResult;
    if (chunkErr) throw new Error(`rag_chunks query failed: ${chunkErr.message}`);

    const contextChunks = retrieveByKeywords(
      chunkRows ?? [],
      lastUser.content,
      7
    );
    if (selectedVehicleResult.data) {
      const selectedVehicle = selectedVehicleResult.data;
      selectedVehicleId = selectedVehicle.id;
      groundedVehicleIds.add(selectedVehicle.id);
      contextChunks.unshift({
        category:
          selectedVehicle.id === currentPageVehicleId
            ? "current-page"
            : "recent-selection",
        text: `${selectedVehicle.id === currentPageVehicleId ? "Current public page is" : "The visitor's most recently selected vehicle is"} the live vehicle ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.trim ? ` ${selectedVehicle.trim}` : ""}. Exact vehicleId: ${selectedVehicle.id}.`,
        score: 2,
      });
    }

    let matchedVehicles;
    let totalMatched: number | undefined;
    let filters;

    const initialCurrentFilters = extractVehicleFilters(lastUser.content);
    const initialPriorFilters = latestPriorVehicleFilters(cleanMessages);
    const initialFilters = inheritVehicleFilterContext(
      initialCurrentFilters,
      initialPriorFilters,
    );
    const isTrustedVehicleContinuation =
      hasVehicleFilterConstraint(initialCurrentFilters) &&
      Boolean(initialPriorFilters?.make || initialPriorFilters?.model);

    if (isVehicleQuery(lastUser.content) || isTrustedVehicleContinuation) {
      // Resolve catalog vocabulary through the bounded facets RPC, then let
      // Postgres filter the complete tenant inventory. Pulling ".select(*)"
      // here silently hit PostgREST's row cap on larger tenants and could turn
      // a real make (for example Mercedes-Benz) into a false zero-result answer.
      const { data: facetRows, error: facetError } = await supabase.rpc(
        "vehicle_facets_v2",
        {
          p_tenant_id: tenant.tenantId,
          p_make: initialFilters.make ?? null,
          p_state: initialFilters.sellerState ?? null,
        },
      );
      if (facetError) {
        captureError("api/chat/vehicle-facets", facetError, {
          tenantId: tenant.tenantId,
        });
      }
      const vocabulary = vehicleFilterVocabulary(facetRows);
      filters = inheritVehicleFilterContext(
        extractVehicleFilters(lastUser.content, [], vocabulary),
        latestPriorVehicleFilters(cleanMessages, vocabulary),
      );
      const match = await queryTenantVehicles(supabase, tenant.tenantId, {
        ...vehicleQueryFromFilters(filters),
        limit: 30,
      });
      matchedVehicles = match.vehicles;
      groundedVehicles = matchedVehicles;
      groundedInventoryFilters = filters;
      for (const vehicle of matchedVehicles) groundedVehicleIds.add(vehicle.id);
      totalMatched = match.totalCount ?? matchedVehicles.length;
      const matchedIds = matchedVehicles.slice(0, 20).map((vehicle) => vehicle.id);
      if (matchedIds.length > 0) {
        const { data: imageDescriptions } = await supabase
          .from("vehicle_images")
          .select("vehicle_id, ai_description")
          .eq("tenant_id", tenant.tenantId)
          .eq("is_primary", true)
          .eq("ai_description_status", "completed")
          .in("vehicle_id", matchedIds);
        for (const image of imageDescriptions ?? []) {
          if (!image.ai_description) continue;
          const vehicle = matchedVehicles.find((candidate) => candidate.id === image.vehicle_id);
          if (vehicle) contextChunks.push({
            category: "vehicle-image",
            text: `Primary image for ${vehicle.year} ${vehicle.make} ${vehicle.model}: ${image.ai_description}`,
            score: 1,
          });
        }
      }
    }

    assembled = assembleSystemPrompt({
      basePrompt: personaBasePrompt(persona, tenantName),
      contextChunks,
      matchedVehicles,
      totalMatched,
      filters,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RAG failure";
    captureError("api/chat/context-build", err, {
      tenantId: tenant.tenantId,
      detail: message,
    });
    return json({ error: "Failed to build context" }, 500, request, quotaHeaders);
  }

  const deterministicActions = chatActionsEnabled
    ? resolveDeterministicConciergeNavigation({
        messages: modelMessages,
        targets: conciergeTargets,
        selectedVehicleId,
        groundedVehicles,
        inventoryFilters: groundedInventoryFilters,
        capabilities: persona.capabilities,
      })
    : [];
  const hasDeterministicActions = deterministicActions.length > 0;
  const cors = corsHeadersFor(request);
  const sseHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Source-Categories": assembled.sourceCategories.join(","),
    ...quotaHeaders,
    ...cors,
  });
  const metaEvent = sseEvent({
    type: "meta",
    sourceCategories: assembled.sourceCategories,
    botName: persona.name,
    // Capability level for client display only — enforcement is the
    // server-side plan gate above, never this hint.
    capabilities: { actions: chatActionsEnabled },
    ...(visitorTurn ? { sessionId: visitorTurn.sessionId } : {}),
  });

  if (isImmediateSiteNavigation(deterministicActions)) {
    const actions = prepareBotActionsForClient(
      filterGroundedVehicleActions(
        groundLeadCaptureActions(
          filterPlanAllowedActions(chatActionsEnabled, deterministicActions, persona.capabilities),
          modelMessages,
        ),
        conciergeTargets,
        groundedVehicleIds,
      ),
      conciergeTargets,
      actionAttribution,
    );
    const visibleContent = actionOnlyAcknowledgement(actions);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(metaEvent));
        for (const action of actions) {
          controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
        }
        if (visibleContent) {
          controller.enqueue(
            encoder.encode(
              sseEvent({ choices: [{ delta: { content: visibleContent } }] }),
            ),
          );
        }
        if (visitor && visitorTurn && visibleContent) {
          await completeVisitorPreferenceTurn(supabase, {
            tenantId: tenant.tenantId,
            visitorId: visitor.id,
            sessionId: visitorTurn.sessionId,
            assistantContent: visibleContent,
          });
        }
        if (memoryKey && visibleContent) {
          await memoryStore.append(memoryKey, {
            messages: [lastUser, { role: "assistant", content: visibleContent }],
          }).catch((error: unknown) => {
            captureError("api/chat/memory-write", error, {
              tenantId: tenant.tenantId,
            });
          });
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, { headers: sseHeaders });
  }

  const chatProvider = resolveChatProvider(botRuntimeConfig.modelId);
  if (!chatProvider) {
    return json(
      { error: "AI provider is not configured" },
      503,
      request,
      quotaHeaders,
    );
  }
  if (chatProvider.fellBack) {
    captureError(
      "api/chat/model-fallback",
      new Error("Configured concierge model provider is unavailable"),
      {
        tenantId: tenant.tenantId,
        requestedModel: chatProvider.requestedModelId,
        effectiveModel: chatProvider.profile.id,
      },
    );
  }

  const systemMessage = {
    role: "system" as const,
    content: `${assembled.prompt}${loyaltySystemPrompt(chatLoyaltyContext)}${visitorPreferenceSystemPrompt(visitorPreferenceContext)}${conversationMemoryToolPrompt(remembered?.toolResults ?? [])}${conciergeTargetSystemPrompt(!chatActionsEnabled || persona.capabilities.navigate === false ? [] : conciergeTargets)}\n${actionSystemPrompt(chatActionsEnabled ? persona.capabilities : CHAT_ACTIONS_DISABLED_CAPABILITIES, enabledToolNames)}`,
  };

  // ── Phase 1: non-streaming call with tools ────────────────────────────────
  // parseToolCalls expects the non-streamed message.tool_calls shape; if the
  // model answers in prose we re-emit its content as SSE below, so the client
  // contract is identical either way.
  const phase1 = await fetch(chatProvider.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chatProvider.apiKey}`,
    },
    body: JSON.stringify(
      buildChatCompletionBody({
        modelId: chatProvider.profile.id,
        stream: false,
        messages: [systemMessage, ...modelMessages],
        toolFields: toolRequestFields,
      }),
    ),
  });

  if (!phase1.ok) {
    await phase1.text();
    captureError(
      "api/chat/provider-phase-1",
      new Error("Concierge provider request failed"),
      {
        tenantId: tenant.tenantId,
        provider: chatProvider.profile.provider,
        model: chatProvider.profile.id,
        status: phase1.status,
      },
    );
    return json(
      { error: "AI provider request failed" },
      phase1.status === 429 ? 429 : 502,
      request,
      quotaHeaders,
    );
  }

  let phase1Message: ProviderAssistantMessage;
  try {
    const parsed = (await phase1.json()) as ProviderCompletion;
    const message = parsed.choices?.[0]?.message;
    if (!message) throw new Error("no choices in completion");
    phase1Message = normalizeProviderAssistantMessage(
      chatProvider.profile,
      message,
      enabledToolNames,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad completion";
    captureError("api/chat/completion-parse", err, {
      tenantId: tenant.tenantId,
      detail: message,
    });
    return json({ error: "Malformed model response" }, 502, request, quotaHeaders);
  }

  // ── No tools requested: re-emit the prose as SSE ──────────────────────────
  if (phase1Message.toolCalls.length === 0) {
    const content = phase1Message.content;
    const filteredContent = stripInlineActions(content);
    const modelActions = hasDeterministicActions
      ? deterministicActions
      : filterModelNavigationActionsByUserIntent(
          extractInlineActions(content),
          modelMessages,
        );
    const actions = prepareBotActionsForClient(
      filterGroundedVehicleActions(
        groundLeadCaptureActions(
          filterPlanAllowedActions(chatActionsEnabled, modelActions, persona.capabilities),
          modelMessages,
        ),
        conciergeTargets,
        groundedVehicleIds,
      ),
      conciergeTargets,
      actionAttribution,
    );
    const visibleContent =
      filteredContent || actionOnlyAcknowledgement(actions);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(metaEvent));
        for (const action of actions) {
          controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
        }
        if (visibleContent) {
          controller.enqueue(
            encoder.encode(sseEvent({ choices: [{ delta: { content: visibleContent } }] }))
          );
        }
        if (visitor && visitorTurn && visibleContent) {
          await completeVisitorPreferenceTurn(supabase, {
            tenantId: tenant.tenantId,
            visitorId: visitor.id,
            sessionId: visitorTurn.sessionId,
            assistantContent: visibleContent,
          });
        }
        if (memoryKey && visibleContent) {
          await memoryStore.append(memoryKey, {
            messages: [lastUser, { role: "assistant", content: visibleContent }],
          }).catch((error: unknown) => {
            captureError("api/chat/memory-write", error, { tenantId: tenant.tenantId });
          });
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
  const trustedVehicleQuery = vehicleQueryFromFilters(
    groundedInventoryFilters ?? {},
  );
  const ctx: BotToolContext = {
    tenantId: tenant.tenantId,
    queryVehicles: (query) =>
      queryTenantVehicles(
        anonDb,
        tenant.tenantId,
        mergeTrustedVehicleQuery(query, trustedVehicleQuery),
      ),
    getVehicleById: (id) => getTenantVehicle(anonDb, tenant.tenantId, id),
  };

  const calls = parseToolCalls(phase1Message.toolCalls);
  const turn = await runToolCalls(calls, ctx, { allowedToolNames: enabledToolNames });
  const thinkingSteps = turnThinkingSteps(turn.steps);

  const phase2 = await fetch(chatProvider.apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chatProvider.apiKey}`,
    },
    body: JSON.stringify(
      buildChatCompletionBody({
        modelId: chatProvider.profile.id,
        stream: true,
        // No tools on the follow-up: one tool round per turn keeps latency and
        // failure modes bounded. Revisit if multi-round tool use proves useful.
        messages: [
          systemMessage,
          ...modelMessages,
          assistantToolCallMessage(phase1Message),
          ...toToolResultMessages(turn.steps),
        ],
      }),
    ),
  });

  if (!phase2.ok) {
    await phase2.text();
    captureError(
      "api/chat/provider-phase-2",
      new Error("Concierge provider follow-up failed"),
      {
        tenantId: tenant.tenantId,
        provider: chatProvider.profile.provider,
        model: chatProvider.profile.id,
        status: phase2.status,
      },
    );
    return json(
      { error: "AI provider request failed" },
      phase2.status === 429 ? 429 : 502,
      request,
      quotaHeaders,
    );
  }
  if (!phase2.body) {
    return json({ error: "No upstream body" }, 502, request, quotaHeaders);
  }

  const upstreamBody = phase2.body;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      controller.enqueue(encoder.encode(metaEvent));
      // These are fixed operational summaries of completed tool calls, not
      // model reasoning or chain-of-thought. Emit them before actions/prose.
      for (const text of thinkingSteps) {
        controller.enqueue(encoder.encode(sseEvent({ type: "thinking", text })));
      }
      // Tool-emitted UI actions go out before the prose starts streaming so
      // the interface reacts (filters, highlights) while the model talks.
      for (const action of turn.actions) {
        if (action.type === "highlight-vehicle") {
          groundedVehicleIds.add(action.vehicleId);
        }
      }
      const seenActionFingerprints = new Set<string>();
      const emittedActions: BotAction[] = [];
      const initialActions = hasDeterministicActions
        ? deterministicActions
        : filterModelNavigationActionsByUserIntent(
            turn.actions,
            modelMessages,
          );
      for (const action of prepareBotActionsForClient(
        filterGroundedVehicleActions(
          groundLeadCaptureActions(
            filterPlanAllowedActions(chatActionsEnabled, initialActions, persona.capabilities),
            modelMessages,
          ),
          conciergeTargets,
          groundedVehicleIds,
        ),
        conciergeTargets,
        actionAttribution,
        seenActionFingerprints,
      )) {
        controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
        emittedActions.push(action);
      }

      const reader = upstreamBody.getReader();
      let sseLineBuffer = "";
      const actionFilter = new InlineActionStreamFilter();
      let assistantContent = "";
      let streamCompletionObserved = false;
      let doneEventSent = false;

      const emitActions = (actions: readonly BotAction[]) => {
        if (hasDeterministicActions) return;
        for (const action of prepareBotActionsForClient(
          filterGroundedVehicleActions(
            groundLeadCaptureActions(
              filterPlanAllowedActions(
                chatActionsEnabled,
                filterModelNavigationActionsByUserIntent(
                  actions,
                  modelMessages,
                ),
                persona.capabilities,
              ),
              modelMessages,
            ),
            conciergeTargets,
            groundedVehicleIds,
          ),
          conciergeTargets,
          actionAttribution,
          seenActionFingerprints,
        )) {
          controller.enqueue(encoder.encode(sseEvent({ type: "action", action })));
          emittedActions.push(action);
        }
      };

      const emitActionOnlyAcknowledgement = () => {
        if (assistantContent.trim()) return;
        const acknowledgement = actionOnlyAcknowledgement(emittedActions);
        if (!acknowledgement) return;
        assistantContent = acknowledgement;
        controller.enqueue(
          encoder.encode(
            sseEvent({ choices: [{ delta: { content: acknowledgement } }] }),
          ),
        );
      };

      const emitFiltered = ({
        visibleText,
        actions,
      }: ReturnType<InlineActionStreamFilter["push"]>) => {
        if (visibleText) {
          assistantContent += visibleText;
          controller.enqueue(
            encoder.encode(sseEvent({ choices: [{ delta: { content: visibleText } }] })),
          );
        }
        emitActions(actions);
      };

      const processSseLine = (line: string) => {
        const trimmed = line.trim();
        if (isChatStreamCompletionLine(line)) streamCompletionObserved = true;

        if (trimmed === "data: [DONE]") {
          emitFiltered(actionFilter.flush());
          emitActionOnlyAcknowledgement();
          if (!doneEventSent) {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            doneEventSent = true;
          }
          return;
        }

        const textDelta = extractChatCompletionTextDelta(line);
        if (!textDelta) return;
        emitFiltered(actionFilter.push(textDelta));
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
        emitFiltered(actionFilter.flush());
        if (streamCompletionObserved && !doneEventSent) {
          emitActionOnlyAcknowledgement();
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          doneEventSent = true;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failure";
        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message }))
        );
      } finally {
        if (streamCompletionObserved && visitor && visitorTurn && assistantContent.trim()) {
          await completeVisitorPreferenceTurn(supabase, {
            tenantId: tenant.tenantId,
            visitorId: visitor.id,
            sessionId: visitorTurn.sessionId,
            assistantContent,
          });
        }
        if (streamCompletionObserved && memoryKey && assistantContent.trim()) {
          await memoryStore.append(memoryKey, {
            messages: [lastUser, { role: "assistant", content: assistantContent }],
            toolResults: turn.steps.map((step) => ({
              name: step.call.name,
              result: step.result,
            })),
          }).catch((error: unknown) => {
            captureError("api/chat/memory-write", error, { tenantId: tenant.tenantId });
          });
        }
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

function vehicleFilterVocabulary(value: unknown): {
  makes: string[];
  models: string[];
  states: string[];
  cities: string[];
} {
  const row = Array.isArray(value) ? value[0] : value;
  const record = isRecord(row) ? row : {};
  return {
    makes: stringArray(record.makes),
    models: stringArray(record.models),
    states: stringArray(record.states),
    cities: stringArray(record.cities),
  };
}

function latestPriorVehicleFilters(
  messages: readonly MemoryMessage[],
  vocabulary: Parameters<typeof extractVehicleFilters>[2] = {},
): ReturnType<typeof extractVehicleFilters> | null {
  let skippedCurrentUser = false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    if (!skippedCurrentUser) {
      skippedCurrentUser = true;
      continue;
    }
    const filters = extractVehicleFilters(message.content, [], vocabulary);
    if (filters.make || filters.model) return filters;
  }
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(
  payload: unknown,
  status: number,
  request?: Request,
  responseHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
      ...responseHeaders,
    },
  });
}

function sseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

type ProviderMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: LlmToolCall[];
};

type ProviderCompletion = {
  choices?: Array<{ message?: ProviderMessage }>;
};
