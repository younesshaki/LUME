import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@lume/db/server";
import { captureError } from "@/lib/observability";
import { runKnowledgeIndexingJob } from "@/lib/knowledgeIndexing.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret)
    return Response.json(
      { error: "Knowledge indexing is not configured." },
      { status: 503 },
    );
  if (!validBearer(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const client = createServiceClient();
  const { data, error } = await client.rpc("claim_rag_indexing_jobs", {
    p_limit: 5,
  });
  if (error) {
    captureError("api/cron/rag-indexing/claim", error);
    return Response.json(
      { error: "Unable to claim knowledge indexing jobs." },
      { status: 500 },
    );
  }
  const results = [];
  for (const job of data ?? []) {
    try {
      results.push(await runKnowledgeIndexingJob(client, job));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Knowledge indexing failed.";
      const failure = await client.rpc("fail_rag_indexing_job", {
        p_job_id: job.id,
        p_error: message,
      });
      if (failure.error) {
        captureError("api/cron/rag-indexing/fail", failure.error, {
          tenantId: job.tenant_id,
          jobId: job.id,
        });
        results.push("worker_error");
      } else {
        results.push(failure.data);
      }
    }
  }
  const workerErrors = results.filter(
    (value) => value === "worker_error",
  ).length;
  return Response.json(
    {
      claimed: data?.length ?? 0,
      completed: results.filter((value) => value === "completed").length,
      superseded: results.filter((value) => value === "superseded").length,
      retrying: results.filter((value) => value === "retrying").length,
      deadLetter: results.filter((value) => value === "dead_letter").length,
      workerErrors,
    },
    {
      status: workerErrors ? 500 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function validBearer(header: string | null, secret: string): boolean {
  const actual = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
