/**
 * Internal, full-fidelity concierge traces.
 *
 * Full concierge text is retained in LUME's service-role-only trace table and
 * mirrored to PostHog during the current internal training phase.
 */
import type { ServerSupabaseClient } from "@lume/db/server";
import { captureError } from "./observability";
import {
  captureConciergeOperationalEvent,
  captureConciergeTrainingTrace,
  conciergeTrainingProperties,
} from "./posthog.server";

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

/**
 * Insert a completed trace on a best-effort background path. A trace outage
 * must never make an inventory answer slower, unavailable, or retried.
 */
export async function writeInternalConciergeTrace(
  client: ServerSupabaseClient,
  trace: InternalConciergeTrace,
): Promise<boolean> {
  try {
    // The training mirror is deliberately independent from the LUME-owned
    // store: a transient database failure must not discard the only raw trace
    // available for model evaluation.
    await captureConciergeTrainingTrace({
      tenantId: trace.tenantId,
      conversationId: trace.conversationId,
      properties: conciergeTrainingProperties({
        requestId: trace.requestId,
        turn: trace.turn,
        source: trace.source,
        status: trace.status ?? "completed",
        userMessage: trace.userMessage,
        assistantResponse: trace.assistantResponse ?? null,
        stateBefore: trace.stateBefore ?? {},
        stateAfter: trace.stateAfter ?? {},
        actions: trace.actions ?? [],
        toolSummary: trace.toolSummary ?? [],
        retrieval: trace.retrieval ?? {},
        model: trace.model ?? {},
      }),
    });
    const { error } = await client.from("concierge_traces").insert({
      tenant_id: trace.tenantId,
      request_id: trace.requestId,
      conversation_id: trace.conversationId,
      turn: trace.turn,
      trace_mode: "internal_full",
      source: trace.source,
      status: trace.status ?? "completed",
      user_message: trace.userMessage,
      assistant_response: trace.assistantResponse ?? null,
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
