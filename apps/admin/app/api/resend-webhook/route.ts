/**
 * POST /api/resend-webhook (SCRUM-196).
 *
 * Resend signs the exact raw body. This server-to-server route intentionally
 * has no browser Origin/CORS or tenant-header path; tenant attribution comes
 * only from the verified outbound tenant_id tag.
 */
import { recordResendEmailEvent } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import {
  normalizeResendWebhookEvent,
  readResendWebhookSecret,
  verifyResendWebhook,
} from "@lume/email/server";
import { readRequestTextWithinLimit } from "@/lib/boundedRequestBody";
import { captureError, withRouteErrorCapture } from "@/lib/observability";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";

const MAX_WEBHOOK_BYTES = 1_024 * 1_024;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withRouteErrorCapture("api/resend-webhook", handlePost);

async function handlePost(request: Request): Promise<Response> {
  const rateLimit = checkPublicRouteRateLimit("resend-webhook", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit);

  const webhookSecret = readResendWebhookSecret();
  if (!webhookSecret) {
    return json({ error: "Email webhook is not configured" }, 503);
  }

  const providerEventId = boundedHeader(request, "svix-id", 200);
  const timestamp = boundedHeader(request, "svix-timestamp", 100);
  const signature = boundedHeader(request, "svix-signature", 2_048);
  if (!providerEventId || !timestamp || !signature) {
    return json({ error: "Missing webhook signature headers" }, 400);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return json({ error: "Webhook payload is too large" }, 413);
  }

  const payload = await readRequestTextWithinLimit(request, MAX_WEBHOOK_BYTES);
  if (payload === null) {
    return json({ error: "Webhook payload is too large" }, 413);
  }

  let verified: unknown;
  try {
    verified = verifyResendWebhook({
      payload,
      webhookSecret,
      headers: { id: providerEventId, timestamp, signature },
    });
  } catch {
    return json({ error: "Invalid webhook signature" }, 400);
  }

  const decision = normalizeResendWebhookEvent(verified);
  if (decision.kind === "ignored") {
    return json({ received: true, ignored: true }, 200);
  }
  if (decision.kind === "invalid") {
    captureError("api/resend-webhook/payload", new Error(decision.reason));
    return json({ received: true, ignored: true }, 200);
  }

  try {
    const result = await recordResendEmailEvent(createServiceClient(), {
      tenantId: decision.event.tenantId,
      providerEventId,
      providerEmailId: decision.event.providerEmailId,
      eventType: decision.event.eventType,
      recipients: decision.event.recipients,
      templateKey: decision.event.templateKey,
      bounceType: decision.event.bounceType,
      bounceSubtype: decision.event.bounceSubtype,
      bounceMessage: decision.event.bounceMessage,
      occurredAt: decision.event.occurredAt,
    });
    if (result === "unknown_tenant") {
      return json({ received: true, ignored: true }, 200);
    }
    return json({ received: true, duplicate: result === "duplicate" }, 200);
  } catch (error) {
    captureError("api/resend-webhook/storage", error, {
      eventType: decision.event.eventType,
    });
    return json({ error: "Unable to record email event" }, 500);
  }
}

function boundedHeader(request: Request, name: string, maxLength: number): string | null {
  const value = request.headers.get(name)?.trim();
  return value && value.length <= maxLength && !/[\r\n]/.test(value) ? value : null;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
