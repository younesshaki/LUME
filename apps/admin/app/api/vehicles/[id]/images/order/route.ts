import { parseVehicleImageOrder } from "@/lib/vehicleImages";
import { authorizeVehicleImageRequest } from "@/lib/vehicleImages.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id: vehicleId } = await context.params;
  const authorization = await authorizeVehicleImageRequest(request, vehicleId);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const body = await readJson(request);
  const imageIds = isRecord(body) ? parseVehicleImageOrder(body.imageIds) : null;
  if (!imageIds) return json({ error: "Provide the complete ordered image ID list." }, 400);

  const { data, error } = await authorization.supabase.rpc("reorder_vehicle_images", {
    p_tenant_id: authorization.tenant.tenantId,
    p_vehicle_id: vehicleId,
    p_image_ids: imageIds,
  });
  if (error || data !== true) {
    return json({ error: error?.message ?? "Unable to reorder vehicle images." }, 409);
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}

async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
