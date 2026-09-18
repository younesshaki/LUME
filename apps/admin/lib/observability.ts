/**
 * Error monitoring & observability (SCRUM-113). Server-only, provider-agnostic.
 *
 * `captureError` emits one structured JSON line to stderr — Vercel log drains
 * and `vercel logs` pick these up as-is — and, when ERROR_WEBHOOK_URL is set,
 * forwards the same payload to any collector (Slack/Discord webhook, Axiom,
 * a custom endpoint). No vendor SDK: swapping in Sentry later means one new
 * transport function, not a rewrite.
 *
 * Identical errors are deduped in-memory per signature (scope + message) for
 * one minute so a hot failure loop cannot flood logs or the webhook. Capture
 * never throws — observability must not take a route down.
 */

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;

export type CapturedError = {
  level: "error";
  scope: string;
  message: string;
  /** First stack frames, newline-joined — enough to locate, small enough to log. */
  stack: string | null;
  context: ErrorContext;
  /** Occurrences of this signature suppressed since the last emitted capture. */
  suppressed: number;
  at: string;
};

/** Opt-in, structured diagnostics for local/staging investigation. */
export function captureDebug(
  scope: string,
  detail: Record<string, unknown>,
): void {
  if (process.env.LUME_CHAT_DEBUG?.trim() !== "1") return;
  try {
    const serialized = JSON.stringify({
      level: "debug",
      scope,
      detail: boundedDebugDetail(detail),
      at: new Date().toISOString(),
    });
    // Keep debug output separate from captureError's error telemetry.
    console.info(serialized.slice(0, 12_000));
  } catch {
    // Debugging must never affect the request path.
  }
}

export type ConciergeTranscriptTurn = {
  sessionId: string;
  tenantId: string;
  /** Matches ConversationInventoryState.turn, so a transcript line and its
   * corresponding conversation-state debug line can be correlated. */
  turn: number;
  userText: string;
  assistantText: string;
  /** Which response path produced assistantText — the single most useful
   * field for spotting "this should have been deterministic but wasn't." */
  source: "deterministic" | "model" | "tool";
  actions: readonly Record<string, unknown>[];
  toolCalls?: readonly { name: string; result: unknown }[];
};

/**
 * One line per concierge turn with the FULL visitor message and FULL
 * assistant reply — deliberately not size-bounded per-field like
 * captureDebug, since a truncated transcript defeats the point of having
 * one. Tag "level":"transcript" so it can be grepped independently of the
 * lower-level "level":"debug" filter-state lines that share this same log
 * stream. Gated by the same LUME_CHAT_DEBUG flag — never on by default, and
 * this is server console output only, never sent to the visitor.
 */
export function captureConciergeTranscript(turn: ConciergeTranscriptTurn): void {
  if (process.env.LUME_CHAT_DEBUG?.trim() !== "1") return;
  try {
    const serialized = JSON.stringify({
      level: "transcript",
      scope: "api/chat/transcript",
      ...turn,
      at: new Date().toISOString(),
    });
    console.info(serialized.slice(0, 40_000));
  } catch {
    // Debugging must never affect the request path.
  }
}

const DEDUPE_WINDOW_MS = 60_000;
const MAX_TRACKED_SIGNATURES = 1_000;
const MAX_STACK_FRAMES = 8;

type SignatureState = { lastEmittedAt: number; suppressed: number };
const signatures = new Map<string, SignatureState>();

export function errorSignature(scope: string, error: unknown): string {
  return `${scope}:${messageOf(error)}`;
}

/**
 * Capture one error. Returns the emitted payload, or null when the signature
 * was suppressed by the dedupe window (still counted for the next emission).
 */
export function captureError(
  scope: string,
  error: unknown,
  context: ErrorContext = {},
  now: () => number = Date.now,
): CapturedError | null {
  try {
    const signature = errorSignature(scope, error);
    const at = now();

    if (signatures.size >= MAX_TRACKED_SIGNATURES) pruneSignatures(at);
    const state = signatures.get(signature);
    if (state && at - state.lastEmittedAt < DEDUPE_WINDOW_MS) {
      state.suppressed += 1;
      return null;
    }

    const payload: CapturedError = {
      level: "error",
      scope,
      message: messageOf(error),
      stack: stackOf(error),
      context: sanitizeContext(context),
      suppressed: state?.suppressed ?? 0,
      at: new Date(at).toISOString(),
    };
    signatures.set(signature, { lastEmittedAt: at, suppressed: 0 });

    console.error(JSON.stringify(payload));
    void forwardToWebhook(payload);
    return payload;
  } catch {
    return null; // Observability never breaks the caller.
  }
}

/**
 * Wrap a route handler: unhandled throws are captured and answered with a
 * generic 500 so stack details never reach the client.
 */
export function withRouteErrorCapture(
  scope: string,
  handler: (request: Request) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      captureError(scope, error, { url: new URL(request.url).pathname, method: request.method });
      return new Response(JSON.stringify({ error: "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

/** Test hook. */
export function resetErrorDedupe(): void {
  signatures.clear();
}

async function forwardToWebhook(payload: CapturedError): Promise<void> {
  const url = process.env.ERROR_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
  } catch {
    // The structured console line above is the source of truth; webhook is best-effort.
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error)?.slice(0, 500) ?? "unknown error";
  } catch {
    return "unknown error";
  }
}

function stackOf(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  return error.stack.split("\n").slice(0, MAX_STACK_FRAMES).join("\n");
}

/** Drop undefined values and clamp strings so a log line stays a log line. */
function sanitizeContext(context: ErrorContext): ErrorContext {
  const out: ErrorContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined) continue;
    out[key] = typeof value === "string" ? value.slice(0, 300) : value;
  }
  return out;
}

function boundedDebugDetail(value: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") out[key] = entry.slice(0, 300);
    else if (Array.isArray(entry)) out[key] = entry.slice(0, 30);
    else out[key] = entry;
  }
  return out;
}

function pruneSignatures(now: number): void {
  for (const [key, state] of signatures) {
    if (now - state.lastEmittedAt >= DEDUPE_WINDOW_MS) signatures.delete(key);
  }
}

export type ModelUsageRecord = {
  level: "info";
  scope: "model.usage";
  /** Route that spent the tokens, e.g. "api/editor/chat". */
  route: string;
  tenantId: string;
  provider: string;
  /** What the caller asked for, before any clamp or provider fallback. */
  requestedModelId: string;
  /** What was actually sent upstream, and therefore what gets billed. */
  effectiveModelId: string;
  /** True when a tenant ceiling lowered the request. */
  clamped: boolean;
  /** True when the requested provider was unconfigured and resolution fell back. */
  fellBack: boolean;
  at: string;
};

/**
 * Record which model a request actually billed.
 *
 * Without this, provider invoices cannot be attributed to a route or tenant.
 * That is not hypothetical: a Pro-tier spend spike in July 2026 took a manual
 * code audit to trace because nothing logged the effective model. Emitted as
 * one JSON line so it is greppable in the platform log viewer
 * (`scope":"model.usage"`).
 *
 * Contains no prompt, completion, or visitor data — only routing metadata.
 * Like captureError, observability must never break the caller.
 */
export function recordModelUsage(input: {
  route: string;
  tenantId: string;
  provider: string;
  requestedModelId: string;
  effectiveModelId: string;
  clamped?: boolean;
  fellBack?: boolean;
  now?: () => number;
}): ModelUsageRecord | null {
  try {
    const record: ModelUsageRecord = {
      level: "info",
      scope: "model.usage",
      route: input.route,
      tenantId: input.tenantId,
      provider: input.provider,
      requestedModelId: input.requestedModelId,
      effectiveModelId: input.effectiveModelId,
      clamped: input.clamped === true,
      fellBack: input.fellBack === true,
      at: new Date((input.now ?? Date.now)()).toISOString(),
    };
    console.info(JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}


/* ────────────────────────────────────────────────────────────────────────── *
 * Per-turn concierge telemetry
 *
 * One structured line per concierge turn, on the same console-JSON pipeline as
 * captureError/recordModelUsage — greppable as `"scope":"concierge.turn"`.
 *
 * Unlike captureConciergeTranscript this is NOT gated behind LUME_CHAT_DEBUG:
 * routine production metrics (how many turns avoid the model, how long a turn
 * takes, what a turn actually billed) must not require switching on raw
 * transcript capture. That is only safe because the record is structurally
 * incapable of carrying visitor content — see ConciergeTurnInput: there is no
 * field for a message, a prompt, a completion, model reasoning, or a lead.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Where token counts came from. "unknown" is never silently turned into 0, and
 * "provider_partial" marks counts that cover only some of the turn's upstream
 * calls — a two-call turn reporting one call's tokens is an undercount, and
 * saying so is the difference between a usable spend figure and a wrong one.
 */
export type ConciergeUsageSource =
  | "provider"
  | "provider_partial"
  | "estimated"
  | "unknown";

/** "duplicate" is a turn refused because another delivery of it is running. */
export type ConciergeTurnRoute =
  | "deterministic"
  | "model"
  | "tool"
  | "duplicate"
  | "error";

/** Outcome of this turn's tenant-scoped inventory query, if one ran. */
export type ConciergeQueryStatus =
  | "not_run"
  | "success"
  | "empty"
  | "unavailable";

export type ConciergeTurnInput = {
  surface: "public" | "admin";
  /** Correlates this line with the action/state debug lines for the same turn. */
  requestId: string;
  tenantId: string;
  /** Opaque memory namespace id. Never an identity or authorization token. */
  conversationId?: string | null;
  turn?: number | null;
  route: ConciergeTurnRoute;
  /**
   * True when the turn id came from the browser rather than a server
   * fallback. A boolean, not the id's provenance detail: it answers "is this
   * deployment's retry-dedupe actually reachable" without adding any content.
   */
  clientRequestId?: boolean;
  /** Deterministic rule codes that fired (from the state transition). */
  ruleCodes?: readonly string[];
  /** True when the turn ended by asking the visitor a bounded question. */
  clarification?: boolean;
  query?: { status: ConciergeQueryStatus; totalCount?: number | null };
  /** Action *types* only — never params, which carry record ids. */
  actions?: { emitted?: readonly string[]; dropped?: readonly string[] };
  model?: {
    provider: string;
    requestedModelId: string;
    effectiveModelId: string;
    clamped?: boolean;
    fellBack?: boolean;
    /** Upstream calls made this turn (phase 1 + optional phase 2). */
    calls?: number;
  } | null;
  /**
   * Extra upstream calls made by a shadow experiment on this turn. Kept out of
   * `model.calls` on purpose: an experiment's spend must never be mistaken for
   * the product's cost per answer, and folding them together would quietly
   * inflate every per-turn cost figure the moment shadow mode is enabled.
   */
  shadowModelCalls?: number;
  /**
   * Provider-reported token usage. Omit entirely when the upstream response
   * carried none — the record then says "unknown", never zero.
   */
  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    source?: ConciergeUsageSource;
    /**
     * How many of this turn's upstream calls the counts actually cover.
     * Defaults to the turn's call count. Lower means partial.
     */
    coversCalls?: number | null;
  } | null;
  /**
   * Per-1k-token rates for the effective model. Deliberately not defaulted:
   * LUME has no owner-approved price table yet, and inventing rates would
   * produce confident, wrong spend figures. Absent rates => cost "unpriced".
   */
  price?: { inputPer1k: number; outputPer1k: number; tableVersion: string } | null;
  timingsMs?: {
    state?: number | null;
    context?: number | null;
    model?: number | null;
    total?: number | null;
  };
  /**
   * True when this turn was served from per-instance memory because the
   * shared conversation store failed. Continuity is not guaranteed in that
   * mode, so a run of these explains otherwise-baffling transcripts.
   */
  memoryDegraded?: boolean;
  now?: () => number;
};

export type ConciergeTurnRecord = {
  level: "info";
  scope: "concierge.turn";
  surface: "public" | "admin";
  requestId: string;
  tenantId: string;
  conversationId: string | null;
  turn: number | null;
  route: ConciergeTurnRoute;
  clientRequestId: boolean;
  ruleCodes: string[];
  clarification: boolean;
  query: { status: ConciergeQueryStatus; totalCount: number | null };
  actions: { emitted: string[]; dropped: string[] };
  model: {
    provider: string;
    requestedModelId: string;
    effectiveModelId: string;
    clamped: boolean;
    fellBack: boolean;
    calls: number;
  } | null;
  shadowModelCalls: number;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    source: ConciergeUsageSource;
    /** Calls the counts cover, against `model.calls`. Null when unknown. */
    coversCalls: number | null;
    /** True when the turn made more calls than the counts account for. */
    partial: boolean;
  };
  cost: {
    usd: number | null;
    /** "priced_partial" means real money is missing from this figure. */
    source: "priced" | "priced_partial" | "unpriced";
    priceTableVersion: string | null;
  };
  timingsMs: {
    state: number | null;
    context: number | null;
    model: number | null;
    total: number | null;
  };
  memoryDegraded: boolean;
  at: string;
};

const MAX_RULE_CODES = 20;
const MAX_ACTION_TYPES = 20;

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Pure record builder, exported so the redaction contract is testable. */
export function buildConciergeTurnRecord(
  input: ConciergeTurnInput,
): ConciergeTurnRecord {
  const inputTokens = finiteOrNull(input.usage?.inputTokens);
  const outputTokens = finiteOrNull(input.usage?.outputTokens);
  const hasCounts = inputTokens !== null || outputTokens !== null;
  const modelCalls = finiteOrNull(input.model?.calls) ?? 0;
  // Counts default to covering every call; a caller that knows better (the
  // tool path, whose streamed second call reports no usage) says so.
  const coversCalls = hasCounts
    ? (finiteOrNull(input.usage?.coversCalls) ?? modelCalls)
    : null;
  const partial =
    hasCounts && coversCalls !== null && modelCalls > 0 && coversCalls < modelCalls;

  // A caller that supplies no counts gets "unknown" — never a zero that would
  // read as "this turn was free" in a spend report.
  const usageSource: ConciergeUsageSource = !hasCounts
    ? "unknown"
    : partial && (input.usage?.source ?? "provider") === "provider"
      ? "provider_partial"
      : (input.usage?.source ?? "provider");

  const price = input.price ?? null;
  const priceable = price !== null && hasCounts;
  const usd = priceable
    ? ((inputTokens ?? 0) / 1000) * price.inputPer1k +
      ((outputTokens ?? 0) / 1000) * price.outputPer1k
    : null;

  return {
    level: "info",
    scope: "concierge.turn",
    surface: input.surface,
    requestId: input.requestId,
    tenantId: input.tenantId,
    conversationId: input.conversationId ?? null,
    turn: finiteOrNull(input.turn),
    route: input.route,
    clientRequestId: input.clientRequestId === true,
    ruleCodes: [...(input.ruleCodes ?? [])]
      .slice(0, MAX_RULE_CODES)
      .map((code) => String(code).slice(0, 60)),
    clarification: input.clarification === true,
    query: {
      status: input.query?.status ?? "not_run",
      totalCount: finiteOrNull(input.query?.totalCount),
    },
    actions: {
      emitted: [...(input.actions?.emitted ?? [])]
        .slice(0, MAX_ACTION_TYPES)
        .map((type) => String(type).slice(0, 60)),
      dropped: [...(input.actions?.dropped ?? [])]
        .slice(0, MAX_ACTION_TYPES)
        .map((type) => String(type).slice(0, 60)),
    },
    model: input.model
      ? {
          provider: input.model.provider,
          requestedModelId: input.model.requestedModelId,
          effectiveModelId: input.model.effectiveModelId,
          clamped: input.model.clamped === true,
          fellBack: input.model.fellBack === true,
          calls: finiteOrNull(input.model.calls) ?? 0,
        }
      : null,
    shadowModelCalls: finiteOrNull(input.shadowModelCalls) ?? 0,
    usage: {
      inputTokens,
      outputTokens,
      source: usageSource,
      coversCalls,
      partial,
    },
    cost: {
      usd,
      // A partial figure is real spend, but not the whole bill. Labelling it
      // stops it being summed as if it were.
      source: usd === null ? "unpriced" : partial ? "priced_partial" : "priced",
      priceTableVersion: price?.tableVersion ?? null,
    },
    timingsMs: {
      state: finiteOrNull(input.timingsMs?.state),
      context: finiteOrNull(input.timingsMs?.context),
      model: finiteOrNull(input.timingsMs?.model),
      total: finiteOrNull(input.timingsMs?.total),
    },
    memoryDegraded: input.memoryDegraded === true,
    at: new Date((input.now ?? Date.now)()).toISOString(),
  };
}

/** Emit one turn record. Like every capture here, it never throws. */
export function recordConciergeTurn(
  input: ConciergeTurnInput,
): ConciergeTurnRecord | null {
  try {
    const record = buildConciergeTurnRecord(input);
    console.info(JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}
