export type TenantWebhookEvent =
  | "lead.created"
  | "lead.status_changed"
  | "vehicle.sold"
  | "test_drive.scheduled";

export const WEBHOOK_RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
] as const;

export const MAX_WEBHOOK_RETRY_ATTEMPTS = 10;

export type WebhookDeliveryJob = {
  id: string;
  endpointUrl: string;
  eventType: TenantWebhookEvent;
  eventId: string;
  payload: Record<string, unknown>;
  attemptCount: number;
};

export type WebhookTransportRequest = {
  url: string;
  body: string;
  headers: Record<string, string>;
};

export type WebhookTransport = (
  request: WebhookTransportRequest,
) => Promise<{ status: number }>;

export type WebhookDeliveryOutcome =
  | { status: "not_configured" }
  | { status: "succeeded"; responseStatus: number }
  | { status: "retrying"; responseStatus: number | null; nextAttemptAt: string; error: string }
  | { status: "dead_letter"; responseStatus: number | null; error: string };

export function isAllowedWebhookEndpoint(endpointUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(endpointUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" || url.username || url.password) return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local")) return false;
  return !isPrivateIpv4(hostname) && !isPrivateIpv6(hostname);
}

export function isPublicWebhookAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  return !isPrivateIpv4(normalized) && !isPrivateIpv6(normalized);
}

export async function signWebhookPayload(secret: string, body: string): Promise<string> {
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body),
  );
  return `sha256=${Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0")).join("")}`;
}

export function nextWebhookAttempt(
  completedAttempts: number,
  nowMs = Date.now(),
  retryDelaysMs: readonly number[] = WEBHOOK_RETRY_DELAYS_MS,
): string | null {
  if (!Number.isSafeInteger(completedAttempts) || completedAttempts < 0) {
    throw new RangeError("completedAttempts must be a non-negative safe integer.");
  }
  const delay = retryDelaysMs[completedAttempts];
  return delay === undefined ? null : new Date(nowMs + delay).toISOString();
}

export function normalizeWebhookRetryDelays(seconds: readonly number[]): number[] | null {
  if (seconds.length < 1 || seconds.length > MAX_WEBHOOK_RETRY_ATTEMPTS) return null;
  const delays = seconds.map((value) => value * 1_000);
  return delays.every((value) => Number.isSafeInteger(value) && value >= 1_000 && value <= 86_400_000)
    ? delays
    : null;
}

/**
 * Delivery worker core. It performs no network I/O unless a transport and a
 * decrypted signing secret are explicitly injected by trusted server code.
 */
export async function deliverTenantWebhook(
  job: WebhookDeliveryJob,
  options: {
    signingSecret?: string;
    transport?: WebhookTransport;
    nowMs?: number;
    retryDelaysMs?: readonly number[];
  } = {},
): Promise<WebhookDeliveryOutcome> {
  if (!options.transport || !options.signingSecret) return { status: "not_configured" };
  if (!isAllowedWebhookEndpoint(job.endpointUrl)) {
    return {
      status: "dead_letter",
      responseStatus: null,
      error: "Webhook endpoint is not allowed.",
    };
  }

  const body = JSON.stringify({
    id: job.eventId,
    type: job.eventType,
    data: job.payload,
  });
  const signature = await signWebhookPayload(options.signingSecret, body);

  let responseStatus: number | null = null;
  let error = "Webhook delivery failed.";
  try {
    const response = await options.transport({
      url: job.endpointUrl,
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Event": job.eventType,
        "X-Lume-Delivery": job.id,
        "X-Lume-Signature": signature,
      },
    });
    responseStatus = response.status;
    if (response.status >= 200 && response.status < 300) {
      return { status: "succeeded", responseStatus: response.status };
    }
    error = `Webhook responded with HTTP ${response.status}.`;
  } catch (reason) {
    error = reason instanceof Error ? reason.message : error;
  }

  const nextAttemptAt = nextWebhookAttempt(
    job.attemptCount,
    options.nowMs,
    options.retryDelaysMs ?? WEBHOOK_RETRY_DELAYS_MS,
  );
  return nextAttemptAt
    ? { status: "retrying", responseStatus, nextAttemptAt, error }
    : { status: "dead_letter", responseStatus, error };
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  return (
    hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("fe8") ||
    hostname.startsWith("fe9") ||
    hostname.startsWith("fea") ||
    hostname.startsWith("feb")
  );
}
