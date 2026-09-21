/**
 * Privacy-minimal PostHog browser telemetry for the public LUME site.
 *
 * Concierge content, prompts, model output, lead details and action arguments
 * never enter PostHog. Full internal evaluation transcripts live in the
 * server-only `concierge_traces` table behind a tenant allowlist instead.
 */
import posthog from "posthog-js";
import { publicTenantSlug } from "./publicTenant";

type Properties = Record<string, boolean | number | string | null | undefined>;

let initialized = false;

/** Initialise explicitly: no automatic page-view or DOM autocapture. */
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
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    disable_session_recording: !sessionReplayEnabled,
    session_recording: {
      // Even internal replay keeps on-page text and form fields out of the
      // third party. The controlled LUME trace store carries the actual text.
      maskAllInputs: true,
      maskTextSelector: "*",
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

function compactProperties(properties: Properties): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, boolean | number | string | null>;
}
