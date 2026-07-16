import { accrueLoyaltyPoints, saveVehicleForVisitor } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor, visitorCorsHeaders } from "@/lib/visitorSession";
import { checkPublicRouteRateLimit, rateLimitedResponse, type PublicRouteScope } from "@/lib/rateLimit";
import { captureError } from "@/lib/observability";
import { isPublicVehicle, isVehicleId, listVisitorSavedVehicles } from "@/lib/savedVehicles.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
}

export async function GET(request: Request): Promise<Response> {
  const context = await visitorContext(request, "visitor-saved-vehicles-read");
  if (context instanceof Response) return context;
  try {
    const saves = await listVisitorSavedVehicles(context.client, context.tenantId, context.visitorId);
    return json(request, { savedVehicles: saves }, 200);
  } catch (error) {
    captureError("api/visitor/saved-vehicles/list", error, { tenantId: context.tenantId, visitorId: context.visitorId });
    return json(request, { error: "Unable to load saved vehicles" }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const context = await visitorContext(request, "visitor-saved-vehicles-write");
  if (context instanceof Response) return context;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Invalid JSON" }, 400);
  }
  const vehicleId = typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>).vehicleId
    : null;
  if (typeof vehicleId !== "string" || !isVehicleId(vehicleId)) {
    return json(request, { error: "A valid vehicle ID is required" }, 400);
  }

  try {
    if (!(await isPublicVehicle(context.client, context.tenantId, vehicleId))) {
      return json(request, { error: "Vehicle is unavailable" }, 400);
    }
    const result = await saveVehicleForVisitor(context.client, {
      tenantId: context.tenantId,
      visitorId: context.visitorId,
      vehicleId,
    });
    if (result.created) {
      await accrueLoyaltyPoints(context.client, {
        tenantId: context.tenantId,
        visitorId: context.visitorId,
        eventType: "saved_vehicle",
        idempotencyKey: `saved-vehicle:${context.visitorId}:${vehicleId}`,
        description: "Saved a vehicle",
        metadata: { vehicleId },
      }).catch((error: unknown) => {
        captureError("api/visitor/saved-vehicles/loyalty", error, { tenantId: context.tenantId, visitorId: context.visitorId, vehicleId });
      });
    }
    return json(request, { savedVehicle: result.saved, created: result.created }, result.created ? 201 : 200);
  } catch (error) {
    captureError("api/visitor/saved-vehicles/save", error, { tenantId: context.tenantId, visitorId: context.visitorId, vehicleId });
    return json(request, { error: "Unable to save vehicle" }, 500);
  }
}

async function visitorContext(request: Request, rateLimitKey: PublicRouteScope): Promise<
  { client: ReturnType<typeof createServiceClient>; tenantId: string; visitorId: string } | Response
> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);
  const rateLimit = checkPublicRouteRateLimit(rateLimitKey, request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, visitorCorsHeaders(request));
  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);
  const client = createServiceClient();
  const visitor = await resolveVisitor(request, tenant.tenantId, client);
  if (!visitor) return json(request, { error: "Not authenticated" }, 401);
  return { client, tenantId: tenant.tenantId, visitorId: visitor.id };
}

function json(request: Request, payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...visitorCorsHeaders(request) },
  });
}
