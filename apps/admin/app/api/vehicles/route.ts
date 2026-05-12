/**
 * GET /api/vehicles?make=BMW&bodyStyle=SUV&priceMax=100000&limit=50
 *
 * Public, tenant-scoped vehicle listing. Reads from Supabase via the anon
 * client + RLS — only vehicles for active tenants are visible to anon
 * callers. The tenant is resolved from the request the same way /api/chat
 * resolves it (header / query / subdomain).
 *
 * Returns: { vehicles: Vehicle[], totalCount: number, hasMore: boolean }
 */
import type { VehicleListResponse } from "@lume/types";
import { rowToVehicle } from "@lume/db";
import { createAnonServerClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    return json({ error: "Forbidden origin" }, 403);
  }

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  const url = new URL(request.url);
  const sp = url.searchParams;
  const limit = clamp(parseInt(sp.get("limit") || "") || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(sp.get("offset") || "") || 0);

  const supabase = createAnonServerClient();
  let query = supabase
    .from("vehicles")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenant.tenantId);

  // Equality filters
  for (const [param, column] of [
    ["make", "make"],
    ["model", "model"],
    ["bodyStyle", "body_style"],
    ["stockType", "stock_type"],
    ["fuelType", "fuel_type"],
    ["drivetrain", "drivetrain"],
    ["sellerState", "seller_state"],
    ["sellerCity", "seller_city"],
  ] as const) {
    const value = sp.get(param);
    if (value) query = query.eq(column, value);
  }

  // Range filters
  const yearMin = parseInt(sp.get("yearMin") || "");
  if (Number.isFinite(yearMin)) query = query.gte("year", yearMin);
  const yearMax = parseInt(sp.get("yearMax") || "");
  if (Number.isFinite(yearMax)) query = query.lte("year", yearMax);
  const priceMin = parseInt(sp.get("priceMin") || "");
  if (Number.isFinite(priceMin) && priceMin > 0) query = query.gte("price", priceMin);
  const priceMax = parseInt(sp.get("priceMax") || "");
  if (Number.isFinite(priceMax) && priceMax > 0) query = query.lte("price", priceMax);
  const mileageMax = parseInt(sp.get("mileageMax") || "");
  if (Number.isFinite(mileageMax) && mileageMax > 0)
    query = query.or(`mileage.lte.${mileageMax},mileage.is.null`);

  // Sort
  const sort = sp.get("sort") || "recommended";
  switch (sort) {
    case "price_asc":   query = query.order("price", { ascending: true }); break;
    case "price_desc":  query = query.order("price", { ascending: false }); break;
    case "year_desc":   query = query.order("year", { ascending: false }); break;
    case "year_asc":    query = query.order("year", { ascending: true }); break;
    case "mileage_asc": query = query.order("mileage", { ascending: true, nullsFirst: false }); break;
    case "mileage_desc":query = query.order("mileage", { ascending: false, nullsFirst: false }); break;
    default:            query = query.order("is_special", { ascending: false }).order("created_at", { ascending: false });
  }

  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error("[/api/vehicles] query error:", error.message);
    return json({ error: error.message }, 500, request);
  }

  const vehicles = (data ?? []).map(rowToVehicle);
  const totalCount = count ?? vehicles.length;
  const response: VehicleListResponse = {
    vehicles,
    totalCount,
    hasMore: offset + vehicles.length < totalCount,
  };
  return json(response, 200, request);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function json(payload: unknown, status: number, request?: Request): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
    },
  });
}
