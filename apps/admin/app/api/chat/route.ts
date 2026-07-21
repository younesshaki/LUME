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
  DEFAULT_CONCIERGE_MODEL_ID,
  isPremiumConciergeModel,
} from "@/lib/conciergeModels";
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
import { captureDebug, captureError } from "@/lib/observability";
import {
  filterActionsByConversationStateWithDiagnostics,
  hasScopeResetIntent,
  isAmbiguousAffirmation,
  isOrdinalVehicleActionRequest,
  isOrdinalVehicleReference,
  isPresentationRequest,
  isSelectedVehicleActionRequest,
  isSelectedVehicleDetailRequest,
  isTruncatedLastOrdinalReference,
  isUnsupportedVehicleFactRequest,
  normalizeConversationInventoryState,
  ordinalResultSetVehicleId,
  preserveResultSetForZeroResults,
  selectConversationVehicle,
  selectedResultSetVehicleId,
  setConversationResultSet,
  transitionInventoryState,
  vehicleSatisfiesActiveFilters,
  type ConversationInventoryState,
} from "@/lib/chatConversationState";

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
  // Public visitors need the same deterministic continuity as signed-in
  // visitors. The opaque, server-issued ID is only a memory namespace; it is
  // never used for identity, authorization, preferences, or lead data.
  const anonymousConversationId = !visitor
    ? resolveAnonymousConversationId(
        typeof body.sessionId === "string" ? body.sessionId : undefined,
        body.startNewSession === true,
      )
    : null;
  const memoryKey = conversationMemoryKey(
    tenant.tenantId,
    visitor ? visitor.id : `anonymous:${anonymousConversationId!}`,
  );
  const remembered = memoryKey
    ? await memoryStore.get(memoryKey).catch((error: unknown) => {
        captureError("api/chat/memory-read", error, { tenantId: tenant.tenantId });
        return null;
      })
    : null;
  let conversationState: ConversationInventoryState = normalizeConversationInventoryState(
    remembered?.conversationState,
  );
  const conversationStateBefore = conversationState;
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
  const previousAssistantContent = previousAssistantContentForLastUser(modelMessages);
  const deterministicClarifier = isAmbiguousAffirmation(
    lastUser.content,
    previousAssistantContent,
  )
    ? "I want to make sure I take the right direction: do you mean the first option or the second?"
    : null;
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
    // Keep "tell me more about it" grounded even before navigation finishes
    // and updates pagePath. This ID was created only from the verified
    // current result set by selectConversationVehicle().
    conversationState.selectedVehicleId ??
    recentVehicleIdFromToolResults(remembered?.toolResults ?? []) ??
    rememberedHistoryVehicleId ??
    historyVehicleId;

  let assembled;
  const groundedVehicleIds = new Set<string>();
  let groundedVehicles: Vehicle[] = [];
  let groundedInventoryFilters: ReturnType<typeof extractVehicleFilters> | null = null;
  let matchedVehicles: Vehicle[] | undefined;
  let totalMatched: number | undefined;
  let filters: ReturnType<typeof extractVehicleFilters> | undefined;
  let deterministicAvailabilityAnswer: string | null = null;
  let deterministicInventoryAnswer: string | null = null;
  let deterministicInventoryAction: BotAction | null = null;
  let deterministicZeroResultAnswer: string | null = null;
  let deterministicOrdinalUnavailableAnswer: string | null = null;
  let deterministicOrdinalReferenceAnswer: string | null = null;
  let deterministicSelectedVehicleAnswer: string | null = null;
  let deterministicSelectedVehicleUnavailableAnswer: string | null = null;
  let deterministicUnsupportedFactAnswer: string | null = null;
  let stateOrdinalVehicleId: string | null = null;
  let stateSelectedVehicleId: string | null = null;
  let statePresentationRequest = false;
  let extractedInventoryFilters: ReturnType<typeof extractVehicleFilters> = {};
  let stateRules: string[] = [];
  let selectedVehicleId: string | null = null;
  let chatLoyaltyContext: Awaited<ReturnType<typeof loadChatLoyaltyContext>> = null;
  let visitorPreferenceContext: Awaited<ReturnType<typeof loadVisitorPreferenceContext>> = null;
  try {
    // Load the bounded tenant vocabulary for every turn. A visitor can ask
    // for a model without naming its make ("show me 911s"), which cannot be
    // recognized reliably without knowing this tenant's actual catalog.
    const initialFilters = conversationState.activeFilters;
    const [chunkResult, loadedLoyaltyContext, loadedPreferenceContext, selectedVehicleResult, facetResult] = await Promise.all([
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
        ? getTenantVehicle(supabase, tenant.tenantId, selectedVehicleCandidate)
        : Promise.resolve(null),
      supabase.rpc("vehicle_facets_v2", {
        p_tenant_id: tenant.tenantId,
        p_make: initialFilters.make ?? null,
        p_state: initialFilters.sellerState ?? null,
      }),
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
    const unsupportedVehicleFactRequest = isUnsupportedVehicleFactRequest(lastUser.content);
    const selectedVehicleDetailRequest = isSelectedVehicleDetailRequest(lastUser.content);
    if (unsupportedVehicleFactRequest) {
      deterministicUnsupportedFactAnswer = unsupportedVehicleFactAnswer(
        lastUser.content,
        selectedVehicleResult,
      );
    }
    if (selectedVehicleResult) {
      const selectedVehicle = selectedVehicleResult;
      selectedVehicleId = selectedVehicle.id;
      groundedVehicleIds.add(selectedVehicle.id);
      if (selectedVehicleDetailRequest) {
        deterministicSelectedVehicleAnswer = selectedVehicleDetailAnswer(
          lastUser.content,
          selectedVehicle,
        );
      }
      contextChunks.unshift({
        category:
          selectedVehicle.id === currentPageVehicleId
            ? "current-page"
            : "recent-selection",
        text: `${selectedVehicle.id === currentPageVehicleId ? "Current public page is" : "The visitor's most recently selected vehicle is"} the live vehicle ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.trim ? ` ${selectedVehicle.trim}` : ""}. Exact vehicleId: ${selectedVehicle.id}. Price: $${selectedVehicle.price.toLocaleString()}. Mileage: ${selectedVehicle.mileage === null ? "not listed" : `${selectedVehicle.mileage.toLocaleString()} mi`}. Drivetrain: ${selectedVehicle.drivetrain || "not listed"}. Fuel: ${selectedVehicle.fuelType || "not listed"}. Location: ${selectedVehicle.sellerCity && selectedVehicle.sellerState ? `${selectedVehicle.sellerCity}, ${selectedVehicle.sellerState}` : "not listed"}.`,
        score: 2,
      });
    } else if (selectedVehicleDetailRequest) {
      deterministicSelectedVehicleUnavailableAnswer = "I don’t have a selected vehicle to answer that about yet. Open a listing or tell me which result you mean, and I’ll check its verified details.";
    }

    if (facetResult.error) {
      captureError("api/chat/vehicle-facets", facetResult.error, {
        tenantId: tenant.tenantId,
      });
    }
    const vocabulary = vehicleFilterVocabulary(facetResult.data);
    const extractedFilters = unsupportedVehicleFactRequest || selectedVehicleDetailRequest
      ? {}
      : extractVehicleFilters(lastUser.content, [], vocabulary);
    extractedInventoryFilters = extractedFilters;
    const hasInventoryIntent = !unsupportedVehicleFactRequest && !selectedVehicleDetailRequest && (
      isVehicleQuery(lastUser.content, vocabulary) ||
      Object.keys(extractedFilters).length > 0 ||
      Boolean(conversationState.resultSet && (isOrdinalVehicleReference(lastUser.content) || isSelectedVehicleActionRequest(lastUser.content) || isPresentationRequest(lastUser.content))) ||
      hasScopeResetIntent(lastUser.content)
    );
    const stateTransition = transitionInventoryState(
      conversationState,
      lastUser.content,
      extractedFilters,
      hasInventoryIntent,
    );
    conversationState = stateTransition.state;
    stateRules = stateTransition.rules;
    statePresentationRequest = stateTransition.useStoredResultSet;
    stateOrdinalVehicleId = ordinalResultSetVehicleId(
      lastUser.content,
      conversationState.resultSet,
    );
    stateSelectedVehicleId = selectedResultSetVehicleId(
      lastUser.content,
      conversationState,
    );
    const stateReferencedVehicleId = stateOrdinalVehicleId ?? stateSelectedVehicleId;

    if (stateTransition.useStoredResultSet) {
      filters = conversationState.activeFilters;
      groundedInventoryFilters = filters;
      for (const id of conversationState.resultSet?.orderedIds ?? []) groundedVehicleIds.add(id);
      totalMatched = conversationState.resultSet?.totalCount;
    }

    if (stateReferencedVehicleId) {
      const selected = await getTenantVehicle(
        supabase,
        tenant.tenantId,
        stateReferencedVehicleId,
      );
      if (selected && vehicleSatisfiesActiveFilters(selected, conversationState.activeFilters)) {
        selectedVehicleId = selected.id;
        groundedVehicleIds.add(selected.id);
        groundedVehicles = [selected];
        conversationState = selectConversationVehicle(conversationState, selected.id);
        if (!isOrdinalVehicleActionRequest(lastUser.content) && !isSelectedVehicleActionRequest(lastUser.content)) {
          deterministicOrdinalReferenceAnswer = ordinalVehicleReferenceAnswer(
            lastUser.content,
            selected,
          );
        }
      } else {
        stateOrdinalVehicleId = null;
        stateSelectedVehicleId = null;
        deterministicOrdinalUnavailableAnswer = "That result no longer satisfies your active filters, so I haven’t opened it. Would you like to relax a constraint or see the current matches?";
      }
    } else if (isOrdinalVehicleReference(lastUser.content) || isSelectedVehicleActionRequest(lastUser.content)) {
      deterministicOrdinalUnavailableAnswer = isTruncatedLastOrdinalReference(
        lastUser.content,
        conversationState.resultSet,
      )
        ? `There are ${conversationState.resultSet?.totalCount ?? "more"} matching vehicles, but I only have the current result page safely anchored here. Please choose first, second, or third—or narrow the search.`
        : "I don’t have a current result list to safely resolve that reference. Please tell me what you’d like to search for.";
    }

    if (stateTransition.shouldQuery) {
      // Let Postgres filter the complete tenant inventory. Pulling
      // ".select(*)" here silently hit PostgREST's row cap on larger tenants
      // and could turn a real make into a false zero-result answer.
      filters = conversationState.activeFilters;
      const match = await queryTenantVehicles(supabase, tenant.tenantId, {
        ...vehicleQueryFromFilters(filters),
        limit: 30,
      });
      matchedVehicles = match.vehicles;
      groundedVehicles = matchedVehicles;
      groundedInventoryFilters = filters;
      for (const vehicle of matchedVehicles) groundedVehicleIds.add(vehicle.id);
      totalMatched = match.totalCount ?? matchedVehicles.length;
      if (totalMatched === 0 && conversationState.resultSet) {
        conversationState = preserveResultSetForZeroResults(conversationState);
        deterministicZeroResultAnswer = zeroResultAnswer(filters);
      } else {
        conversationState = setConversationResultSet(
          conversationState,
          matchedVehicles,
          totalMatched,
        );
      }
      deterministicAvailabilityAnswer = availabilityAnswerFromGroundedInventory(
        lastUser.content,
        filters,
        matchedVehicles,
        totalMatched,
      );
      if (
        !deterministicAvailabilityAnswer &&
        totalMatched > 0 &&
        (isDirectInventoryPresentationRequest(lastUser.content, filters) ||
          isInventoryRecommendationRequest(lastUser.content))
      ) {
        deterministicInventoryAnswer = isInventoryRecommendationRequest(lastUser.content)
          ? inventoryRecommendationAnswer(matchedVehicles, totalMatched)
          : inventoryResultAnswer(matchedVehicles, totalMatched);
        deterministicInventoryAction = inventoryFilterAction(filters);
      }
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

  const stateActions: BotAction[] = [
    ...((stateOrdinalVehicleId && isOrdinalVehicleActionRequest(lastUser.content)) || stateSelectedVehicleId
      ? [{
        type: "navigate-target",
        targetKey: "vehicle-detail",
        params: { vehicleId: stateOrdinalVehicleId ?? stateSelectedVehicleId! },
      } satisfies BotAction]
      : []),
    ...(deterministicInventoryAction ? [deterministicInventoryAction] : []),
  ];
  const deterministicActions = chatActionsEnabled
    ? [...stateActions, ...((deterministicOrdinalReferenceAnswer || deterministicOrdinalUnavailableAnswer || deterministicUnsupportedFactAnswer) ? [] : resolveDeterministicConciergeNavigation({
        messages: modelMessages,
        targets: conciergeTargets,
        selectedVehicleId,
        groundedVehicles,
        inventoryFilters: groundedInventoryFilters,
        capabilities: persona.capabilities,
      }))]
    : [];
  const hasDeterministicActions = deterministicActions.length > 0;
  const filterConversationActions = (actions: readonly BotAction[]): BotAction[] => {
    const decision = filterActionsByConversationStateWithDiagnostics(
      actions,
      conversationState,
      stateOrdinalVehicleId || stateSelectedVehicleId
        ? [stateOrdinalVehicleId ?? stateSelectedVehicleId!]
        : [],
    );
    if (decision.dropped.length > 0) {
      captureDebug("api/chat/actions", {
        tenantId: tenant.tenantId,
        actionsDropped: decision.dropped,
      });
    }
    return decision.allowed;
  };
  captureDebug("api/chat/conversation-state", {
    tenantId: tenant.tenantId,
    extractedFilters: extractedInventoryFilters,
    activeFiltersBefore: conversationStateBefore.activeFilters,
    activeFiltersAfter: conversationState.activeFilters,
    resultSetBefore: conversationStateBefore.resultSet
      ? { totalCount: conversationStateBefore.resultSet.totalCount, orderedIds: conversationStateBefore.resultSet.orderedIds }
      : null,
    resultSetAfter: conversationState.resultSet
      ? { totalCount: conversationState.resultSet.totalCount, orderedIds: conversationState.resultSet.orderedIds }
      : null,
    deterministicActions: deterministicActions.map((action) => ({ type: action.type, vehicleId: action.type === "navigate-target" ? action.params?.vehicleId : undefined })),
    rules: stateRules,
  });
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
    sessionId: visitorTurn?.sessionId ?? anonymousConversationId ?? undefined,
  });

  if (isImmediateSiteNavigation(deterministicActions) || statePresentationRequest || deterministicAvailabilityAnswer || deterministicInventoryAnswer || deterministicZeroResultAnswer || deterministicOrdinalUnavailableAnswer || deterministicOrdinalReferenceAnswer || deterministicSelectedVehicleAnswer || deterministicSelectedVehicleUnavailableAnswer || deterministicUnsupportedFactAnswer || deterministicClarifier) {
    const actions = prepareBotActionsForClient(
      filterGroundedVehicleActions(
        filterConversationActions(
          groundLeadCaptureActions(
            filterPlanAllowedActions(chatActionsEnabled, deterministicActions, persona.capabilities),
            modelMessages,
          ),
        ),
        conciergeTargets,
        groundedVehicleIds,
      ),
      conciergeTargets,
      actionAttribution,
    );
    const visibleContent = deterministicClarifier ?? deterministicZeroResultAnswer ?? deterministicOrdinalUnavailableAnswer ?? deterministicOrdinalReferenceAnswer ?? deterministicSelectedVehicleAnswer ?? deterministicSelectedVehicleUnavailableAnswer ?? deterministicUnsupportedFactAnswer ?? deterministicAvailabilityAnswer ?? deterministicInventoryAnswer ?? actionOnlyAcknowledgement(actions);
    captureDebug("api/chat/actions", {
      tenantId: tenant.tenantId,
      actionsEmitted: actionDebugSummary(actions),
    });
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
            conversationState,
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

  // Premium intelligence levels are plan-gated ("chat.premium_models"): a
  // stored premium selection is clamped to the base model when the tenant's
  // plan no longer entitles it (e.g. after a downgrade). Selection-time
  // enforcement lives in the persona save action; this is the runtime gate.
  const planClampedModelId =
    isPremiumConciergeModel(botRuntimeConfig.modelId) &&
    !tenantPlan.entitlements["chat.premium_models"]
      ? DEFAULT_CONCIERGE_MODEL_ID
      : botRuntimeConfig.modelId;
  const chatProvider = resolveChatProvider(planClampedModelId);
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
        filterConversationActions(
          groundLeadCaptureActions(
            filterPlanAllowedActions(chatActionsEnabled, modelActions, persona.capabilities),
            modelMessages,
          ),
        ),
        conciergeTargets,
        groundedVehicleIds,
      ),
      conciergeTargets,
      actionAttribution,
    );
    const visibleContent =
      filteredContent || actionOnlyAcknowledgement(actions);
    captureDebug("api/chat/actions", {
      tenantId: tenant.tenantId,
      actionsEmitted: actionDebugSummary(actions),
    });
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
            conversationState,
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
        if (action.type === "compare_vehicles") {
          for (const vehicleId of action.vehicleIds) groundedVehicleIds.add(vehicleId);
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
          filterConversationActions(
            groundLeadCaptureActions(
              filterPlanAllowedActions(chatActionsEnabled, initialActions, persona.capabilities),
              modelMessages,
            ),
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
      captureDebug("api/chat/actions", {
        tenantId: tenant.tenantId,
        actionsEmitted: actionDebugSummary(emittedActions),
      });

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
            filterConversationActions(
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
        captureDebug("api/chat/actions", {
          tenantId: tenant.tenantId,
          actionsEmitted: actionDebugSummary(emittedActions),
        });
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
            conversationState,
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

function priorVisitorQueries(messages: readonly MemoryMessage[]): string[] {
  const queries = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  queries.pop();
  return queries;
}

function previousAssistantContentForLastUser(
  messages: readonly MemoryMessage[],
): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role !== "user") continue;
    const previous = messages[index - 1];
    return previous?.role === "assistant" ? previous.content : null;
  }
  return null;
}

function resolveAnonymousConversationId(
  requested: string | undefined,
  startNewSession: boolean,
): string {
  if (!startNewSession && requested && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requested)) {
    return requested;
  }
  return crypto.randomUUID();
}

/** Answer direct availability questions from the verified inventory match set. */
function availabilityAnswerFromGroundedInventory(
  userText: string,
  filters: ReturnType<typeof extractVehicleFilters>,
  vehicles: readonly Vehicle[],
  totalMatched: number,
): string | null {
  const isAvailabilityQuestion = /\b(?:do you have|you have|have any|are there|is there|any)\b/i.test(userText);
  if (!isAvailabilityQuestion || (!filters.make && !filters.model)) return null;

  const requested = [
    filters.year,
    filters.make,
    filters.model,
  ].filter((value): value is string | number => value !== undefined).join(" ") || "matching vehicles";

  if (totalMatched === 0) return `No — there are no ${requested} vehicles in inventory right now.`;

  const count = `${totalMatched} matching ${requested} vehicle${totalMatched === 1 ? "" : "s"}`;
  const examples = vehicles.slice(0, 3).map((vehicle) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    return `${label} — Est. $${vehicle.price.toLocaleString()}.`;
  });
  return `Yes — ${count} ${totalMatched === 1 ? "is" : "are"} available.${examples.length ? ` ${examples.join(" ")}` : ""}`;
}

function isDirectInventoryPresentationRequest(
  userText: string,
  filters: ReturnType<typeof extractVehicleFilters>,
): boolean {
  if (Object.keys(filters).length === 0) return false;
  if (/\b(?:do you have|you have|have any|are there|is there)\b/i.test(userText)) return false;
  return /\b(?:show|find|browse|list|inventory|under|over|between|budget|looking|need|want|cars?|vehicles?|cheapest|least\s+expensive|most\s+expensive|lowest|highest)\b/i.test(userText);
}

function inventoryResultAnswer(
  vehicles: readonly Vehicle[],
  totalMatched: number,
): string {
  const examples = vehicles.slice(0, 3).map((vehicle, index) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    return `${index + 1}. ${label} — Est. $${vehicle.price.toLocaleString()}`;
  });
  return `${totalMatched} matching vehicle${totalMatched === 1 ? "" : "s"} found.${examples.length ? ` ${examples.join(" · ")}.` : ""}`;
}

/** Recommendation language must not make the model invent market or condition claims. */
function isInventoryRecommendationRequest(userText: string): boolean {
  return /\b(?:recommend(?:ation)?|suggest(?:ion)?|help\s+me\s+choose|which\s+(?:one|vehicle|car)\s+(?:should|would)|best\s+(?:one|vehicle|car|bmw|toyota|suv|sedan))\b/i.test(userText);
}

function inventoryRecommendationAnswer(
  vehicles: readonly Vehicle[],
  totalMatched: number,
): string {
  const examples = vehicles.slice(0, 3).map((vehicle, index) => {
    const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
      .filter(Boolean)
      .join(" ");
    const details = [
      `Est. $${vehicle.price.toLocaleString()}`,
      vehicle.mileage === null ? null : `${vehicle.mileage.toLocaleString()} mi`,
      vehicle.bodyStyle || null,
      vehicle.drivetrain || null,
    ].filter((value): value is string => Boolean(value));
    return `${index + 1}. ${label} — ${details.join(" · ")}`;
  });
  return `${totalMatched} verified matching vehicle${totalMatched === 1 ? "" : "s"} are available. ${examples.join(" · ")}. Tell me your budget, preferred body style, or mileage target and I’ll narrow the list.`;
}

/** A non-navigational ordinal follow-up is answered from the stored result, never a fresh query. */
function ordinalVehicleReferenceAnswer(userText: string, vehicle: Vehicle): string {
  const ordinal = /\b(first|second|third|last)\s+(?:one|vehicle|car|listing)\b/i.exec(userText)?.[1]?.toLowerCase() ?? "selected";
  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const details = [
    vehicle.mileage !== null ? `${vehicle.mileage.toLocaleString()} mi` : null,
    vehicle.drivetrain || null,
    vehicle.sellerCity && vehicle.sellerState ? `${vehicle.sellerCity}, ${vehicle.sellerState}` : null,
  ].filter((value): value is string => Boolean(value));
  return `The ${ordinal} result is ${label} — Est. $${vehicle.price.toLocaleString()}${details.length ? ` · ${details.join(" · ")}` : ""}.`;
}

function selectedVehicleDetailAnswer(userText: string, vehicle: Vehicle): string {
  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .filter(Boolean)
    .join(" ");
  const requestedDrivetrain = /\b(?:awd|fwd|rwd)\b/i.exec(userText)?.[0]?.toUpperCase();
  if (requestedDrivetrain) {
    const listed = vehicle.drivetrain || "not listed";
    return listed.toUpperCase() === requestedDrivetrain
      ? `Yes — ${label} is listed as ${listed}.`
      : `No — ${label} is listed as ${listed}.`;
  }
  if (/\bhow\s+many\s+(?:miles|mileage)\b/i.test(userText)) {
    return vehicle.mileage === null
      ? `${label} does not have mileage listed in the current inventory data.`
      : `${label} is listed with ${vehicle.mileage.toLocaleString()} miles.`;
  }
  const details = [
    `Est. $${vehicle.price.toLocaleString()}`,
    vehicle.mileage === null ? null : `${vehicle.mileage.toLocaleString()} mi`,
    vehicle.drivetrain || null,
    vehicle.fuelType || null,
    vehicle.sellerCity && vehicle.sellerState ? `${vehicle.sellerCity}, ${vehicle.sellerState}` : null,
  ].filter((value): value is string => Boolean(value));
  return `${label} — ${details.join(" · ")}.`;
}

function unsupportedVehicleFactAnswer(
  userText: string,
  vehicle: Vehicle | null,
): string {
  const rawTopic = /\b(?:reliab(?:le|ility)|accident|carfax|history|condition|maintenance|service\s+records?|heated\s+seats?|ventilated\s+seats?|options?|features?)\b/i.exec(userText)?.[0]?.toLowerCase();
  const topic = rawTopic?.startsWith("reliab") ? "reliability"
    : rawTopic ?? "that detail";
  const label = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")
    : null;
  return `I don’t have verified ${topic} information${label ? ` for ${label}` : " in the current inventory data"}, so I won’t guess. I can help with the listed price, mileage, drivetrain, fuel type, and location—or you can contact the seller to confirm it.`;
}

function inventoryFilterAction(
  filters: ReturnType<typeof extractVehicleFilters>,
): BotAction {
  return {
    type: "filter_inventory",
    ...(filters.make ? { make: filters.make } : {}),
    ...(filters.model ? { model: filters.model } : {}),
    ...(filters.bodyStyle ? { bodyStyle: filters.bodyStyle } : {}),
    ...(filters.stockType ? { stockType: filters.stockType } : {}),
    ...(filters.fuelType ? { fuelType: filters.fuelType } : {}),
    ...(filters.drivetrain ? { drivetrain: filters.drivetrain } : {}),
    ...(filters.sellerState ? { sellerState: filters.sellerState } : {}),
    ...(filters.sellerCity ? { sellerCity: filters.sellerCity } : {}),
    ...(filters.year !== undefined ? { yearMin: filters.year, yearMax: filters.year } : {}),
    ...(filters.year === undefined && filters.yearMin !== undefined ? { yearMin: filters.yearMin } : {}),
    ...(filters.year === undefined && filters.yearMax !== undefined ? { yearMax: filters.yearMax } : {}),
    ...(filters.mileageMax !== undefined ? { mileageMax: filters.mileageMax } : {}),
    ...(filters.priceMin !== undefined ? { priceMin: filters.priceMin } : {}),
    ...(filters.priceMax !== undefined ? { priceMax: filters.priceMax } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
  };
}

/** Keep a refinement honest without silently widening to all inventory. */
function zeroResultAnswer(filters: ReturnType<typeof extractVehicleFilters>): string {
  // Every active facet must appear, so a refinement that eliminated the last
  // match is named. Omitting e.g. drivetrain made "no BMW SUV under $70k" read
  // as if none exist, when one does and is only excluded by the AWD filter.
  const yearLabel =
    filters.year !== undefined ? String(filters.year)
      : filters.yearMin !== undefined && filters.yearMax !== undefined ? `${filters.yearMin}–${filters.yearMax}`
        : filters.yearMin !== undefined ? `${filters.yearMin} or newer`
          : filters.yearMax !== undefined ? `${filters.yearMax} or older`
            : undefined;
  const mileageLabel = filters.mileageMax !== undefined
    ? `under ${filters.mileageMax.toLocaleString()} miles`
    : undefined;
  const location = [filters.sellerCity, filters.sellerState].filter(Boolean).join(", ");
  const locationLabel = location ? `in ${location}` : undefined;
  const constraints = [
    yearLabel,
    filters.stockType,
    filters.drivetrain,
    filters.fuelType,
    filters.make,
    filters.model,
    filters.bodyStyle,
    mileageLabel,
    priceConstraintLabel(filters),
    locationLabel,
  ].filter((value): value is string => Boolean(value));
  const description = constraints.length > 0 ? constraints.join(" ") : "that refinement";
  return `Nothing matches ${description} right now. I’ve kept your previous results in place rather than widening the search—would you like to relax a constraint?`;
}

function priceConstraintLabel(filters: ReturnType<typeof extractVehicleFilters>): string | undefined {
  if (filters.priceMin !== undefined && filters.priceMax !== undefined) {
    return `between $${filters.priceMin.toLocaleString()} and $${filters.priceMax.toLocaleString()}`;
  }
  if (filters.priceMax !== undefined) return `under $${filters.priceMax.toLocaleString()}`;
  if (filters.priceMin !== undefined) return `over $${filters.priceMin.toLocaleString()}`;
  return undefined;
}

function actionDebugSummary(actions: readonly BotAction[]): Array<Record<string, string | undefined>> {
  return actions.map((action) => ({
    type: action.type,
    vehicleId: action.type === "navigate-target"
      ? action.params?.vehicleId
      : action.type === "highlight-vehicle" || action.type === "open-lead-form" || action.type === "capture_lead"
        ? action.vehicleId
        : undefined,
  }));
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
