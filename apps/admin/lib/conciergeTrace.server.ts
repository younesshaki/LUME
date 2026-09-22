/**
 * Internal, full-fidelity concierge traces.
 *
 * Raw concierge text is intentionally never sent to third-party analytics.
 * It is retained in this service-role-only LUME table only when all three
 * explicit internal-testing gates are enabled. The resolver fails closed so a
 * tenant cannot begin collecting raw visitor conversations by accident.
 */
import type { ServerSupabaseClient } from "@lume/db/server";
import { captureError } from "./observability";
import { captureConciergeOperationalEvent } from "./posthog.server";

export type ConciergeTraceSource =
  | "deterministic"
  | "interpreted"
  | "model"
  | "tool"
  | "error";

export type ConciergeTraceStatus =
  | "completed"
  | "failed"
  | "stream_incomplete"
  | "duplicate";

export type InternalConciergeTrace = {
  tenantId: string;
  requestId: string;
  conversationId: string;
  turn: number | null;
  source: ConciergeTraceSource;
  status?: ConciergeTraceStatus;
  userMessage: string;
  assistantResponse?: string | null;
  stateBefore?: Record<string, unknown>;
  stateAfter?: Record<string, unknown>;
  actions?: readonly unknown[];
  toolSummary?: readonly unknown[];
  retrieval?: Record<string, unknown>;
  model?: Record<string, unknown>;
};

type TraceEnvironment = Record<string, string | undefined>;

const MAX_USER_MESSAGE_LENGTH = 12_000;
const MAX_ASSISTANT_RESPONSE_LENGTH = 30_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Raw traces require all of the following, rather than a single easy-to-leak
 * switch:
 * - LUME_INTERNAL_TESTING=1
 * - LUME_CONCIERGE_TRACE_MODE=internal_full
 * - exact UUID membership in LUME_INTERNAL_TRACE_TENANT_IDS
 */
export function isInternalConciergeTraceEnabled(
  tenantId: string,
  env: TraceEnvironment = process.env,
): boolean {
  if (env.LUME_INTERNAL_TESTING !== "1") return false;
  if (env.LUME_CONCIERGE_TRACE_MODE !== "internal_full") return false;
  if (!UUID.test(tenantId)) return false;

  const allowedIds = (env.LUME_INTERNAL_TRACE_TENANT_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => UUID.test(value));
  return allowedIds.includes(tenantId);
}

/**
 * Insert a completed trace on a best-effort background path. A trace outage
 * must never make an inventory answer slower, unavailable, or retried.
 */
export async function writeInternalConciergeTrace(
  client: ServerSupabaseClient,
  trace: InternalConciergeTrace,
): Promise<boolean> {
  if (!isInternalConciergeTraceEnabled(trace.tenantId)) return false;
  try {
    const { error } = await client.from("concierge_traces").insert({
      tenant_id: trace.tenantId,
      request_id: trace.requestId,
      conversation_id: boundedText(trace.conversationId, 200),
      turn: trace.turn,
      trace_mode: "internal_full",
      source: trace.source,
      status: trace.status ?? "completed",
      user_message: boundedText(trace.userMessage, MAX_USER_MESSAGE_LENGTH),
      assistant_response:
        trace.assistantResponse == null
          ? null
          : boundedText(trace.assistantResponse, MAX_ASSISTANT_RESPONSE_LENGTH),
      state_before: trace.stateBefore ?? {},
      state_after: trace.stateAfter ?? {},
      actions: [...(trace.actions ?? [])],
      tool_summary: [...(trace.toolSummary ?? [])],
      retrieval: trace.retrieval ?? {},
      model: trace.model ?? {},
      completed_at: new Date().toISOString(),
    });
    if (error) throw error;
    await captureConciergeOperationalEvent({
      tenantId: trace.tenantId,
      event: "lume_concierge_trace_recorded",
      properties: {
        source: trace.source,
        status: trace.status ?? "completed",
        action_count: trace.actions?.length ?? 0,
        tool_count: trace.toolSummary?.length ?? 0,
      },
    });
    return true;
  } catch (error) {
    captureError("api/chat/internal-trace-write", error, {
      tenantId: trace.tenantId,
      requestId: trace.requestId,
    });
    return false;
  }
}

function boundedText(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join("");
}
