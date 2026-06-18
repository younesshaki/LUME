/**
 * GET /api/vehicles?q=BMW&bodyStyle=SUV&priceMax=100000&limit=50
 *
 * Public, tenant-scoped vehicle listing. Reads from Supabase via the anon
 * client + RLS — only vehicles for active tenants are visible to anon callers.
 *
 * Returns: { vehicles: Vehicle[], totalCount: number, hasMore: boolean, facets }
 */
import type { VehicleFacets, VehicleListResponse } from "@lume/types";
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

  let query = buildVehicleQuery(supabase, tenant.tenantId, sp, {
    limit,
    offset,
    useFullTextSearch: true,
  });
  let { data, count, error } = await query;

  if (error && searchTerm(sp) && searchVectorMissing(error.message)) {
    query = buildVehicleQuery(supabase, tenant.tenantId, sp, {
      limit,
      offset,
      useFullTextSearch: false,
    });
    ({ data, count, error } = await query);
  }

  if (error) {
    console.error("[/api/vehicles] query error:", error.message);
    return json({ error: error.message }, 500, request);
  }

  const facets = await loadVehicleFacets(supabase, tenant.tenantId, sp);
  const vehicles = (data ?? []).map(rowToVehicle);
  const totalCount = count ?? vehicles.length;
  const response: VehicleListResponse = {
    vehicles,
    totalCount,
    hasMore: offset + vehicles.length < totalCount,
    facets,
  };
  return json(response, 200, request);
}

function buildVehicleQuery(
  supabase: ReturnType<typeof createAnonServerClient>,
  tenantId: string,
  sp: URLSearchParams,
  options: { limit: number; offset: number; useFullTextSearch: boolean }
) {
  let query = supabase
    .from("vehicles")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenantId);

  const search = searchTerm(sp);
  if (search) {
    if (options.useFullTextSearch) {
      query = query.textSearch("search_vector", search, {
        config: "simple",
        type: "websearch",
      });
    } else {
      const like = sanitizeLikeSearch(search);
      if (like) {
        query = query.or(
          [
            `make.ilike.%${like}%`,
            `model.ilike.%${like}%`,
            `trim.ilike.%${like}%`,
            `body_style.ilike.%${like}%`,
            `fuel_type.ilike.%${like}%`,
            `exterior_color.ilike.%${like}%`,
            `seller_city.ilike.%${like}%`,
            `seller_state.ilike.%${like}%`,
          ].join(",")
        );
      }
    }
  }

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

  const yearMin = parseInt(sp.get("yearMin") || "");
  if (Number.isFinite(yearMin)) query = query.gte("year", yearMin);
  const yearMax = parseInt(sp.get("yearMax") || "");
  if (Number.isFinite(yearMax)) query = query.lte("year", yearMax);
  const priceMin = parseInt(sp.get("priceMin") || "");
  if (Number.isFinite(priceMin) && priceMin > 0) query = query.gte("price", priceMin);
  const priceMax = parseInt(sp.get("priceMax") || "");
  if (Number.isFinite(priceMax) && priceMax > 0) query = query.lte("price", priceMax);
  const mileageMax = parseInt(sp.get("mileageMax") || "");
  if (Number.isFinite(mileageMax) && mileageMax > 0) {
    query = query.or(`mileage.lte.${mileageMax},mileage.is.null`);
  }

  const sort = sp.get("sort") || "recommended";
  switch (sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "year_desc":
      query = query.order("year", { ascending: false });
      break;
    case "year_asc":
      query = query.order("year", { ascending: true });
      break;
    case "mileage_asc":
      query = query.order("mileage", { ascending: true, nullsFirst: false });
      break;
    case "mileage_desc":
      query = query.order("mileage", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("is_special", { ascending: false }).order("created_at", {
        ascending: false,
      });
  }

  return query.range(options.offset, options.offset + options.limit - 1);
}

async function loadVehicleFacets(
  supabase: ReturnType<typeof createAnonServerClient>,
  tenantId: string,
  sp: URLSearchParams
): Promise<VehicleFacets> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("make, model, seller_state, seller_city")
    .eq("tenant_id", tenantId);

  if (error) {
    console.warn("[/api/vehicles] facet query error:", error.message);
    return { makes: [], models: [], states: [], cities: [] };
  }

  const selectedMake = sp.get("make") ?? "";
  const selectedState = sp.get("sellerState") ?? "";
  return {
    makes: uniqueSorted((data ?? []).map((row) => row.make)),
    models: uniqueSorted(
      (data ?? [])
        .filter((row) => !selectedMake || row.make === selectedMake)
        .map((row) => row.model)
    ),
    states: uniqueSorted((data ?? []).map((row) => row.seller_state)),
    cities: uniqueSorted(
      (data ?? [])
        .filter((row) => !selectedState || row.seller_state === selectedState)
        .map((row) => row.seller_city)
    ),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function searchTerm(sp: URLSearchParams): string {
  return (sp.get("q") ?? sp.get("query") ?? "").trim();
}

function sanitizeLikeSearch(search: string): string {
  return search.replace(/[%,]/g, " ").replace(/\s+/g, " ").trim();
}

function searchVectorMissing(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("search_vector") || normalized.includes("websearch_to_tsquery");
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
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
