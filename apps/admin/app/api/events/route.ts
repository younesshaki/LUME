import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { resolveVisitor } from "@/lib/visitorSession";
import { captureError } from "@/lib/observability";
import { isUuid, parseAnalyticsEvents } from "@/lib/conversionEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: corsHeadersFor(request) }); }

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);
  const limit = checkPublicRouteRateLimit("conversion-events", request);
  if (!limit.allowed) return rateLimitedResponse(limit, corsHeadersFor(request));
  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);
  let body: unknown;
  try { body = await request.json(); } catch { return json(request, { error: "Invalid JSON" }, 400); }
  const events = parseAnalyticsEvents(body);
  if (!events) return json(request, { error: "Invalid analytics event batch" }, 400);
  const client = createServiceClient();
  const visitor = await resolveVisitor(request, tenant.tenantId, client);
  const anonymousSessionId = typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).anonymousSessionId
    : null;
  const sessionId = typeof anonymousSessionId === "string" && isUuid(anonymousSessionId)
    ? anonymousSessionId
    : null;
  for (const event of events) {
    if (event.vehicleId) {
      const { data } = await client.from("vehicles").select("id").eq("tenant_id", tenant.tenantId).eq("id", event.vehicleId).maybeSingle();
      if (!data) return json(request, { error: "Vehicle is unavailable" }, 400);
    }
  }
  const { error } = await client.from("conversion_events").upsert(events.map((event) => ({
    tenant_id: tenant.tenantId, event_id: event.eventId, visitor_id: visitor?.id ?? null, anonymous_session_id: sessionId,
    vehicle_id: event.vehicleId ?? null, event_name: event.name, event_category: "analytics" as const, metadata: event.metadata ?? {},
  })), { onConflict: "tenant_id,event_id", ignoreDuplicates: true });
  if (error) { captureError("api/events", error, { tenantId: tenant.tenantId }); return json(request, { error: "Unable to record analytics" }, 500); }
  return json(request, { recorded: events.length }, 202);
}
function json(request: Request, payload: unknown, status: number) { return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json", ...corsHeadersFor(request) } }); }
