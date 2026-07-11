import { Resend, type WebhookEventPayload } from "resend";
import { mailboxAddress, normalizeTemplateKey } from "./validation";

const TRACKED_EVENT_TYPES = new Set([
  "email.delivered",
  "email.bounced",
  "email.complained",
] as const);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_EVENT_RECIPIENTS = 50;

export type TrackedEmailEventType = "email.delivered" | "email.bounced" | "email.complained";
export type EmailSuppressionReason = "hard_bounce";

export type ResendWebhookHeaders = {
  id: string;
  timestamp: string;
  signature: string;
};

export type VerifyResendWebhookInput = {
  payload: string;
  headers: ResendWebhookHeaders;
  webhookSecret: string;
};

export type TrackedEmailEvent = {
  tenantId: string;
  providerEmailId: string;
  eventType: TrackedEmailEventType;
  occurredAt: string;
  recipients: string[];
  templateKey: string | null;
  bounceType: string | null;
  bounceSubtype: string | null;
  bounceMessage: string | null;
  suppressionReason: EmailSuppressionReason | null;
  suppressedRecipients: string[];
};

export type ResendWebhookDecision =
  | { kind: "tracked"; event: TrackedEmailEvent }
  | { kind: "ignored"; reason: "unsupported_event" | "unattributed" }
  | { kind: "invalid"; reason: string };

// Resend's verifier is local Standard Webhooks cryptography. Its constructor
// requires an API-key-shaped string even though verify() performs no network I/O.
const resendWebhookVerifier = new Resend("local-webhook-verification-only").webhooks;

export function verifyResendWebhook(input: VerifyResendWebhookInput): WebhookEventPayload {
  return resendWebhookVerifier.verify(input);
}

/**
 * Reduce a verified provider payload to the privacy-minimal fields LUME stores.
 * Unsupported or untagged events are acknowledged but never attributed.
 */
export function normalizeResendWebhookEvent(value: unknown): ResendWebhookDecision {
  const event = asRecord(value);
  const eventType = boundedString(event?.type, 80);
  if (!eventType || !isTrackedEventType(eventType)) {
    return { kind: "ignored", reason: "unsupported_event" };
  }

  const data = asRecord(event?.data);
  const tags = asRecord(data?.tags);
  const tenantId = boundedString(tags?.tenant_id, 100);
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    return { kind: "ignored", reason: "unattributed" };
  }

  const providerEmailId = boundedString(data?.email_id, 200);
  const occurredAt = normalizeTimestamp(event?.created_at);
  const recipients = normalizeRecipientList(data?.to);
  if (!providerEmailId || !occurredAt || !recipients) {
    return { kind: "invalid", reason: "Tracked email event is missing required fields." };
  }

  const rawTemplate = boundedString(tags?.template, 80);
  const templateKey = rawTemplate ? normalizeTemplateKey(rawTemplate) : null;
  let bounceType: string | null = null;
  let bounceSubtype: string | null = null;
  let bounceMessage: string | null = null;
  let suppressionReason: EmailSuppressionReason | null = null;

  if (eventType === "email.bounced") {
    const bounce = asRecord(data?.bounce);
    bounceType = boundedString(bounce?.type, 100);
    bounceSubtype = boundedString(bounce?.subType, 100);
    bounceMessage = boundedString(bounce?.message, 500);
    if (!bounceType) return { kind: "invalid", reason: "Bounce event is missing its type." };
    if (bounceType.toLowerCase() === "permanent") suppressionReason = "hard_bounce";
  }

  return {
    kind: "tracked",
    event: {
      tenantId,
      providerEmailId,
      eventType,
      occurredAt,
      recipients,
      templateKey,
      bounceType,
      bounceSubtype,
      bounceMessage,
      suppressionReason,
      suppressedRecipients: suppressionReason ? recipients : [],
    },
  };
}

function isTrackedEventType(value: string): value is TrackedEmailEventType {
  return TRACKED_EVENT_TYPES.has(value as TrackedEmailEventType);
}

function normalizeRecipientList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_EVENT_RECIPIENTS) {
    return null;
  }
  const recipients: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") return null;
    const address = mailboxAddress(candidate);
    if (!address) return null;
    if (!seen.has(address)) {
      seen.add(address);
      recipients.push(address);
    }
  }
  return recipients.length > 0 ? recipients : null;
}

function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 100) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" || /[\r\n]/.test(value)) return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
