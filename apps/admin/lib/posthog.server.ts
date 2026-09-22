/** Server-side, content-free PostHog events for concierge operations. */
import { PostHog } from "posthog-node";

type Properties = Record<string, boolean | number | string | null | undefined>;

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
 * This intentionally accepts only scalar properties. Do not add prompts,
 * visitor text, model output, action arguments, forms, identifiers, or PII.
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

function compact(properties: Properties): Record<string, boolean | number | string | null> {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  ) as Record<string, boolean | number | string | null>;
}
