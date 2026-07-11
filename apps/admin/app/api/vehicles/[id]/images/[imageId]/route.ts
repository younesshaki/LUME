import { readR2VehicleImageConfig } from "@/lib/r2Config";
import { deleteR2Object } from "@/lib/r2Objects.server";
import { isVehicleImageId } from "@/lib/vehicleImages";
import { authorizeVehicleImageRequest } from "@/lib/vehicleImages.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; imageId: string }> };

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { id: vehicleId, imageId } = await context.params;
  if (!isVehicleImageId(imageId)) return json({ error: "Image not found." }, 404);
  const authorization = await authorizeVehicleImageRequest(request, vehicleId);
  if (!authorization.ok) return json({ error: authorization.error }, authorization.status);

  const { data, error } = await authorization.supabase.rpc("delete_vehicle_image", {
    p_tenant_id: authorization.tenant.tenantId,
    p_vehicle_id: vehicleId,
    p_image_id: imageId,
  });
  const deleted = data?.[0];
  if (error || !deleted) {
    return json({ error: error?.message ?? "Unable to delete the vehicle image." }, 409);
  }

  const config = readR2VehicleImageConfig();
  const storageDeleted = config ? await deleteR2Object(config, deleted.r2_key) : false;
  return Response.json({
    deleted: true,
    storageDeleted,
    promotedImageId: deleted.promoted_image_id,
    ...(!storageDeleted
      ? { warning: "Image metadata was removed, but the R2 object needs reconciliation." }
      : {}),
  }, {
    status: 200,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function json(payload: unknown, status: number): Response {
  return Response.json(payload, { status, headers: { "Cache-Control": "private, no-store" } });
}
