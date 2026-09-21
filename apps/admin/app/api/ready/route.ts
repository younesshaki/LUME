import { createServiceClient } from "@lume/db/server";
import { conversationMemoryMode } from "@/lib/conversationMemory.server";
import { posthogServerMode } from "@/lib/posthog.server";

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
      checks: {
        database: status === "ready" ? "ok" : "failed",
        // Reported, never enforced: "local" is a legitimate deployment shape
        // and "degraded" still serves chat, so neither makes the app
        // unready. This exists so the mode is observable at all — it was
        // previously impossible to tell from outside which one was running.
        // A mode name only; no host, URL or token can appear here.
        conversationMemory: conversationMemoryMode(),
        // A configuration-mode only signal. PostHog remains best-effort, so
        // its absence must not mark the application unavailable.
        posthog: posthogServerMode(),
      },
      durationMs: Math.round(durationMs),
      timestamp: new Date().toISOString(),
    },
    { status: code, headers: { "Cache-Control": "no-store" } }
  );
}
