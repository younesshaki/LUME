/** Server-side PostHog events for concierge operations and internal training. */
import { PostHog } from "posthog-node";

type Properties = Record<string, boolean | number | string | null | undefined>;
type TrainingProperties = Record<string, unknown>;

let client: PostHog | null | undefined;

/** A value-free readiness signal; no endpoint should reveal configuration. */
export function posthogServerMode(): "configured" | "off" {
  return process.env.POSTHOG_PROJECT_TOKEN?.trim() && process.env.POSTHOG_HOST?.trim()
    ? "configured"
    : "off";
}

function getPostHog(): PostHog | null {
  if (client !== undefined) return client;
  const apiKey = process.env.POSTHOG_PROJECT_TOKEN?.trim();
  const host = process.env.POSTHOG_HOST?.trim();
  if (!apiKey || !host) {
    client = null;
    return client;
  }
  client = new PostHog(apiKey, { host, flushAt: 1, flushInterval: 0 });
  return client;
}

/**
 * Operational event stream. It intentionally remains scalar and content-free;
 * full transcript capture is isolated in captureConciergeTrainingTrace below.
 */
export async function captureConciergeOperationalEvent(input: {
  tenantId: string;
  event: string;
  properties?: Properties;
}): Promise<void> {
  const posthog = getPostHog();
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId: `tenant:${input.tenantId}`,
      event: input.event,
      properties: compact(input.properties ?? {}),
    });
    // Called from Next's after() path, never in the visitor response path.
    await posthog.flush();
  } catch {
    // PostHog must never influence an answer or trigger an error loop.
  }
}

/**
 * Full-fidelity server trace for the current internal training phase. Unlike
 * the operational stream, this deliberately includes message content, action
 * payloads, tool results, state, retrieval, and model metadata.
 */
export async function captureConciergeTrainingTrace(input: {
  tenantId: string;
  conversationId: string;
  properties: TrainingProperties;
}): Promise<void> {
  const posthog = getPostHog();
  if (!posthog) return;
  try {
    posthog.capture({
      distinctId: `conversation:${input.conversationId}`,
      event: "lume_concierge_training_trace",
      properties: {
        tenant_id: input.tenantId,
        conversation_id: input.conversationId,
        ...input.properties,
      },
    });
    await posthog.flush();
  } catch {
    // Training telemetry remains best-effort and never affects a chat turn.
  }
}

export function conciergeTrainingProperties(input: {
  requestId: string;
  turn: number | null;
  source: string;
  status: string;
  userMessage: string;
  assistantResponse: string | null;
  stateBefore: Record<string, unknown>;
  stateAfter: Record<string, unknown>;
  actions: readonly unknown[];
  toolSummary: readonly unknown[];
  retrieval: Record<string, unknown>;
  model: Record<string, unknown>;
}): TrainingProperties {
  return {
    request_id: input.requestId,
    turn: input.turn,
    source: input.source,
    status: input.status,
    user_message: input.userMessage,
    assistant_response: input.assistantResponse,
    state_before: input.stateBefore,
    state_after: input.stateAfter,
    actions: input.actions,
    tool_summary: input.toolSummary,
    retrieval: input.retrieval,
    model: input.model,
  };
}

function compact(properties: Properties): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, boolean | number | string | null>;
}
