import { timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import {
  claimWebhookDeliveries,
  deliverTenantWebhook,
  finishWebhookDelivery,
  isPublicWebhookAddress,
  normalizeWebhookRetryDelays,
  type WebhookDeliveryOutcome,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { captureError } from "@/lib/observability";
import {
  decryptWebhookSecret,
  webhookEncryptionConfigured,
} from "@/lib/webhookCredentials.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !webhookEncryptionConfigured()) {
    return json({ error: "CRM webhook delivery is not configured." }, 503);
  }
  if (!validBearerToken(request.headers.get("authorization"), cronSecret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const service = createServiceClient();
  let deliveries: Awaited<ReturnType<typeof claimWebhookDeliveries>>;
  try {
    deliveries = await claimWebhookDeliveries(service, 50);
  } catch (error) {
    captureError("api/cron/webhook-deliveries/claim", error);
    return json({ error: "Unable to claim webhook deliveries." }, 500);
  }

  const results = await mapWithConcurrency(deliveries, 5, async (delivery) => {
    let outcome: Exclude<WebhookDeliveryOutcome, { status: "not_configured" }>;
    try {
      const retryDelaysMs = normalizeWebhookRetryDelays(delivery.retryDelaysSeconds);
      if (!retryDelaysMs) throw new Error("Webhook retry policy is invalid.");
      const signingSecret = decryptWebhookSecret(delivery.signingSecretCiphertext);
      const delivered = await deliverTenantWebhook(delivery, {
        signingSecret,
        retryDelaysMs,
        transport: async ({ url, body, headers }) => {
          await assertPublicDnsResolution(url);
          const response = await fetch(url, {
            method: "POST",
            headers,
            body,
            redirect: "manual",
            signal: AbortSignal.timeout(8_000),
          });
          return { status: response.status };
        },
      });
      outcome = delivered.status === "not_configured"
        ? { status: "dead_letter", responseStatus: null, error: "Delivery is not configured." }
        : delivered;
    } catch (error) {
      outcome = {
        status: "dead_letter",
        responseStatus: null,
        error: error instanceof Error ? error.message : "Webhook delivery failed.",
      };
    }

    try {
      await finishWebhookDelivery(service, delivery, outcome);
      return outcome.status;
    } catch (error) {
      captureError("api/cron/webhook-deliveries/finish", error, {
        tenantId: delivery.tenantId,
        deliveryId: delivery.id,
      });
      return "worker_error" as const;
    }
  });
  const workerErrors = results.filter((status) => status === "worker_error").length;
  return json({
    claimed: deliveries.length,
    succeeded: results.filter((status) => status === "succeeded").length,
    retrying: results.filter((status) => status === "retrying").length,
    deadLetter: results.filter((status) => status === "dead_letter").length,
    workerErrors,
  }, workerErrors > 0 ? 500 : 200);
}

async function assertPublicDnsResolution(endpoint: string): Promise<void> {
  const hostname = new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicWebhookAddress(address))) {
    throw new Error("Webhook endpoint resolved to a private address.");
  }
}

function validBearerToken(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  ));
  return results;
}
