/**
 * Server-side speed telemetry for one public concierge turn.
 *
 * Every turn gets a stopwatch started on entry to POST /api/chat. The route
 * marks named stages as it passes them (tenant resolved, quota checked, state
 * resolved, model answered, first byte sent, done). At the end of the turn:
 *
 *  - the same numbers go to the browser as one `timing` SSE event, which the
 *    chat client folds into its own turn event, so a single PostHog event
 *    carries both the visitor-perceived and the server-side timings with no
 *    cross-event join; and
 *  - an authoritative `lume_concierge_turn_timing` event is sent from the
 *    server via `after()`. It exists for every turn, including ones whose
 *    browser blocks analytics or never gave consent.
 *
 * Content-free by construction: only durations, counts, enums, ids and
 * release metadata. No visitor text, reply text or vehicle id is accepted by
 * the builder's input type.
 *
 * Nothing here may slow or fail a turn. Marks are one clock read; the event
 * is sent after the response; every step swallows its own errors.
 */
import { after } from "next/server";
import { captureConciergeOperationalEvent } from "./posthog.server";

/** Stage marks, in the order a turn normally passes them. */
export const TURN_TIMING_MARKS = [
  /** Tenant resolved from the request. */
  "tenant",
  /** Quota decision made. */
  "quota",
  /** Persona, runtime config, visitor, targets and plan loaded. */
  "config",
  /** Conversation memory read. */
  "memory",
  /** Deterministic state resolved (vocabulary, reference, inventory query). */
  "state",
  /** Model-only context loaded (retrieval, loyalty, image descriptions). */
  "context",
  /** First model call returned (non-streamed tool/prose decision). */
  "model_response",
  /** First token of the streamed follow-up model call. */
  "model_first_token",
  /** First byte of the response stream enqueued. */
  "first_byte",
  /** First action event enqueued. */
  "first_action",
  /** First visible text enqueued. */
  "first_text",
  /** Stream finished. */
  "done",
] as const;

export type TurnTimingMark = (typeof TURN_TIMING_MARKS)[number];

/** Durations of work that happens inside a stage, not a point in time. */
export const TURN_TIMING_SPANS = [
  "inventory_query",
  "interpretation",
  "model_phase1",
  "tools",
  "model_stream",
  "memory_commit",
] as const;

export type TurnTimingSpan = (typeof TURN_TIMING_SPANS)[number];

export type TurnTimingSnapshot = {
  marks: Partial<Record<TurnTimingMark, number>>;
  spans: Partial<Record<TurnTimingSpan, number>>;
};

export class TurnStopwatch {
  private readonly origin: number;
  private readonly marks: Partial<Record<TurnTimingMark, number>> = {};
  private readonly spans: Partial<Record<TurnTimingSpan, number>> = {};

  constructor(private readonly now: () => number = () => performance.now()) {
    this.origin = now();
  }

  /** Milliseconds since the turn started. */
  elapsed(): number {
    return Math.max(0, Math.round(this.now() - this.origin));
  }

  /** Record a stage the first time it is reached; later calls are ignored. */
  mark(stage: TurnTimingMark): void {
    if (this.marks[stage] === undefined) this.marks[stage] = this.elapsed();
  }

  /** Time an async unit of work into a span (accumulates if repeated). */
  async span<T>(name: TurnTimingSpan, work: () => Promise<T>): Promise<T> {
    const started = this.now();
    try {
      return await work();
    } finally {
      this.addSpan(name, this.now() - started);
    }
  }

  addSpan(name: TurnTimingSpan, ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.spans[name] = Math.round((this.spans[name] ?? 0) + ms);
  }

  /** A clock reading for spans measured across callbacks. */
  reading(): number {
    return this.now();
  }

  snapshot(): TurnTimingSnapshot {
    return { marks: { ...this.marks }, spans: { ...this.spans } };
  }
}

/** Per-instance turn counter: turn 1 on an instance is a cold start. */
let instanceTurns = 0;
export function nextInstanceTurn(): number {
  instanceTurns += 1;
  return instanceTurns;
}

/** Test hook. */
export function resetInstanceTurnsForTests(): void {
  instanceTurns = 0;
}

export type TurnTimingRoute =
  | "deterministic"
  | "interpreted"
  | "model"
  | "tool"
  | "duplicate"
  | "error";

export type TurnTimingOutcome = {
  conversationId: string | null;
  turn: number | null;
  route: TurnTimingRoute;
  /** HTTP-level outcome, for error turns. */
  status?: number;
  /** Where an error turn failed, e.g. "provider_phase_1". Never a message. */
  errorStage?: string;
  model?: { provider: string; id: string; fellBack: boolean; calls: number } | null;
  queryStatus?: "not_run" | "success" | "empty";
  resultCount?: number | null;
  actionTypes?: readonly string[];
  ruleCodes?: readonly string[];
};

export type TurnTimingContext = TurnTimingOutcome & {
  requestId: string;
  clientRequestId: boolean;
  tenantId: string;
  memoryMode?: "shared" | "degraded" | "local";
  instanceTurn: number;
};

/** The payload the browser receives in the `timing` SSE event. */
export type ClientTurnTiming = {
  request_id: string;
  route: TurnTimingRoute;
  server_total_ms: number;
} & Partial<Record<`server_${TurnTimingMark}_ms` | `server_${TurnTimingSpan}_ms`, number>>;

type Scalar = boolean | number | string | null;

const MAX_LIST = 12;

function list(values: readonly string[] | undefined): string | null {
  if (!values || values.length === 0) return null;
  return values
    .slice(0, MAX_LIST)
    .map((value) => String(value).replace(/[^a-z0-9_:-]/gi, "").slice(0, 48))
    .join(",");
}

function stageFields(snapshot: TurnTimingSnapshot): Record<string, number> {
  const fields: Record<string, number> = {};
  for (const mark of TURN_TIMING_MARKS) {
    const value = snapshot.marks[mark];
    if (value !== undefined) fields[`server_${mark}_ms`] = value;
  }
  for (const span of TURN_TIMING_SPANS) {
    const value = snapshot.spans[span];
    if (value !== undefined) fields[`server_${span}_ms`] = value;
  }
  return fields;
}

/** Properties of the server `lume_concierge_turn_timing` event. */
export function buildTurnTimingProperties(
  context: TurnTimingContext,
  snapshot: TurnTimingSnapshot,
  totalMs: number,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Record<string, Scalar> {
  return {
    request_id: context.requestId,
    client_request_id: context.clientRequestId,
    conversation_id: context.conversationId,
    turn: context.turn,
    route: context.route,
    status: context.status ?? 200,
    error_stage: context.errorStage ?? null,
    model_provider: context.model?.provider ?? null,
    model_id: context.model?.id ?? null,
    model_fell_back: context.model?.fellBack ?? null,
    model_calls: context.model?.calls ?? 0,
    query_status: context.queryStatus ?? "not_run",
    result_count: context.resultCount ?? null,
    action_count: context.actionTypes?.length ?? 0,
    action_types: list(context.actionTypes),
    rule_codes: list(context.ruleCodes),
    memory_mode: context.memoryMode ?? null,
    instance_turn: context.instanceTurn,
    cold_start: context.instanceTurn === 1,
    region: environment.VERCEL_REGION ?? null,
    release: environment.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local",
    deployment_env: environment.VERCEL_ENV ?? "development",
    server_total_ms: totalMs,
    ...stageFields(snapshot),
  };
}

export function buildClientTurnTiming(
  context: Pick<TurnTimingContext, "requestId" | "route">,
  snapshot: TurnTimingSnapshot,
  totalMs: number,
): ClientTurnTiming {
  return {
    request_id: context.requestId,
    route: context.route,
    server_total_ms: totalMs,
    ...stageFields(snapshot),
  } as ClientTurnTiming;
}

/**
 * Send the server timing event after the response. `after()` keeps it off
 * the visitor's path; outside a request scope (tests, scripts) it is sent
 * directly. Never throws.
 */
export function queueTurnTimingEvent(
  tenantId: string,
  properties: Record<string, Scalar>,
): void {
  const send = () =>
    captureConciergeOperationalEvent({
      tenantId,
      event: "lume_concierge_turn_timing",
      properties,
    });
  try {
    after(send);
  } catch {
    void send().catch(() => undefined);
  }
}
