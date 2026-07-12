import { timingSafeEqual } from "node:crypto";
import { claimLeadEmailDigests, finishLeadEmailDigest } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { deliverLeadDigest } from "@/lib/leadEmailNotifications.server";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return cronJson({ error: "Lead email digests are not configured." }, 503);
  if (!validBearerToken(request.headers.get("authorization"), secret)) {
    return cronJson({ error: "Unauthorized." }, 401);
  }

  const service = createServiceClient();
  let batches: Awaited<ReturnType<typeof claimLeadEmailDigests>>;
  try {
    batches = await claimLeadEmailDigests(service, 25);
  } catch (error) {
    captureError("api/cron/lead-email-digests/claim", error);
    return cronJson({ error: "Unable to claim lead email digests." }, 500);
  }

  const origin = new URL(request.url).origin;
  const results = await mapWithConcurrency(batches, 3, async (batch) => {
    let success = false;
    let errorMessage = "Lead digest delivery failed.";
    try {
      const outcome = await deliverLeadDigest(service, batch, origin);
      success = outcome.status === "sent" ||
        outcome.status === "disabled" ||
        outcome.status === "no_recipients";
      if (outcome.status === "failed") errorMessage = outcome.reason;
      if (outcome.status === "not_configured") errorMessage = "Email provider is not configured.";
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : errorMessage;
      captureError("api/cron/lead-email-digests/deliver", error, {
        tenantId: batch.tenantId,
        batchId: batch.id,
      });
    }

    try {
      await finishLeadEmailDigest(service, batch, { success, error: errorMessage });
    } catch (error) {
      captureError("api/cron/lead-email-digests/finish", error, {
        tenantId: batch.tenantId,
        batchId: batch.id,
      });
      return false;
    }
    return success;
  });
  const sent = results.filter(Boolean).length;
  const failed = results.length - sent;
  return cronJson({ claimed: batches.length, sent, failed }, failed > 0 ? 500 : 200);
}

function cronJson(payload: unknown, status: number): Response {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validBearerToken(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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
