import { vehicleApi } from "../../../server/vehicles/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => vehicleApi(request, "inventory");
export const OPTIONS = GET;
