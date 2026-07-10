export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness probe: proves the application process can serve requests. */
export function GET(): Response {
  return Response.json(
    {
      status: "ok",
      service: "lume-admin",
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "development",
      timestamp: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
