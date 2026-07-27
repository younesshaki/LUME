import { timingSafeEqual } from "node:crypto";
import {
  claimInventoryExportRuns,
  completeInventoryExportRun,
  enqueueDueInventoryExportRuns,
  failInventoryExportRun,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { executeManagedInventoryExportRun } from "@/lib/managedInventoryExportRun.server";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Claim and execute scheduled/manual inventory syndication runs. */
export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return json({ error: "Inventory export worker is not configured." }, 503);
  if (!validBearerToken(request.headers.get("authorization"), cronSecret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const service = createServiceClient();
  let enqueued = 0;
  let runs: Awaited<ReturnType<typeof claimInventoryExportRuns>>;
  try {
    enqueued = await enqueueDueInventoryExportRuns(service, 50);
    runs = await claimInventoryExportRuns(service, 5);
  } catch (error) {
    captureError("api/cron/inventory-export-runs/claim", error);
    return json({ error: "Unable to claim inventory export runs." }, 500);
  }

  const results = await mapWithConcurrency(runs, 2, async (run) => {
    try {
      const completion = await executeManagedInventoryExportRun(service, run);
      const completed = await completeInventoryExportRun(service, run, completion);
      return completed ? completion.status : "stale" as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inventory export failed.";
      try {
        const failure = await failInventoryExportRun(service, run, message);
        return failure.retrying ? "retrying" as const : "dead_letter" as const;
      } catch (finishError) {
        captureError("api/cron/inventory-export-runs/finish", finishError, {
          tenantId: run.tenantId,
          runId: run.id,
        });
        return "worker_error" as const;
      }
    }
  });

  const workerErrors = results.filter((status) => status === "worker_error").length;
  return json({
    enqueued,
    claimed: runs.length,
    succeeded: results.filter((status) => status === "succeeded").length,
    skipped: results.filter((status) => status === "skipped").length,
    retrying: results.filter((status) => status === "retrying").length,
    deadLetter: results.filter((status) => status === "dead_letter").length,
    stale: results.filter((status) => status === "stale").length,
    workerErrors,
  }, workerErrors > 0 ? 500 : 200);
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
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await mapper(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}
