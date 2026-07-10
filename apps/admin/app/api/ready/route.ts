import { createServiceClient } from "@lume/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Readiness probe: verifies the app can reach its primary datastore. */
export async function GET(): Promise<Response> {
  const startedAt = performance.now();
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("tenants").select("id").limit(1);
    if (error) throw error;

    return response("ready", 200, performance.now() - startedAt);
  } catch (error) {
    console.error(
      "[/api/ready] database check failed:",
      error instanceof Error ? error.message : "unknown error"
    );
    return response("unavailable", 503, performance.now() - startedAt);
  }
}

function response(status: "ready" | "unavailable", code: number, durationMs: number): Response {
  return Response.json(
    {
      status,
      checks: { database: status === "ready" ? "ok" : "failed" },
      durationMs: Math.round(durationMs),
      timestamp: new Date().toISOString(),
    },
    { status: code, headers: { "Cache-Control": "no-store" } }
  );
}
