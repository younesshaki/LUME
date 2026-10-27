import { vehicleApi } from "../../../../server/vehicles/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, { params }: Context) =>
  vehicleApi(request, "detail", (await params).id);
export const OPTIONS = GET;
