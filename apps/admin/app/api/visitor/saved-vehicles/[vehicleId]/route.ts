import { removeVehicleSaveForVisitor } from "@lume/db";
import { createServiceClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { isAllowedOrigin } from "@/lib/origin";
import { resolveVisitor, visitorCorsHeaders } from "@/lib/visitorSession";
import { checkPublicRouteRateLimit, rateLimitedResponse } from "@/lib/rateLimit";
import { captureError } from "@/lib/observability";
import { isVehicleId } from "@/lib/savedVehicles.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ vehicleId: string }> },
): Promise<Response> {
  if (!isAllowedOrigin(request)) return json(request, { error: "Forbidden origin" }, 403);
  const rateLimit = checkPublicRouteRateLimit("visitor-saved-vehicles-write", request);
  if (!rateLimit.allowed) return rateLimitedResponse(rateLimit, visitorCorsHeaders(request));
  const { vehicleId } = await params;
  if (!isVehicleId(vehicleId)) return json(request, { error: "A valid vehicle ID is required" }, 400);
  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json(request, { error: "Unknown or inactive tenant" }, 404);
  const client = createServiceClient();
  const visitor = await resolveVisitor(request, tenant.tenantId, client);
  if (!visitor) return json(request, { error: "Not authenticated" }, 401);
  try {
    await removeVehicleSaveForVisitor(client, { tenantId: tenant.tenantId, visitorId: visitor.id, vehicleId });
    return new Response(null, { status: 204, headers: visitorCorsHeaders(request) });
  } catch (error) {
    captureError("api/visitor/saved-vehicles/remove", error, { tenantId: tenant.tenantId, visitorId: visitor.id, vehicleId });
    return json(request, { error: "Unable to remove saved vehicle" }, 500);
  }
}

function json(request: Request, payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...visitorCorsHeaders(request) },
  });
}
