import { isVehicleImageId } from "@/lib/vehicleImages";
import { authorizeVehicleImageRequest } from "@/lib/vehicleImages.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { id: vehicleId, imageId } = await context.params;
  if (!isVehicleImageId(imageId)) return json({ error: "Image not found." }, 404);
  const authorization = await authorizeVehicleImageRequest(request, vehicleId);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const { data, error } = await authorization.supabase.rpc("set_primary_vehicle_image", {
    p_tenant_id: authorization.tenant.tenantId,
    p_vehicle_id: vehicleId,
    p_image_id: imageId,
  });
  if (error || data !== true) {
    return json({ error: error?.message ?? "Unable to set the primary image." }, 409);
  }
  return Response.json({ primaryImageId: imageId }, {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
