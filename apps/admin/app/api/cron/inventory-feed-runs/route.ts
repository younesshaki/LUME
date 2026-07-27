import { timingSafeEqual } from "node:crypto";
import {
  claimInventoryFeedRuns,
  completeInventoryFeedRun,
  enqueueDueInventoryFeedRuns,
  failInventoryFeedRun,
  heartbeatInventoryFeedRun,
} from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { executeManagedInventoryFeedRun } from "@/lib/managedInventoryFeedRun.server";
import { ManagedFeedLeaseLostError } from "@/lib/managedFeedLease";
import { captureError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Claim and execute scheduled/manual managed inventory feed synchronizations. */
export async function GET(request: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return json({ error: "Inventory feed worker is not configured." }, 503);
  if (!validBearerToken(request.headers.get("authorization"), cronSecret)) {
    return json({ error: "Unauthorized." }, 401);
  }

  const service = createServiceClient();
  let enqueued = 0;
  let runs: Awaited<ReturnType<typeof claimInventoryFeedRuns>>;
  try {
    enqueued = await enqueueDueInventoryFeedRuns(service, 50);
    runs = await claimInventoryFeedRuns(service, 10);
  } catch (error) {
    captureError("api/cron/inventory-feed-runs/claim", error);
    return json({ error: "Unable to claim inventory feed runs." }, 500);
  }

  const results = await mapWithConcurrency(runs, 2, async (run) => {
    try {
      const completion = await withFeedLeaseHeartbeat(service, run, (signal) =>
        executeManagedInventoryFeedRun(service, run, { signal }),
      );
      const completed = await completeInventoryFeedRun(service, run, completion);
      return completed ? completion.status : "stale" as const;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Managed inventory feed failed.";
      try {
        const failure = await failInventoryFeedRun(service, run, message);
        return failure.retrying ? "retrying" as const : "dead_letter" as const;
      } catch (finishError) {
        captureError("api/cron/inventory-feed-runs/finish", finishError, {
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
    partial: results.filter((status) => status === "partial").length,
    retrying: results.filter((status) => status === "retrying").length,
    deadLetter: results.filter((status) => status === "dead_letter").length,
    stale: results.filter((status) => status === "stale").length,
    workerErrors,
  }, workerErrors > 0 ? 500 : 200);
}

/** Keep long parses/syncs within the durable tenant lease's stale window. */
async function withFeedLeaseHeartbeat<T>(
  service: ReturnType<typeof createServiceClient>,
  run: Awaited<ReturnType<typeof claimInventoryFeedRuns>>[number],
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const markLeaseLost = (error: unknown) => {
    const leaseError = error instanceof Error
      ? error
      : new ManagedFeedLeaseLostError("Managed inventory feed lease was lost.");
    if (!controller.signal.aborted) controller.abort(leaseError);
    captureError("api/cron/inventory-feed-runs/heartbeat", leaseError, {
      tenantId: run.tenantId,
      runId: run.id,
    });
  };
  const heartbeat = async () => {
    try {
      const active = await heartbeatInventoryFeedRun(service, run);
      if (!active) markLeaseLost(new ManagedFeedLeaseLostError());
    } catch (error) {
      // Continuing after an unavailable heartbeat would allow a stale worker
      // to mutate inventory without proving it still owns the tenant lease.
      markLeaseLost(error);
    }
  };

  await heartbeat();
  if (controller.signal.aborted) {
    throw controller.signal.reason instanceof Error
      ? controller.signal.reason
      : new ManagedFeedLeaseLostError();
  }
  const timer = setInterval(() => {
    void heartbeat();
  }, 60_000);

  try {
    return await work(controller.signal);
  } finally {
    clearInterval(timer);
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
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await mapper(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}
