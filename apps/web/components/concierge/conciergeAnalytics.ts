/**
 * Concierge analytics seam. Guarantees exactly one `action_dispatched` (or
 * `action_suppressed`) event per concierge action, independent of whether a
 * real analytics transport is wired. In the noindex preview there is no
 * PostHog/events transport (the env firewall blocks `NEXT_PUBLIC_*`), so these
 * resolve to a buffered no-op; a real transport is injected in a later slice
 * (4c) via {@link setConciergeAnalyticsSink}.
 */
import type { BotAction } from "@lume/blocks/chat-transport";

export type ConciergeAnalyticsEvent =
  | "lume_concierge_action_dispatched"
  | "lume_concierge_action_suppressed";

export type ConciergeAnalyticsSink = (
  event: ConciergeAnalyticsEvent,
  properties: { action_type: string; target?: string },
) => void;

let sink: ConciergeAnalyticsSink | null = null;

/** Wire a real transport (4c). Replaces the no-op. */
export function setConciergeAnalyticsSink(next: ConciergeAnalyticsSink | null): void {
  sink = next;
}

function emit(
  event: ConciergeAnalyticsEvent,
  action: BotAction,
): void {
  const target =
    action.type === "navigate"
      ? action.route
      : action.type === "navigate-target"
        ? action.targetKey
        : undefined;
  try {
    sink?.(event, { action_type: action.type, ...(target ? { target } : {}) });
  } catch {
    /* analytics is best-effort and never affects dispatch */
  }
}

/** Exactly one call per action that the client dispatched. */
export function recordActionDispatched(action: BotAction): void {
  emit("lume_concierge_action_dispatched", action);
}

/** Exactly one call per action the client chose not to act on (stale turn). */
export function recordActionSuppressed(action: BotAction): void {
  emit("lume_concierge_action_suppressed", action);
}
