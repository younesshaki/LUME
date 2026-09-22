/**
 * PostHog product analytics for the public LUME site.
 *
 * Autocapture, page analytics, session replay, and full concierge training
 * transcripts are deliberately enabled for LUME's current internal training
 * phase. The browser event below is paired with the server-side trace event so
 * a replay can be correlated with the exact conversation and action outcome.
 */
import posthog from "posthog-js";
import { publicTenantSlug } from "./publicTenant";

type Properties = Record<string, boolean | number | string | null | undefined>;

type TranscriptMessage = {
  role: "assistant" | "user";
  content: string;
};

let initialized = false;

/** Initialise once per browser session. */
export function initializeLumePostHog(): void {
  const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN?.trim();
  const host = import.meta.env.VITE_POSTHOG_HOST?.trim();
  if (
    initialized ||
    typeof window === "undefined" ||
    import.meta.env.VITE_POSTHOG_ENABLED !== "1" ||
    !token ||
    !host
  ) {
    return;
  }
  initialized = true;
  const sessionReplayEnabled =
    import.meta.env.VITE_POSTHOG_SESSION_REPLAY === "1";

  posthog.init(token, {
    api_host: host,
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: true,
    capture_exceptions: false,
    disable_session_recording: !sessionReplayEnabled,
    session_recording: {
      // Deliberately unmasked for the internal training phase. PostHog itself
      // still permanently masks password inputs.
      maskAllInputs: false,
    },
    loaded: (client) => {
      client.register({
        lume_surface: "public",
        lume_tenant_slug: publicTenantSlug,
      });
    },
  });
}

/** Safe event wrapper. Analytics may never affect the visitor experience. */
export function captureLumeEvent(name: string, properties: Properties = {}): void {
  if (!initialized) return;
  try {
    posthog.capture(name, compactProperties(properties));
  } catch {
    // Third-party analytics is intentionally non-blocking.
  }
}

/**
 * Full browser-side conversation window, correlated with the PostHog replay
 * created in this same browser session. A server-side companion event records
 * the authoritative response path, grounded actions, and tool outcomes.
 */
export function captureLumeConciergeTranscript(input: {
  turnId: string;
  conversationId: string | null;
  userMessage: string;
  assistantResponse: string;
  history: readonly TranscriptMessage[];
  sourceCategories: readonly string[];
  actionTypes: readonly string[];
}): void {
  captureLumeEvent("lume_concierge_transcript", {
    turn_id: input.turnId,
    conversation_id: input.conversationId,
    user_message: input.userMessage,
    assistant_response: input.assistantResponse,
    conversation_history_json: JSON.stringify(input.history),
    source_categories_json: JSON.stringify(input.sourceCategories),
    action_types_json: JSON.stringify(input.actionTypes),
  });
}

function compactProperties(properties: Properties): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, boolean | number | string | null>;
}
