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
import type {
  BotAction,
  ChatRequest,
  RetrievedChunk,
  Vehicle,
} from "@lume/types";
import { after } from "next/server";
import {
  createAnonServerClient,
  createServiceClient,
  type ServerSupabaseClient,
} from "@lume/db/server";
import {
  getTenantVehicle,
  queryTenantVehicles,
  quotaExceededPayload,
  quotaResponseHeaders,
  resolveTenantPlan,
} from "@lume/db";

// Supabase is hosted in Ireland. Pin only the latency-sensitive public chat
// route there instead of moving unrelated admin work away from its defaults.
export const preferredRegion = "dub1";

import {
  ConversationMemoryConflictError,
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
  MAX_CONCIERGE_RESULT_LIMIT,
  mergeTrustedVehicleQuery,
  retrieveByKeywords,
  vehicleQueryFromFilters,
  type VehicleQueryFilters,
} from "@lume/rag";
import { createOllamaEmbedder, retrieveHybridContext } from "@lume/rag/server";
import { getTenantFromRequestCached } from "@/lib/tenant";
import { settle, unwrapSettled } from "@/lib/settled";
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
  suppressRedundantInventoryNavigationActions,
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
  buildInterpreterContext,
  isShadowInterpretationEnabled,
} from "@/lib/chatInterpretationShadow";
import { runShadowInterpretation } from "@/lib/chatInterpretationRunner.server";
import { CHAT_INTERPRETATION_SCHEMA_VERSION } from "@/lib/chatInterpretation";
import {
  compileChatInterpretation,
  isResolvedContextualInterpretationEnabled,
} from "@/lib/chatInterpretationExecution";
import {
  TurnStopwatch,
  buildClientTurnTiming,
  buildTurnTimingProperties,
  nextInstanceTurn,
  queueTurnTimingEvent,
  type ClientTurnTiming,
  type TurnTimingOutcome,
} from "@/lib/conciergeTurnTiming";
import {
  claimConversationTurn,
  conversationMemoryKey,
  getConversationMemoryStore,
  conversationMemoryMode,
  isConversationMemoryDegraded,
} from "@/lib/conversationMemory.server";
import {
  captureConciergeTranscript,
  captureDebug,
  captureError,
  recordChatInterpretationShadow,
  recordConciergeTurn,
  recordModelUsage,
} from "@/lib/observability";
import {
  writeInternalConciergeTrace,
  type ConciergeTraceSource,
} from "@/lib/conciergeTrace.server";
import {
  type DeterministicAnswers,
  hasDeterministicAnswer,
  resolveDeterministicContent,
  winningDeterministicRule,
} from "@/lib/chatDeterministicAnswer";
import { shouldGroundSelectedVehicle } from "@/lib/chatGroundingScope";
import {
  deterministicSourceCategories,
  inventoryFilterAction,
  selectedVehicleDetailAnswer,
  unsupportedVehicleFactAnswer,
} from "@/lib/chatAnswers";
import {
  resolveCompareOutcome,
  resolveInventoryOutcome,
  resolveReferenceOutcome,
} from "@/lib/chatDeterministicRules";
import { tenantLiveVehicleCount } from "@/lib/tenantInventoryCount";
import {
  backNavigationReply,
  decideBackNavigation,
  detectBackNavigationRequest,
  isInventoryResultsPath,
  normalizeChatNavigationContext,
  type BackNavigationDecision,
} from "@/lib/chatBackNavigation";
import {
  NO_ACTION_TRUTHFUL_CORRECTION,
  claimsCompletedSiteAction,
  truthfulReplyForEmittedActions,
} from "@/lib/chatActionClaims";
import {
  compareOrdinalIndexesFromText,
  filterActionsByConversationStateWithDiagnostics,
  hasFullInventoryResetIntent,
  hasScopeResetIntent,
  isAmbiguousAffirmation,
  isAmbiguousMakeSwitchRequest,
  isOrdinalVehicleActionRequest,
  isOrdinalVehicleReference,
  isPresentationRequest,
  isSelectedVehicleActionRequest,
  isSelectedVehicleDetailRequest,
  isUnsupportedVehicleFactRequest,
  normalizeConversationInventoryState,
  ordinalResultSetVehicleId,
  preserveResultSetForZeroResults,
  selectConversationVehicle,
  selectedResultSetVehicleId,
  setConversationResultSet,
  transitionInventoryState,
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
  const turnStartedAtMs = Date.now();
  // Speed telemetry: one stopwatch per turn, marked at each stage. Content-free
  // and off the response path (see lib/conciergeTurnTiming).
  const timing = new TurnStopwatch();
  const instanceTurn = nextInstanceTurn();
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

  // One id per turn. The browser generates it so a retried delivery of the
  // SAME turn carries the SAME id and is recognised as a duplicate rather than
  // appended twice; a server-generated id could never do that. It is opaque
  // and namespaced by the conversation key, so it grants nothing on its own —
  // and a malformed or missing one simply falls back.
  const clientRequestId = normalizeClientRequestId(body.requestId);
  const requestId = clientRequestId ?? crypto.randomUUID();

  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return json({ error: "messages must be a non-empty array" }, 400, request);
  }
  if (body.messages.length > MAX_MESSAGES) {
    return json({ error: `messages must be ≤ ${MAX_MESSAGES}` }, 400, request);
  }

  // Drop client-supplied system messages. Sanitize assistant history as
  // untrusted display text so an older leaked provider/action protocol cannot
  // be replayed into a future model turn.
  const rawConversationMessages: MemoryMessage[] = body.messages.flatMap(
    (message): MemoryMessage[] =>
      message.role === "user" || message.role === "assistant"
        ? [
            {
              role: message.role,
              content: String(message.content ?? "").slice(
                0,
                MAX_USER_CONTENT_LENGTH,
              ),
            },
          ]
        : [],
  );
  const historyVehicleId = recentVehicleIdFromAssistantHistory(
    rawConversationMessages,
  );
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

  // Resolve tenant. Briefly cached per slug for this route only; see
  // getTenantFromRequestCached for why that is safe.
  const tenant = await getTenantFromRequestCached(request);
  if (!tenant) {
    return json({ error: "Unknown or inactive tenant" }, 404, request);
  }
  timing.mark("tenant");
  let timingReported = false;
  let deferredTimingOutcome: TurnTimingOutcome | null = null;
  const timingContext = (outcome: TurnTimingOutcome) => ({
    ...outcome,
    requestId,
    clientRequestId: clientRequestId !== null,
    tenantId: tenant.tenantId,
    memoryMode: conversationMemoryMode(),
    instanceTurn,
  });
  const queueServerTiming = (outcome: TurnTimingOutcome): void => {
    if (timingReported) return;
    timingReported = true;
    queueTurnTimingEvent(
      tenant.tenantId,
      buildTurnTimingProperties(
        timingContext(outcome),
        timing.snapshot(),
        timing.elapsed(),
      ),
    );
  };
  /**
   * Close the turn's stopwatch and return the payload for the browser's
   * `timing` SSE event. The authoritative server event is queued now, or —
   * when work continues after [DONE] (the tool path's memory commit) —
   * deferred until `finalizeDeferredTiming()`, so it includes that work.
   */
  const reportTurnTiming = (
    outcome: TurnTimingOutcome,
    options: { deferServerEvent?: boolean } = {},
  ): ClientTurnTiming => {
    timing.mark("done");
    const clientTiming = buildClientTurnTiming(
      timingContext(outcome),
      timing.snapshot(),
      timing.elapsed(),
    );
    if (options.deferServerEvent) deferredTimingOutcome = outcome;
    else queueServerTiming(outcome);
    return clientTiming;
  };
  const finalizeDeferredTiming = (): void => {
    if (deferredTimingOutcome) queueServerTiming(deferredTimingOutcome);
  };
  const reportTurnError = (status: number, errorStage: string): void => {
    reportTurnTiming({
      conversationId: null,
      turn: null,
      route: "error",
      status,
      errorStage,
    });
  };

  // Build the tenant-scoped system prompt. Keyword + fuzzy retrieval over
  // this tenant's chunks — no embedder needed. When the corpus outgrows
  // in-memory scoring (~thousands of chunks), swap retrieveByKeywords()
  // for retrieveContext() from @lume/rag/server + an embedder.
  const supabase = createServiceClient();
  // The quota decision comes first and alone: a refused caller must cost one
  // quota check, not the tenant reads below. Nothing speculative starts until
  // it has approved the turn.
  const quota = await checkPublicApiQuota(
    tenant.tenantId,
    "chat_requests",
    supabase,
  );
  timing.mark("quota");
  if (!quota.allowed) {
    reportTurnError(429, "quota");
    return json(quotaExceededPayload(quota), 429, request);
  }
  const quotaHeaders = quotaResponseHeaders(quota);

  // Once approved, every read that depends only on the tenant starts together
  // rather than one round trip after another. The facet and early-vehicle
  // reads are consumed later, after conversation memory, so they are settled:
  // an early failure cannot surface as an unhandled rejection, and it is
  // re-thrown at the exact point the sequential code used to await it — a
  // failed read still fails the turn where it always did. The reads are
  // side-effect free; on a duplicate delivery their results are discarded.
  //
  // The facet RPC is the bounded tenant vocabulary filter extraction needs to
  // recognize a make/model this turn. Extraction vocabulary must be
  // tenant-wide, never narrowed by the previous turn's active scope. With BMW
  // active, p_make:"BMW" excluded "Camry" from the model vocabulary, so the
  // next explicit "2026 Camry" query extracted only the year and silently
  // retained BMW. Filters are applied by queryTenantVehicles later; vocabulary
  // discovery is deliberately scope-independent.
  const facetRead = settle(
    supabase.rpc("vehicle_facets_v2", {
      p_tenant_id: tenant.tenantId,
      p_make: null,
      p_state: null,
    }),
  );
  // The open vehicle page always wins the selected-vehicle candidate order
  // below, unless the visitor asked to reset scope, so when it is present its
  // row can be read now instead of after conversation memory.
  const earlySelectedVehicleId = hasScopeResetIntent(lastUser.content)
    ? null
    : vehicleIdFromPublicPagePath(body.pagePath);
  const earlySelectedVehicleRead = earlySelectedVehicleId
    ? settle(getTenantVehicle(supabase, tenant.tenantId, earlySelectedVehicleId))
    : null;

  // Persona (admin-configured voice + capabilities); degrades to the default
  // persona — chat never fails because persona storage is missing.
  const [persona, botRuntimeConfig, visitor, targetRegistry, tenantPlan] =
    await Promise.all([
      loadActivePersona(supabase, tenant.tenantId),
      loadTenantBotRuntimeConfig(supabase, tenant.tenantId),
      resolveVisitor(request, tenant.tenantId, supabase).catch(() => null),
      loadConciergeTargets(supabase, tenant.tenantId),
      resolveTenantPlan(supabase, tenant.tenantId),
    ]);
  timing.mark("config");
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
  const planClampedModelId =
    isPremiumConciergeModel(botRuntimeConfig.modelId) &&
    !tenantPlan.entitlements["chat.premium_models"]
      ? DEFAULT_CONCIERGE_MODEL_ID
      : botRuntimeConfig.modelId;
  const chatProvider = resolveChatProvider(planClampedModelId);
  const contextualInterpretationEnabled =
    isResolvedContextualInterpretationEnabled(tenant.slug, chatProvider);
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
  // Take the turn's in-flight lease before doing anything expensive. Only a
  // client-supplied id can be duplicated — a server-generated one is unique by
  // construction — so there is nothing to claim without one, and skipping it
  // keeps the old behaviour and one round trip for legacy callers.
  const turnClaim =
    memoryKey && clientRequestId
      ? await claimConversationTurn(memoryKey, clientRequestId)
      : null;
  if (turnClaim && !turnClaim.granted) {
    // Another delivery of this exact turn is already running. Answering it
    // again would pay for a second generation and could emit a second set of
    // actions. The response deliberately carries no assistant text: the
    // delivery that holds the lease is producing it.
    captureDebug("api/chat/duplicate-turn", {
      tenantId: tenant.tenantId,
      claimScope: turnClaim.scope,
    });
    recordConciergeTurn({
      surface: "public",
      requestId,
      tenantId: tenant.tenantId,
      conversationId: anonymousConversationId ?? null,
      route: "duplicate",
      clientRequestId: true,
      // No model was called. That is the point of the lease.
      model: null,
      memoryDegraded: isConversationMemoryDegraded(),
      timingsMs: { total: Date.now() - turnStartedAtMs },
    });
    reportTurnTiming({
      conversationId: anonymousConversationId ?? null,
      turn: null,
      route: "duplicate",
    });
    return duplicateTurnResponse(request, quotaHeaders);
  }

  const remembered = memoryKey
    ? await memoryStore.get(memoryKey).catch((error: unknown) => {
        captureError("api/chat/memory-read", error, {
          tenantId: tenant.tenantId,
        });
        return null;
      })
    : null;
  // The version this turn read. Committing against it makes a late turn lose
  // to the newer one that already landed, instead of overwriting it.
  timing.mark("memory");
  const expectedStateVersion = remembered?.stateVersion ?? 0;
  // Only true when a CONFIGURED shared store has failed. A deployment with no
  // shared store at all is not degraded — it never promised cross-instance
  // continuity in the first place.
  const memoryDegraded = isConversationMemoryDegraded();
  /**
   * One writer for every response path.
   *
   * A conflict is the expected outcome when two turns of one conversation
   * race: the newer turn's state stands and this turn's write is dropped
   * rather than clobbering it. That costs this turn's transcript entry, which
   * is the cheaper loss.
   */
  const persistTurnMemory = async (
    update: Parameters<typeof memoryStore.append>[1],
  ): Promise<"committed" | "conflict" | "skipped" | "failed"> => {
    if (!memoryKey) return "skipped";
    try {
      await memoryStore.append(memoryKey, {
        ...update,
        requestId,
        expectedStateVersion,
      });
      return "committed";
    } catch (error: unknown) {
      if (error instanceof ConversationMemoryConflictError) {
        captureDebug("api/chat/memory-conflict", {
          tenantId: tenant.tenantId,
          expectedStateVersion,
          actualStateVersion: error.actualStateVersion,
        });
        return "conflict";
      }
      captureError("api/chat/memory-write", error, {
        tenantId: tenant.tenantId,
      });
      return "failed";
    }
  };
  let conversationState: ConversationInventoryState =
    normalizeConversationInventoryState(remembered?.conversationState);
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
  const previousAssistantContent =
    previousAssistantContentForLastUser(modelMessages);
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
  // A scope-reset turn ("back to the whole inventory") abandons the current
  // selection entirely — grounding the model in the previously selected (or
  // currently displayed) vehicle invites it to narrate the old vehicle
  // instead of honoring the reset (live-reproduced 2026-07-23, session
  // 2c19e8d4 turn 4: Jeep detail text duplicated, on a full-reset turn).
  const scopeResetRequested = hasScopeResetIntent(lastUser.content);
  // "go back" is a whole-message site command, not an inventory query: when it
  // matches, no inventory rule, interpreter or ordinal may act on the turn.
  const backNavigationRequest = detectBackNavigationRequest(lastUser.content);
  let fullInventoryResetRequested = hasFullInventoryResetIntent(
    lastUser.content,
  );
  const turnNowMs = Date.now();
  const selectedVehicleCandidate = scopeResetRequested
    ? null
    : (currentPageVehicleId ??
      // Keep "tell me more about it" grounded even before navigation finishes
      // and updates pagePath. This ID was created only from the verified
      // current result set by selectConversationVehicle().
      conversationState.selectedVehicleId ??
      recentVehicleIdFromToolResults(remembered?.toolResults ?? []) ??
      rememberedHistoryVehicleId ??
      historyVehicleId);

  const groundedVehicleIds = new Set<string>();
  let groundedVehicles: Vehicle[] = [];
  let groundedInventoryFilters: ReturnType<
    typeof extractVehicleFilters
  > | null = null;
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
  let deterministicMakeSwitchClarifier: string | null = null;
  let deterministicCompareAnswer: string | null = null;
  let deterministicCompareUnavailableAnswer: string | null = null;
  let stateOrdinalVehicleId: string | null = null;
  let stateSelectedVehicleId: string | null = null;
  let statePresentationRequest = false;
  let extractedInventoryFilters: ReturnType<typeof extractVehicleFilters> = {};
  let stateRules: string[] = [];
  let selectedVehicleId: string | null = null;
  let deterministicUserText = lastUser.content;
  let activeInterpretationResult: Awaited<
    ReturnType<typeof runShadowInterpretation>
  > | null = null;
  let activeInterpretationApplied = false;
  let interpretedClearFilters: readonly (keyof VehicleQueryFilters)[] = [];
  let chatLoyaltyContext: Awaited<ReturnType<typeof loadChatLoyaltyContext>> =
    null;
  let visitorPreferenceContext: Awaited<
    ReturnType<typeof loadVisitorPreferenceContext>
  > = null;
  // Deferred model-prompt inputs. Computed on the deterministic pass (they
  // depend on state that only exists there) but consumed only if this turn
  // actually reaches the model.
  let selectedVehicleChunk: RetrievedChunk | null = null;
  let groundSelectedVehicleChunk = false;
  try {
    // Only the reads a deterministic rule can actually need happen here. The
    // document corpus, loyalty context and visitor preferences feed the model
    // system prompt and nothing else (see loadModelPromptContext below), so
    // fetching them for an ordinal, a "show me", or a reset was pure waste on
    // the highest-frequency turns. They are loaded lazily on the model path.
    //
    // The facet RPC stays unconditional (started with the tenant reads above).
    const [selectedVehicleResult, facetResult] = await Promise.all([
      selectedVehicleCandidate
        ? selectedVehicleCandidate === earlySelectedVehicleId &&
          earlySelectedVehicleRead
          ? unwrapSettled(earlySelectedVehicleRead)
          : getTenantVehicle(supabase, tenant.tenantId, selectedVehicleCandidate)
        : Promise.resolve(null),
      unwrapSettled(facetRead),
    ]);
    const unsupportedVehicleFactRequest = isUnsupportedVehicleFactRequest(
      lastUser.content,
    );
    const selectedVehicleDetailRequest = isSelectedVehicleDetailRequest(
      lastUser.content,
    );
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
      // Built here, injected below — the decision to inject needs the
      // extracted filters, which are not known until the facet vocabulary has
      // been read a few lines further down.
      selectedVehicleChunk = {
        category:
          selectedVehicle.id === currentPageVehicleId
            ? "current-page"
            : "recent-selection",
        text: `${selectedVehicle.id === currentPageVehicleId ? "Current public page is" : "The visitor's most recently selected vehicle is"} the live vehicle ${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}${selectedVehicle.trim ? ` ${selectedVehicle.trim}` : ""}. Exact vehicleId: ${selectedVehicle.id}. Price: $${selectedVehicle.price.toLocaleString()}. Mileage: ${selectedVehicle.mileage === null ? "not listed" : `${selectedVehicle.mileage.toLocaleString()} mi`}. Drivetrain: ${selectedVehicle.drivetrain || "not listed"}. Fuel: ${selectedVehicle.fuelType || "not listed"}. Location: ${selectedVehicle.sellerCity && selectedVehicle.sellerState ? `${selectedVehicle.sellerCity}, ${selectedVehicle.sellerState}` : "not listed"}.`,
        score: 2,
      };
    } else if (selectedVehicleDetailRequest) {
      deterministicSelectedVehicleUnavailableAnswer =
        "I don’t have a selected vehicle to answer that about yet. Open a listing or tell me which result you mean, and I’ll check its verified details.";
    }

    if (facetResult.error) {
      captureError("api/chat/vehicle-facets", facetResult.error, {
        tenantId: tenant.tenantId,
      });
    }
    const vocabulary = vehicleFilterVocabulary(facetResult.data);
    let extractedFilters =
      unsupportedVehicleFactRequest ||
      selectedVehicleDetailRequest ||
      backNavigationRequest
        ? {}
        : extractVehicleFilters(lastUser.content, [], vocabulary);
    let hasInventoryIntent =
      !backNavigationRequest &&
      !unsupportedVehicleFactRequest &&
      !selectedVehicleDetailRequest &&
      (isVehicleQuery(lastUser.content, vocabulary) ||
        Object.keys(extractedFilters).length > 0 ||
        Boolean(
          conversationState.resultSet &&
          (isOrdinalVehicleReference(lastUser.content) ||
            isSelectedVehicleActionRequest(lastUser.content) ||
            isPresentationRequest(lastUser.content)),
        ) ||
        hasScopeResetIntent(lastUser.content));

    // Phase 3 active canary: ask the bounded interpreter only when the
    // established deterministic vocabulary found no inventory intent at all.
    // Accepted plans are compiled back into this same deterministic pipeline;
    // malformed, unsupported or mixed plans fall through unchanged.
    if (
      contextualInterpretationEnabled &&
      chatProvider &&
      !backNavigationRequest &&
      !hasInventoryIntent &&
      !unsupportedVehicleFactRequest &&
      !selectedVehicleDetailRequest &&
      !deterministicClarifier
    ) {
      activeInterpretationResult = await timing.span("interpretation", () =>
        runShadowInterpretation({
          provider: chatProvider,
          userMessage: lastUser.content,
          context: buildInterpreterContext({
            state: conversationState,
            deterministicFilters: extractedFilters,
          }),
          deterministic: {
            kind: "unsupported",
            filters: {},
            hasReference: false,
          },
        }),
      );
      recordChatInterpretationShadow({
        mode: "active",
        requestId,
        tenantId: tenant.tenantId,
        provider: chatProvider.profile.provider,
        modelId: chatProvider.profile.id,
        schemaVersion: CHAT_INTERPRETATION_SCHEMA_VERSION,
        outcome: activeInterpretationResult.outcome,
        durationMs: activeInterpretationResult.durationMs,
        usage: activeInterpretationResult.usage,
        comparison: activeInterpretationResult.comparison,
      });
      recordModelUsage({
        route: "api/chat/interpretation",
        tenantId: tenant.tenantId,
        provider: chatProvider.profile.provider,
        requestedModelId: botRuntimeConfig.modelId,
        effectiveModelId: chatProvider.profile.id,
        clamped: planClampedModelId !== botRuntimeConfig.modelId,
        fellBack: chatProvider.fellBack,
      });
      const compiled = activeInterpretationResult.candidate
        ? compileChatInterpretation(
            activeInterpretationResult.candidate,
            lastUser.content,
          )
        : null;
      if (compiled) {
        activeInterpretationApplied = true;
        deterministicUserText = compiled.userText;
        extractedFilters = compiled.filters;
        interpretedClearFilters = compiled.clearFilters;
        hasInventoryIntent = compiled.hasInventoryIntent;
        deterministicMakeSwitchClarifier = compiled.clarification;
        fullInventoryResetRequested = hasFullInventoryResetIntent(
          deterministicUserText,
        );
        stateRules.push(compiled.rule);
      }
    }
    extractedInventoryFilters = extractedFilters;
    // Inject the open vehicle only when the turn is plausibly still about it.
    // pagePath keeps pointing at a vehicle for the rest of the session, so
    // without this the first and highest-scored chunk on "show me your SUVs"
    // was a full description of the BMW the visitor happened to have open —
    // and the GROUNDING RULE then faithfully kept the model on that BMW.
    if (
      selectedVehicleChunk &&
      shouldGroundSelectedVehicle({
        hasInventoryIntent,
        extractedFilters,
        activeFilters: conversationState.activeFilters,
        isSelectedVehicleDetailRequest: selectedVehicleDetailRequest,
        isOrdinalReference: isOrdinalVehicleReference(deterministicUserText),
        isSelectedVehicleAction: isSelectedVehicleActionRequest(
          deterministicUserText,
        ),
      })
    ) {
      groundSelectedVehicleChunk = true;
    }

    const stateTransition = transitionInventoryState(
      conversationState,
      deterministicUserText,
      extractedFilters,
      hasInventoryIntent,
      { nowMs: turnNowMs, clearFilters: interpretedClearFilters },
    );
    conversationState = stateTransition.state;
    stateRules = [...stateRules, ...stateTransition.rules];
    statePresentationRequest = stateTransition.useStoredResultSet;
    stateOrdinalVehicleId = backNavigationRequest
      ? null
      : ordinalResultSetVehicleId(
          deterministicUserText,
          conversationState.resultSet,
        );
    stateSelectedVehicleId = backNavigationRequest
      ? null
      : selectedResultSetVehicleId(deterministicUserText, conversationState);
    const stateReferencedVehicleId =
      stateOrdinalVehicleId ?? stateSelectedVehicleId;

    if (
      !deterministicMakeSwitchClarifier &&
      isAmbiguousMakeSwitchRequest(deterministicUserText, extractedFilters)
    ) {
      // Ambiguous make switch: the reset already cleared the scope in state.
      // Ask which make — do NOT query, and do NOT let the model volunteer the
      // old make's grounded results underneath its own clarifying question.
      deterministicMakeSwitchClarifier =
        "Of course — which make would you like to see instead? Or ask for the full inventory and I’ll show you everything.";
    }

    // Comparisons of result-set positions ("compare the first two") resolve
    // from the stored, verified list — never from the model improvising.
    const compareIndexes =
      stateReferencedVehicleId || backNavigationRequest
      ? null
      : compareOrdinalIndexesFromText(deterministicUserText);
    if (compareIndexes) {
      const orderedIds = conversationState.resultSet?.orderedIds ?? [];
      // Fetch only when the indexes are in range; resolveCompareOutcome
      // rejects the out-of-range cases without needing the vehicles.
      const inRange =
        orderedIds.length > 0 &&
        !compareIndexes.some((index) => index >= orderedIds.length);
      const fetched = inRange
        ? await Promise.all(
            compareIndexes.map((index) =>
              getTenantVehicle(supabase, tenant.tenantId, orderedIds[index]!),
            ),
          )
        : [];
      const outcome = resolveCompareOutcome({
        compareIndexes,
        orderedIds,
        fetched,
        activeFilters: conversationState.activeFilters,
        memoryDegraded,
      });
      if (outcome.kind === "compared") {
        deterministicCompareAnswer = outcome.answer;
        for (const id of outcome.groundedVehicleIds) groundedVehicleIds.add(id);
      } else {
        deterministicCompareUnavailableAnswer = outcome.answer;
      }
    }

    if (stateTransition.useStoredResultSet && memoryDegraded) {
      // "show me" re-presents a stored list. During an outage this process
      // cannot know the list is this visitor's, so it must not be shown.
      statePresentationRequest = false;
      deterministicOrdinalUnavailableAnswer =
        "I’ve lost the thread of which results I showed you, so I can’t bring that list back. Tell me what you’d like to see and I’ll search again.";
    } else if (stateTransition.useStoredResultSet) {
      filters = conversationState.activeFilters;
      groundedInventoryFilters = filters;
      for (const id of conversationState.resultSet?.orderedIds ?? [])
        groundedVehicleIds.add(id);
      totalMatched = conversationState.resultSet?.totalCount;
      // A bare "show me" is deterministic continuation of the verified list,
      // so it must emit the same UI filter action as a fresh inventory query.
      // Without this, the early deterministic response path could reach
      // actionOnlyAcknowledgement([]), producing an empty SSE message after a
      // model-led "go back" turn.
      deterministicInventoryAction = inventoryFilterAction(filters);
    }

    const referenceOutcome = resolveReferenceOutcome({
      userText: deterministicUserText,
      referencedVehicleId: stateReferencedVehicleId,
      fetched: stateReferencedVehicleId
        ? await getTenantVehicle(
            supabase,
            tenant.tenantId,
            stateReferencedVehicleId,
          )
        : null,
      activeFilters: conversationState.activeFilters,
      resultSet: conversationState.resultSet,
      hasOrdinalOrSelectionPhrase:
        !backNavigationRequest &&
        (isOrdinalVehicleReference(deterministicUserText) ||
          isSelectedVehicleActionRequest(deterministicUserText)),
      attemptedZeroResult: conversationState.attemptedZeroResult,
      memoryDegraded,
    });
    if (referenceOutcome.kind === "resolved") {
      const selected = referenceOutcome.vehicle;
      selectedVehicleId = selected.id;
      groundedVehicleIds.add(selected.id);
      groundedVehicles = [selected];
      conversationState = selectConversationVehicle(
        conversationState,
        selected.id,
      );
      deterministicOrdinalReferenceAnswer = referenceOutcome.answer;
    } else if (referenceOutcome.kind === "unavailable") {
      if (memoryDegraded) {
        // The refusal above only covers the prose. stateActions below builds a
        // navigate-target straight from these ids, so clearing them is what
        // actually stops a stale position becoming a navigation.
        stateOrdinalVehicleId = null;
        stateSelectedVehicleId = null;
      }
      if (stateReferencedVehicleId) {
        // The id resolved but no longer satisfies the filters: forget it, so a
        // later navigation cannot act on a vehicle the visitor filtered away.
        stateOrdinalVehicleId = null;
        stateSelectedVehicleId = null;
      }
      deterministicOrdinalUnavailableAnswer = referenceOutcome.answer;
    }

    if (stateTransition.shouldQuery && !deterministicMakeSwitchClarifier) {
      // Let Postgres filter the complete tenant inventory. Pulling
      // ".select(*)" here silently hit PostgREST's row cap on larger tenants
      // and could turn a real make into a false zero-result answer.
      filters = conversationState.activeFilters;
      const requestedLimit = Math.min(
        Math.max(1, filters.limit ?? 30),
        MAX_CONCIERGE_RESULT_LIMIT,
      );
      const queryFilters = filters;
      const match = await timing.span("inventory_query", () =>
        queryTenantVehicles(supabase, tenant.tenantId, {
          ...vehicleQueryFromFilters(queryFilters),
          // A ranked visitor request ("top 10") is a real bounded result set,
          // not merely wording for the model. The result snapshot, ordinal
          // references, and public inventory action all receive this same cap.
          limit: requestedLimit,
        }),
      );
      matchedVehicles = match.vehicles;
      groundedVehicles = matchedVehicles;
      groundedInventoryFilters = filters;
      for (const vehicle of matchedVehicles) groundedVehicleIds.add(vehicle.id);
      const catalogMatched = match.totalCount ?? matchedVehicles.length;
      totalMatched = filters.limit === undefined
        ? catalogMatched
        : Math.min(catalogMatched, requestedLimit);

      const inventoryOutcome = resolveInventoryOutcome({
        userText: deterministicUserText,
        filters,
        matchedVehicles,
        totalMatched,
        hasPriorResultSet: conversationState.resultSet !== null,
        fullInventoryResetRequested,
      });

      if (inventoryOutcome.rollBackToPreviousFilters) {
        // Roll back to the filters that were active before this turn — a
        // zero-yield refinement must not compound into the next turn, and the
        // public inventory link should keep pointing at the last filters that
        // actually returned matches, not the dead combination just attempted.
        conversationState = preserveResultSetForZeroResults(
          conversationState,
          conversationStateBefore.activeFilters,
        );
        groundedInventoryFilters = conversationStateBefore.activeFilters;
      } else {
        conversationState = setConversationResultSet(
          conversationState,
          matchedVehicles,
          totalMatched,
        );
      }

      deterministicZeroResultAnswer = inventoryOutcome.zeroResult;
      deterministicAvailabilityAnswer = inventoryOutcome.availability;
      deterministicInventoryAnswer = inventoryOutcome.inventory;
      if (inventoryOutcome.filterAction) {
        deterministicInventoryAction = inventoryOutcome.filterAction;
      }
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "state resolution failure";
    captureError("api/chat/state-build", err, {
      tenantId: tenant.tenantId,
      detail: message,
    });
    reportTurnError(500, "state_build");
    return json(
      { error: "Failed to build context" },
      500,
      request,
      quotaHeaders,
    );
  }

  const stateResolvedAtMs = Date.now();
  timing.mark("state");

  // Decided after state resolution, from server-held facts only: the
  // browser's two history booleans choose wording, and the fallback is this
  // conversation's verified result set (withheld while shared memory is
  // degraded, when it may not be this visitor's). Never a URL.
  const backNavigation: BackNavigationDecision | null = backNavigationRequest
    ? decideBackNavigation({
        request: backNavigationRequest,
        navigation: normalizeChatNavigationContext(body.navigation),
        currentPageIsInventory: isInventoryResultsPath(body.pagePath),
        fallback:
          !memoryDegraded && conversationState.resultSet
            ? (inventoryFilterAction(
                conversationState.resultSet.filtersApplied,
              ) as Extract<BotAction, { type: "filter_inventory" }>)
            : null,
      })
    : null;

  const stateActions: BotAction[] = [
    ...((stateOrdinalVehicleId &&
      isOrdinalVehicleActionRequest(deterministicUserText)) ||
    stateSelectedVehicleId
      ? [
          {
            type: "navigate-target",
            targetKey: "vehicle-detail",
            params: {
              vehicleId: stateOrdinalVehicleId ?? stateSelectedVehicleId!,
            },
          } satisfies BotAction,
        ]
      : []),
    ...(deterministicInventoryAction ? [deterministicInventoryAction] : []),
  ];
  const deterministicActions = backNavigation
    ? // A back request is answered by the back rule alone: no ordinal, filter
      // or registry navigation may ride along with it.
      chatActionsEnabled && backNavigation.kind === "action"
      ? [backNavigation.action]
      : []
    : chatActionsEnabled
    ? [
        ...stateActions,
        ...(deterministicOrdinalReferenceAnswer ||
        deterministicOrdinalUnavailableAnswer ||
        deterministicUnsupportedFactAnswer ||
        deterministicMakeSwitchClarifier ||
        deterministicCompareAnswer ||
        deterministicCompareUnavailableAnswer
          ? []
          : resolveDeterministicConciergeNavigation({
              messages: modelMessages,
              targets: conciergeTargets,
              selectedVehicleId,
              groundedVehicles,
              inventoryFilters: groundedInventoryFilters,
              capabilities: persona.capabilities,
            })),
      ]
    : [];
  const hasDeterministicActions = deterministicActions.length > 0;
  // Action *types* only. Params carry vehicle ids, which belong in the
  // debug-gated line below, not in always-on telemetry.
  const droppedActionTypes: string[] = [];
  const filterConversationActions = (
    actions: readonly BotAction[],
  ): BotAction[] => {
    const decision = filterActionsByConversationStateWithDiagnostics(
      actions,
      conversationState,
      stateOrdinalVehicleId || stateSelectedVehicleId
        ? [stateOrdinalVehicleId ?? stateSelectedVehicleId!]
        : [],
    );
    if (decision.dropped.length > 0) {
      for (const dropped of decision.dropped) {
        droppedActionTypes.push(
          typeof (dropped as { type?: unknown }).type === "string"
            ? (dropped as { type: string }).type
            : "unknown",
        );
      }
      captureDebug("api/chat/actions", {
        tenantId: tenant.tenantId,
        actionsDropped: decision.dropped,
      });
    }
    return decision.allowed;
  };
  const inventoryQueryStatus = (): "not_run" | "success" | "empty" =>
    matchedVehicles === undefined
      ? "not_run"
      : (totalMatched ?? matchedVehicles.length) === 0
        ? "empty"
        : "success";
  // One stable id per turn's log lines (transcript + conversation-state +
  // actions debug) so independent anonymous sessions can be distinguished
  // during state-isolation investigations.
  const transcriptSessionId =
    visitorTurn?.sessionId ?? anonymousConversationId ?? "unknown";
  captureDebug("api/chat/conversation-state", {
    tenantId: tenant.tenantId,
    conversationSessionId: transcriptSessionId,
    extractedFilters: extractedInventoryFilters,
    activeFiltersBefore: conversationStateBefore.activeFilters,
    activeFiltersAfter: conversationState.activeFilters,
    lastInventoryActivityAtBefore:
      conversationStateBefore.lastInventoryActivityAt,
    lastInventoryActivityAtAfter: conversationState.lastInventoryActivityAt,
    resultSetBefore: conversationStateBefore.resultSet
      ? {
          totalCount: conversationStateBefore.resultSet.totalCount,
          orderedIds: conversationStateBefore.resultSet.orderedIds,
        }
      : null,
    resultSetAfter: conversationState.resultSet
      ? {
          totalCount: conversationState.resultSet.totalCount,
          orderedIds: conversationState.resultSet.orderedIds,
        }
      : null,
    deterministicActions: deterministicActions.map((action) => ({
      type: action.type,
      vehicleId:
        action.type === "navigate-target"
          ? action.params?.vehicleId
          : undefined,
    })),
    rules: stateRules,
  });
  const cors = corsHeadersFor(request);
  // Source categories describe what actually grounded THIS answer, so they
  // are built per path. A deterministic answer is rendered from verified
  // inventory rows and never from the document corpus — which is exactly why
  // the corpus is no longer fetched for those turns.
  const buildSseHeaders = (sourceCategories: readonly string[]) =>
    new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Source-Categories": sourceCategories.join(","),
      ...quotaHeaders,
      ...cors,
    });
  const buildMetaEvent = (
    sourceCategories: readonly string[],
    sourceHandles: readonly {
      handle: string;
      title: string;
      revision: number | null;
      publishedAt: string | null;
    }[] = [],
  ) =>
    sseEvent({
      type: "meta",
      sourceCategories,
      sourceHandles,
      botName: persona.name,
      // Capability level for client display only — enforcement is the
      // server-side plan gate above, never this hint.
      capabilities: { actions: chatActionsEnabled },
      sessionId: visitorTurn?.sessionId ?? anonymousConversationId ?? undefined,
      // Lets the browser tie this stream to the turn it started, so a
      // superseded stream's actions can be recognised and dropped.
      requestId,
    });

  // Precedence lives in lib/chatDeterministicAnswer.ts, where it is an ordered
  // array with pairwise tests. The guard and the selection below read that one
  // definition, so they cannot drift apart the way two hand-written
  // expressions over the same twelve variables could.
  const deterministicAnswers: DeterministicAnswers = {
    clarifier: deterministicClarifier,
    // Placeholder that opens the deterministic path; the visible wording is
    // re-derived below from the actions that actually survived every gate.
    navigateBack: backNavigation ? backNavigationReply(backNavigation, []) : null,
    makeSwitchClarifier: deterministicMakeSwitchClarifier,
    compare: deterministicCompareAnswer,
    compareUnavailable: deterministicCompareUnavailableAnswer,
    zeroResult: deterministicZeroResultAnswer,
    ordinalUnavailable: deterministicOrdinalUnavailableAnswer,
    ordinalReference: deterministicOrdinalReferenceAnswer,
    selectedVehicle: deterministicSelectedVehicleAnswer,
    selectedVehicleUnavailable: deterministicSelectedVehicleUnavailableAnswer,
    unsupportedFact: deterministicUnsupportedFactAnswer,
    availability: deterministicAvailabilityAnswer,
    inventory: deterministicInventoryAnswer,
  };
  const deterministicGuardContext = {
    immediateSiteNavigation: isImmediateSiteNavigation(deterministicActions),
    statePresentationRequest,
  };

  if (hasDeterministicAnswer(deterministicAnswers, deterministicGuardContext)) {
    const sourceCategories = deterministicSourceCategories({
      queriedInventory: matchedVehicles !== undefined,
      groundedVehicleCount: groundedVehicleIds.size,
    });
    const sseHeaders = buildSseHeaders(sourceCategories);
    const metaEvent = buildMetaEvent(sourceCategories);
    const actions = suppressRedundantInventoryNavigationActions(prepareBotActionsForClient(
      filterGroundedVehicleActions(
        filterConversationActions(
          groundLeadCaptureActions(
            filterPlanAllowedActions(
              chatActionsEnabled,
              deterministicActions,
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
    ));
    const actionAcknowledgement = actionOnlyAcknowledgement(actions);
    const visibleContent =
      backNavigation &&
      winningDeterministicRule(deterministicAnswers) === "navigateBack"
        ? backNavigationReply(backNavigation, actions)
        : resolveDeterministicContent(deterministicAnswers, {
            ...deterministicGuardContext,
            actionAcknowledgement,
          });
    captureDebug("api/chat/actions", {
      tenantId: tenant.tenantId,
      actionsEmitted: actionDebugSummary(actions),
    });
    captureConciergeTranscript({
      sessionId: transcriptSessionId,
      tenantId: tenant.tenantId,
      turn: conversationState.turn,
      userText: lastUser.content,
      assistantText: visibleContent,
      source: activeInterpretationApplied ? "interpreted" : "deterministic",
      actions: actionDebugSummary(actions),
    });
    queueInternalConciergeTrace({
      client: supabase,
      tenantId: tenant.tenantId,
      requestId,
      conversationId: transcriptSessionId,
      turn: conversationState.turn,
      source: activeInterpretationApplied ? "interpreted" : "deterministic",
      userMessage: lastUser.content,
      assistantResponse: visibleContent,
      stateBefore: conversationStateBefore,
      stateAfter: conversationState,
      actions,
      retrieval: { sourceCategories, totalMatched: totalMatched ?? null },
      model: activeInterpretationResult && chatProvider
        ? { provider: chatProvider.profile.provider, modelId: chatProvider.profile.id }
        : {},
    });
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        // This path knows its whole answer before it streams anything, so it
        // can commit first and close the stale-action race at the source: if
        // a newer turn already owns the conversation, this turn's actions are
        // never emitted at all. The model paths cannot do this — their prose
        // arrives token by token, and buffering it to commit first would
        // delay the visitor's first word by the whole generation.
        const persisted = visibleContent
          ? await timing.span("memory_commit", () =>
              persistTurnMemory({
                messages: [
                  lastUser,
                  { role: "assistant", content: visibleContent },
                ],
                conversationState,
              }),
            )
          : "skipped";
        const supersededByNewerTurn = persisted === "conflict";

        timing.mark("first_byte");
        controller.enqueue(encoder.encode(metaEvent));
        if (!supersededByNewerTurn) {
          for (const action of actions) {
            timing.mark("first_action");
            controller.enqueue(
              encoder.encode(sseEvent({ type: "action", action })),
            );
          }
        }
        if (visibleContent) {
          timing.mark("first_text");
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
        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: "timing",
              timing: reportTurnTiming({
                conversationId: transcriptSessionId,
                turn: conversationState.turn,
                route: activeInterpretationApplied ? "interpreted" : "deterministic",
                model:
                  activeInterpretationResult && chatProvider
                    ? {
                        provider: chatProvider.profile.provider,
                        id: chatProvider.profile.id,
                        fellBack: chatProvider.fellBack,
                        calls: 1,
                      }
                    : null,
                queryStatus: inventoryQueryStatus(),
                resultCount: totalMatched ?? null,
                actionTypes: supersededByNewerTurn
                  ? []
                  : actions.map((action) => action.type),
                ruleCodes: stateRules,
              }),
            }),
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    recordConciergeTurn({
      surface: "public",
      requestId,
      tenantId: tenant.tenantId,
      conversationId: transcriptSessionId,
      turn: conversationState.turn,
      route: activeInterpretationApplied ? "interpreted" : "deterministic",
      clientRequestId: clientRequestId !== null,
      ruleCodes: stateRules,
      clarification: Boolean(
        deterministicClarifier || deterministicMakeSwitchClarifier,
      ),
      query: {
        status: inventoryQueryStatus(),
        totalCount: totalMatched ?? null,
      },
      actions: {
        emitted: actions.map((action) => action.type),
        dropped: droppedActionTypes,
      },
      model:
        activeInterpretationResult && chatProvider
          ? {
              provider: chatProvider.profile.provider,
              requestedModelId: botRuntimeConfig.modelId,
              effectiveModelId: chatProvider.profile.id,
              clamped: planClampedModelId !== botRuntimeConfig.modelId,
              fellBack: chatProvider.fellBack,
              calls: 1,
            }
          : null,
      usage:
        activeInterpretationResult?.usage &&
        (activeInterpretationResult.usage.inputTokens !== null ||
          activeInterpretationResult.usage.outputTokens !== null)
          ? { ...activeInterpretationResult!.usage, coversCalls: 1 }
          : undefined,
      timingsMs: {
        state: stateResolvedAtMs - turnStartedAtMs,
        total: Date.now() - turnStartedAtMs,
      },
      memoryDegraded: isConversationMemoryDegraded(),
    });
    return new Response(stream, { headers: sseHeaders });
  }

  // Premium intelligence levels are plan-gated ("chat.premium_models"): a
  // stored premium selection is clamped to the base model when the tenant's
  // plan no longer entitles it (e.g. after a downgrade). Selection-time
  // enforcement lives in the persona save action; this is the runtime gate.
  if (chatProvider) {
    // Highest-volume model path in the product; without this, provider
    // invoices cannot be attributed to a tenant.
    recordModelUsage({
      route: "api/chat",
      tenantId: tenant.tenantId,
      provider: chatProvider.profile.provider,
      requestedModelId: botRuntimeConfig.modelId,
      effectiveModelId: chatProvider.profile.id,
      clamped: planClampedModelId !== botRuntimeConfig.modelId,
      fellBack: chatProvider.fellBack,
    });
  }
  if (!chatProvider) {
    reportTurnError(503, "provider_unconfigured");
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

  // ── Deferred model-prompt context ────────────────────────────────────────
  // Everything loaded here feeds the system prompt and nothing else, so it is
  // fetched only once a turn is known to need the model. An ordinal, a
  // "show me", a reset, a compare or a selected-vehicle detail answer returns
  // above and never pays for the corpus, the loyalty read, the preference
  // read, image descriptions or the inventory count.
  let assembled: ReturnType<typeof assembleSystemPrompt>;
  try {
    const matchedIds = (matchedVehicles ?? [])
      .slice(0, 20)
      .map((vehicle) => vehicle.id);
    // All five inputs are independent reads, so they share one round trip
    // instead of three sequential ones. Assembly below keeps the original
    // chunk order exactly.
    const [
      contextChunks,
      loadedLoyaltyContext,
      loadedPreferenceContext,
      imageDescriptions,
      totalInventory,
    ] = await Promise.all([
      loadPublishedKnowledgeContext(
        supabase,
        tenant.tenantId,
        lastUser.content,
      ),
      visitor
        ? loadChatLoyaltyContext(supabase, tenant.tenantId, visitor)
        : Promise.resolve(null),
      visitor
        ? loadVisitorPreferenceContext(supabase, {
            tenantId: tenant.tenantId,
            visitorId: visitor.id,
          })
        : Promise.resolve(null),
      matchedIds.length > 0
        ? supabase
            .from("vehicle_images")
            .select("vehicle_id, ai_description")
            .eq("tenant_id", tenant.tenantId)
            .eq("is_primary", true)
            .eq("ai_description_status", "completed")
            .in("vehicle_id", matchedIds)
            .then(({ data }) => data ?? [])
        : Promise.resolve([]),
      // Without this the prompt omitted "Total vehicles in full inventory"
      // entirely, so with a filter active the model could only see TOTAL
      // MATCHING — and "how many cars do you have?" got answered as "how many
      // match your filters". Cached per tenant; a failure leaves it undefined
      // and the line is omitted exactly as before.
      tenantLiveVehicleCount(tenant.tenantId, async (tenantId) => {
        const { count, error } = await supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .neq("status", "archived")
          .is("sold_at", null);
        return error ? undefined : (count ?? undefined);
      }),
    ]);
    chatLoyaltyContext = loadedLoyaltyContext;
    visitorPreferenceContext = loadedPreferenceContext;
    // Same ordering as before the split: retrieved chunks, the open vehicle
    // in front of them when the turn is still about it, image descriptions
    // appended for the vehicles this turn actually matched.
    if (groundSelectedVehicleChunk && selectedVehicleChunk) {
      contextChunks.unshift(selectedVehicleChunk);
    }
    if (matchedVehicles !== undefined) {
      for (const image of imageDescriptions) {
        if (!image.ai_description) continue;
        const vehicle = matchedVehicles.find(
          (candidate) => candidate.id === image.vehicle_id,
        );
        if (vehicle)
          contextChunks.push({
            category: "vehicle-image",
            text: `Primary image for ${vehicle.year} ${vehicle.make} ${vehicle.model}: ${image.ai_description}`,
            score: 1,
          });
      }
    }

    assembled = assembleSystemPrompt({
      basePrompt: personaBasePrompt(persona, tenantName),
      contextChunks,
      matchedVehicles,
      totalMatched,
      filters,
      totalInventory,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "RAG failure";
    captureError("api/chat/context-build", err, {
      tenantId: tenant.tenantId,
      detail: message,
    });
    reportTurnError(500, "context_build");
    return json(
      { error: "Failed to build context" },
      500,
      request,
      quotaHeaders,
    );
  }

  const contextLoadedAtMs = Date.now();
  timing.mark("context");
  const sseHeaders = buildSseHeaders(assembled.sourceCategories);
  const metaEvent = buildMetaEvent(
    assembled.sourceCategories,
    assembled.sourceHandles,
  );

  const systemMessage = {
    role: "system" as const,
    content: `${assembled.prompt}${loyaltySystemPrompt(chatLoyaltyContext)}${visitorPreferenceSystemPrompt(visitorPreferenceContext)}${conversationMemoryToolPrompt(remembered?.toolResults ?? [])}${conciergeTargetSystemPrompt(!chatActionsEnabled || persona.capabilities.navigate === false ? [] : conciergeTargets)}\n${actionSystemPrompt(chatActionsEnabled ? persona.capabilities : CHAT_ACTIONS_DISABLED_CAPABILITIES, enabledToolNames)}`,
  };

  // ── Phase 3 shadow interpretation (default OFF) ───────────────────────────
  // Reaching here means the deterministic layer could NOT resolve this turn,
  // which is exactly the population the contextual interpreter exists to
  // improve. The candidate plan is generated, compared and discarded: it
  // cannot execute an action, touch memory, or change one byte of the
  // response. `after()` starts the observation once the response lifecycle is
  // complete, so a slow or timed-out experiment cannot add latency to the
  // visitor. It is still lifecycle-managed by Next/Vercel rather than an
  // unawaited promise that a serverless instance may discard.
  const shadowInterpretationScheduled =
    !contextualInterpretationEnabled &&
    isShadowInterpretationEnabled(tenant.slug);
  if (shadowInterpretationScheduled) {
    const shadowInput = {
      provider: chatProvider,
      userMessage: lastUser.content,
      context: buildInterpreterContext({
        state: conversationState,
        deterministicFilters: extractedInventoryFilters,
      }),
      deterministic: {
        // The deterministic layer got far enough to extract filters but not
        // far enough to answer, which is the disagreement worth measuring.
        kind: statePresentationRequest
          ? ("present" as const)
          : ("search" as const),
        filters: conversationState.activeFilters,
        hasReference: Boolean(stateOrdinalVehicleId ?? stateSelectedVehicleId),
      },
    };
    after(async () => {
      const result = await runShadowInterpretation(shadowInput);
      recordChatInterpretationShadow({
        mode: "shadow",
        requestId,
        tenantId: tenant.tenantId,
        provider: chatProvider.profile.provider,
        modelId: chatProvider.profile.id,
        schemaVersion: CHAT_INTERPRETATION_SCHEMA_VERSION,
        outcome: result.outcome,
        durationMs: result.durationMs,
        usage: result.usage,
        comparison: result.comparison,
      });
    });
  }

  // ── Phase 1: non-streaming call with tools ────────────────────────────────
  // parseToolCalls expects the non-streamed message.tool_calls shape; if the
  // model answers in prose we re-emit its content as SSE below, so the client
  // contract is identical either way.
  const modelStartedAtMs = Date.now();
  const phase1StartedAt = timing.reading();
  /**
   * A provider call that fails at the network level (DNS, TLS, reset)
   * throws instead of returning a status. Time it as one error turn, then
   * re-throw so the response is exactly what it was before.
   */
  const providerFetch = async (
    stage: "provider_transport_phase_1" | "provider_transport_phase_2",
    startedAt: number,
    init: RequestInit,
  ): Promise<Response> => {
    try {
      return await fetch(chatProvider.apiUrl, init);
    } catch (error) {
      timing.addSpan(
        stage === "provider_transport_phase_1" ? "model_phase1" : "model_stream",
        timing.reading() - startedAt,
      );
      reportTurnError(502, stage);
      throw error;
    }
  };
  const phase1 = await providerFetch("provider_transport_phase_1", phase1StartedAt, {
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
    timing.addSpan("model_phase1", timing.reading() - phase1StartedAt);
    reportTurnError(phase1.status === 429 ? 429 : 502, "provider_phase_1");
    return json(
      { error: "AI provider request failed" },
      phase1.status === 429 ? 429 : 502,
      request,
      quotaHeaders,
    );
  }

  let phase1Message: ProviderAssistantMessage;
  let providerUsage: {
    inputTokens: number | null;
    outputTokens: number | null;
  } | null = null;
  try {
    const parsed = (await phase1.json()) as ProviderCompletion;
    const message = parsed.choices?.[0]?.message;
    if (!message) throw new Error("no choices in completion");
    providerUsage = parsed.usage
      ? {
          inputTokens: parsed.usage.prompt_tokens ?? null,
          outputTokens: parsed.usage.completion_tokens ?? null,
        }
      : null;
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
    timing.addSpan("model_phase1", timing.reading() - phase1StartedAt);
    reportTurnError(502, "provider_parse");
    return json(
      { error: "Malformed model response" },
      502,
      request,
      quotaHeaders,
    );
  }

  const modelCompletedAtMs = Date.now();
  timing.addSpan("model_phase1", timing.reading() - phase1StartedAt);
  timing.mark("model_response");
  const modelTimingOutcome = (
    route: "model" | "tool",
    emitted: readonly BotAction[],
    calls: number,
  ): TurnTimingOutcome => ({
    conversationId: transcriptSessionId,
    turn: conversationState.turn,
    route,
    model: {
      provider: chatProvider.profile.provider,
      id: chatProvider.profile.id,
      fellBack: chatProvider.fellBack,
      calls: calls + (activeInterpretationResult ? 1 : 0),
    },
    queryStatus: inventoryQueryStatus(),
    resultCount: totalMatched ?? null,
    actionTypes: emitted.map((action) => action.type),
    ruleCodes: stateRules,
  });
  /**
   * Both model paths report through here so their fields cannot drift.
   *
   * `total` is server time until the response begins streaming, not until the
   * last token: the handler returns a ReadableStream, so full-completion
   * duration is not observable at this point. Reporting it as total would
   * understate latency without saying so.
   */
  const recordModelTurn = (input: {
    route: "model" | "tool";
    emitted: readonly BotAction[];
    calls: number;
  }): void => {
    const interpretationUsage = activeInterpretationResult?.usage;
    const interpretationHasUsage = Boolean(
      interpretationUsage &&
      (interpretationUsage.inputTokens !== null ||
        interpretationUsage.outputTokens !== null),
    );
    const phaseOneHasUsage = Boolean(providerUsage);
    const inputTokens =
      interpretationHasUsage || phaseOneHasUsage
        ? (interpretationUsage?.inputTokens ?? 0) +
          (providerUsage?.inputTokens ?? 0)
        : null;
    const outputTokens =
      interpretationHasUsage || phaseOneHasUsage
        ? (interpretationUsage?.outputTokens ?? 0) +
          (providerUsage?.outputTokens ?? 0)
        : null;
    const interpretationCalls = activeInterpretationResult ? 1 : 0;
    const calls = input.calls + interpretationCalls;
    const coversCalls =
      (interpretationHasUsage ? 1 : 0) + (phaseOneHasUsage ? 1 : 0);
    recordConciergeTurn({
      surface: "public",
      requestId,
      tenantId: tenant.tenantId,
      conversationId: transcriptSessionId,
      turn: conversationState.turn,
      route: input.route,
      clientRequestId: clientRequestId !== null,
      ruleCodes: stateRules,
      query: {
        status: inventoryQueryStatus(),
        totalCount: totalMatched ?? null,
      },
      actions: {
        emitted: input.emitted.map((action) => action.type),
        dropped: droppedActionTypes,
      },
      model: {
        provider: chatProvider.profile.provider,
        requestedModelId: botRuntimeConfig.modelId,
        effectiveModelId: chatProvider.profile.id,
        clamped: planClampedModelId !== botRuntimeConfig.modelId,
        fellBack: chatProvider.fellBack,
        calls,
      },
      // Counted apart from the turn's own calls: an experiment's spend must
      // never be mistaken for the product's cost per answer.
      // The scheduled call is counted even if it later times out or returns a
      // malformed plan. Its detailed outcome is emitted by the after() task.
      shadowModelCalls: shadowInterpretationScheduled ? 1 : 0,
      // Phase 2 streams without stream_options.include_usage, so only the
      // phase-1 block is ever present. Absent => "unknown", never 0; present
      // on a two-call turn => "provider_partial", because reporting one call's
      // tokens as the turn's total is an undercount of real spend.
      usage:
        inputTokens !== null || outputTokens !== null
          ? { inputTokens, outputTokens, coversCalls }
          : undefined,
      timingsMs: {
        state: stateResolvedAtMs - turnStartedAtMs,
        context: contextLoadedAtMs - stateResolvedAtMs,
        model: modelCompletedAtMs - modelStartedAtMs,
        total: Date.now() - turnStartedAtMs,
      },
      memoryDegraded: isConversationMemoryDegraded(),
    });
  };

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
    const actions = suppressRedundantInventoryNavigationActions(prepareBotActionsForClient(
      filterGroundedVehicleActions(
        filterConversationActions(
          groundLeadCaptureActions(
            filterPlanAllowedActions(
              chatActionsEnabled,
              modelActions,
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
    ));
    // A model may not claim a page change it did not emit ("Done — I've
    // sent you back" with no action was a confirmed production failure).
    const truthful = truthfulReplyForEmittedActions(
      filteredContent || actionOnlyAcknowledgement(actions),
      actions.length,
    );
    if (truthful.replaced) stateRules.push("false_action_claim_replaced");
    const visibleContent = truthful.text;
    captureDebug("api/chat/actions", {
      tenantId: tenant.tenantId,
      actionsEmitted: actionDebugSummary(actions),
    });
    captureConciergeTranscript({
      sessionId: transcriptSessionId,
      tenantId: tenant.tenantId,
      turn: conversationState.turn,
      userText: lastUser.content,
      assistantText: visibleContent,
      source: "model",
      actions: actionDebugSummary(actions),
    });
    queueInternalConciergeTrace({
      client: supabase,
      tenantId: tenant.tenantId,
      requestId,
      conversationId: transcriptSessionId,
      turn: conversationState.turn,
      source: "model",
      userMessage: lastUser.content,
      assistantResponse: visibleContent,
      stateBefore: conversationStateBefore,
      stateAfter: conversationState,
      actions,
      retrieval: { sourceCategories: assembled.sourceCategories, totalMatched: totalMatched ?? null },
      model: { provider: chatProvider.profile.provider, modelId: chatProvider.profile.id },
    });
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        timing.mark("first_byte");
        controller.enqueue(encoder.encode(metaEvent));
        for (const action of actions) {
          timing.mark("first_action");
          controller.enqueue(
            encoder.encode(sseEvent({ type: "action", action })),
          );
        }
        if (visibleContent) {
          timing.mark("first_text");
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
          await timing.span("memory_commit", () =>
            persistTurnMemory({
              messages: [
                lastUser,
                { role: "assistant", content: visibleContent },
              ],
              conversationState,
            }),
          );
        }
        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: "timing",
              timing: reportTurnTiming(modelTimingOutcome("model", actions, 1)),
            }),
          ),
        );
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    recordModelTurn({ route: "model", emitted: actions, calls: 1 });
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
  const turn = await timing.span("tools", () =>
    runToolCalls(calls, ctx, {
      allowedToolNames: enabledToolNames,
    }),
  );
  const thinkingSteps = turnThinkingSteps(turn.steps);

  const phase2StartedAt = timing.reading();
  const phase2 = await providerFetch("provider_transport_phase_2", phase2StartedAt, {
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
    reportTurnError(phase2.status === 429 ? 429 : 502, "provider_phase_2");
    return json(
      { error: "AI provider request failed" },
      phase2.status === 429 ? 429 : 502,
      request,
      quotaHeaders,
    );
  }
  if (!phase2.body) {
    reportTurnError(502, "provider_no_body");
    return json({ error: "No upstream body" }, 502, request, quotaHeaders);
  }

  const upstreamBody = phase2.body;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      timing.mark("first_byte");
      controller.enqueue(encoder.encode(metaEvent));
      // These are fixed operational summaries of completed tool calls, not
      // model reasoning or chain-of-thought. Emit them before actions/prose.
      for (const text of thinkingSteps) {
        controller.enqueue(
          encoder.encode(sseEvent({ type: "thinking", text })),
        );
      }
      // Tool-emitted UI actions go out before the prose starts streaming so
      // the interface reacts (filters, highlights) while the model talks.
      for (const action of turn.actions) {
        if (action.type === "highlight-vehicle") {
          groundedVehicleIds.add(action.vehicleId);
        }
        if (action.type === "compare_vehicles") {
          for (const vehicleId of action.vehicleIds)
            groundedVehicleIds.add(vehicleId);
        }
      }
      const seenActionFingerprints = new Set<string>();
      const emittedActions: BotAction[] = [];
      const initialActions = hasDeterministicActions
        ? deterministicActions
        : filterModelNavigationActionsByUserIntent(turn.actions, modelMessages);
      for (const action of suppressRedundantInventoryNavigationActions(
        prepareBotActionsForClient(
        filterGroundedVehicleActions(
          filterConversationActions(
            groundLeadCaptureActions(
              filterPlanAllowedActions(
                chatActionsEnabled,
                initialActions,
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
        ),
        emittedActions,
      )) {
        controller.enqueue(
          encoder.encode(sseEvent({ type: "action", action })),
        );
        emittedActions.push(action);
        timing.mark("first_action");
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
        for (const action of suppressRedundantInventoryNavigationActions(
          prepareBotActionsForClient(
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
          ),
          emittedActions,
        )) {
          controller.enqueue(
            encoder.encode(sseEvent({ type: "action", action })),
          );
          emittedActions.push(action);
        timing.mark("first_action");
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
        timing.mark("first_text");
        controller.enqueue(
          encoder.encode(
            sseEvent({ choices: [{ delta: { content: acknowledgement } }] }),
          ),
        );
      };

      // Streamed prose cannot be recalled, so a false claim of a page change
      // (no action emitted all turn) is corrected in-line before [DONE], and
      // the correction is what conversation memory stores.
      const emitTruthfulCorrection = () => {
        if (emittedActions.length > 0) return;
        if (!claimsCompletedSiteAction(assistantContent)) return;
        assistantContent += NO_ACTION_TRUTHFUL_CORRECTION;
        stateRules.push("false_action_claim_corrected");
        controller.enqueue(
          encoder.encode(
            sseEvent({
              choices: [{ delta: { content: NO_ACTION_TRUTHFUL_CORRECTION } }],
            }),
          ),
        );
      };

      // The follow-up stream's own duration, and the turn's timing event,
      // sent once, just before [DONE].
      const emitTimingEvent = () => {
        timing.addSpan("model_stream", timing.reading() - phase2StartedAt);
        controller.enqueue(
          encoder.encode(
            sseEvent({
              type: "timing",
              timing: reportTurnTiming(
                modelTimingOutcome("tool", emittedActions, 2),
                // The memory commit runs after [DONE]; the server event
                // waits for it so server_memory_commit_ms is real.
                { deferServerEvent: true },
              ),
            }),
          ),
        );
      };

      // A stream that fails or ends without completion never reaches
      // [DONE]. It is still one timed turn: the browser gets the (content-
      // free) error timing once, before any error event it would throw on.
      let errorTimingSent = false;
      const emitErrorTiming = () => {
        if (doneEventSent || errorTimingSent) return;
        errorTimingSent = true;
        timing.addSpan("model_stream", timing.reading() - phase2StartedAt);
        const errorTiming = reportTurnTiming({
          ...modelTimingOutcome("tool", emittedActions, 2),
          route: "error",
          status: 502,
          errorStage: "provider_stream",
        });
        try {
          controller.enqueue(
            encoder.encode(sseEvent({ type: "timing", timing: errorTiming })),
          );
        } catch {
          // The stream may already be closed by the client; telemetry only.
        }
      };

      const emitFiltered = ({
        visibleText,
        actions,
      }: ReturnType<InlineActionStreamFilter["push"]>) => {
        if (visibleText) {
          assistantContent += visibleText;
          timing.mark("first_text");
          controller.enqueue(
            encoder.encode(
              sseEvent({ choices: [{ delta: { content: visibleText } }] }),
            ),
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
          emitTruthfulCorrection();
          if (!doneEventSent) {
            emitTimingEvent();
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            doneEventSent = true;
          }
          return;
        }

        const textDelta = extractChatCompletionTextDelta(line);
        if (!textDelta) return;
        timing.mark("model_first_token");
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
          emitTruthfulCorrection();
          emitTimingEvent();
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          doneEventSent = true;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream failure";
        emitErrorTiming();
        controller.enqueue(
          encoder.encode(sseEvent({ type: "error", message })),
        );
      } finally {
        if (
          streamCompletionObserved &&
          visitor &&
          visitorTurn &&
          assistantContent.trim()
        ) {
          await completeVisitorPreferenceTurn(supabase, {
            tenantId: tenant.tenantId,
            visitorId: visitor.id,
            sessionId: visitorTurn.sessionId,
            assistantContent,
          });
        }
        if (streamCompletionObserved && memoryKey && assistantContent.trim()) {
          await timing.span("memory_commit", () =>
            persistTurnMemory({
              messages: [
                lastUser,
                { role: "assistant", content: assistantContent },
              ],
              conversationState,
              toolResults: turn.steps.map((step) => ({
                name: step.call.name,
                result: step.result,
              })),
            }),
          );
        }
        if (doneEventSent) finalizeDeferredTiming();
        else emitErrorTiming();
        if (streamCompletionObserved) {
          captureConciergeTranscript({
            sessionId: transcriptSessionId,
            tenantId: tenant.tenantId,
            turn: conversationState.turn,
            userText: lastUser.content,
            assistantText: assistantContent,
            source: "tool",
            actions: actionDebugSummary(emittedActions),
            toolCalls: turn.steps.map((step) => ({
              name: step.call.name,
              result: step.result,
            })),
          });
          queueInternalConciergeTrace({
            client: supabase,
            tenantId: tenant.tenantId,
            requestId,
            conversationId: transcriptSessionId,
            turn: conversationState.turn,
            source: "tool",
            userMessage: lastUser.content,
            assistantResponse: assistantContent,
            stateBefore: conversationStateBefore,
            stateAfter: conversationState,
            actions: emittedActions,
            toolSummary: turn.steps.map((step) => ({
              name: step.call.name,
              result: step.result,
            })),
            retrieval: { totalMatched: totalMatched ?? null },
            model: { provider: chatProvider.profile.provider, modelId: chatProvider.profile.id },
          });
        }
        // Emitted here rather than beside the return: emittedActions is
        // built inside the stream, and a turn's action list is only final
        // once the follow-up stream has finished.
        recordModelTurn({ route: "tool", emitted: emittedActions, calls: 2 });
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
}

function queueInternalConciergeTrace(input: {
  client: ServerSupabaseClient;
  tenantId: string;
  requestId: string;
  conversationId: string;
  turn: number;
  source: ConciergeTraceSource;
  userMessage: string;
  assistantResponse: string;
  stateBefore: ConversationInventoryState;
  stateAfter: ConversationInventoryState;
  actions: readonly BotAction[];
  toolSummary?: readonly unknown[];
  retrieval?: Record<string, unknown>;
  model?: Record<string, unknown>;
}): void {
  // `after` keeps the database write off the visitor's response path. The
  // helper checks all explicit internal-test gates again before it writes.
  after(async () => {
    await writeInternalConciergeTrace(input.client, {
      tenantId: input.tenantId,
      requestId: input.requestId,
      conversationId: input.conversationId,
      turn: input.turn,
      source: input.source,
      userMessage: input.userMessage,
      assistantResponse: input.assistantResponse,
      stateBefore: input.stateBefore as unknown as Record<string, unknown>,
      stateAfter: input.stateAfter as unknown as Record<string, unknown>,
      actions: input.actions,
      toolSummary: input.toolSummary,
      retrieval: input.retrieval,
      model: input.model,
    });
  });
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

async function loadPublishedKnowledgeContext(
  client: ReturnType<typeof createServiceClient>,
  tenantId: Parameters<typeof retrieveHybridContext>[0]["tenantId"],
  query: string,
): Promise<RetrievedChunk[]> {
  try {
    return await retrieveHybridContext({
      client,
      tenantId,
      query,
      embed: process.env.OLLAMA_HOST ? createOllamaEmbedder() : null,
      topK: 7,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Code-first deployments must remain available until migration 087 is
    // applied. Do not turn arbitrary DB failures into a whole-corpus read.
    if (
      !/hybrid_rag_chunks_for_tenant|schema cache|could not find/i.test(message)
    ) {
      throw error;
    }
    const legacy = await client
      .from("rag_chunks")
      .select("text, category")
      .eq("tenant_id", tenantId);
    if (legacy.error) {
      throw new Error(`rag_chunks query failed: ${legacy.error.message}`);
    }
    return retrieveByKeywords(legacy.data ?? [], query, 7);
  }
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Accept a client turn id only in the exact opaque shape we expect.
 *
 * Anything else is ignored rather than rejected: a malformed id is a client
 * bug, not an attack surface, and failing the whole turn over it would be
 * worse than falling back to a server id.
 */
function normalizeClientRequestId(value: unknown): string | null {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

function resolveAnonymousConversationId(
  requested: string | undefined,
  startNewSession: boolean,
): string {
  if (!startNewSession && requested && UUID_PATTERN.test(requested)) {
    return requested;
  }
  return crypto.randomUUID();
}

function actionDebugSummary(
  actions: readonly BotAction[],
): Array<Record<string, string | undefined>> {
  return actions.map((action) => ({
    type: action.type,
    vehicleId:
      action.type === "navigate-target"
        ? action.params?.vehicleId
        : action.type === "highlight-vehicle" ||
            action.type === "open-lead-form" ||
            action.type === "capture_lead"
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

/**
 * The answer to a duplicate delivery of a turn already in flight.
 *
 * A 200 with an explicit `duplicate` event rather than an error status: this
 * is an expected outcome of a retry, not a failure, and surfacing it as 409 or
 * 429 would have every existing client render "chat failed" for something the
 * visitor is already being answered. It carries no assistant text and no
 * actions, so a client that ignores the event simply sees an empty turn rather
 * than a second copy of the reply.
 *
 * It says nothing about who holds the lease — only that this delivery is a
 * duplicate of itself, which the caller already knows.
 */
function duplicateTurnResponse(
  request: Request,
  quotaHeaders: Record<string, string>,
): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(sseEvent({ type: "duplicate" })));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...quotaHeaders,
      ...corsHeadersFor(request),
    }),
  });
}

type ProviderMessage = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: LlmToolCall[];
};

type ProviderCompletion = {
  choices?: Array<{ message?: ProviderMessage }>;
  /**
   * OpenAI-compatible usage block. Absent on some providers and on the
   * streamed phase-2 call (which would need stream_options.include_usage),
   * in which case telemetry reports "unknown" rather than zero.
   */
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};
