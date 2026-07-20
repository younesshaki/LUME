/**
 * Public, tenant-scoped inventory list. The database function projects only
 * card fields and the ordered managed primary image, so a page is one data
 * query rather than a vehicle query plus an image query plus a facet scan.
 */
import type { Database } from "@lume/db";
import { quotaExceededPayload, quotaResponseHeaders } from "@lume/db";
import type { VehicleListResponse } from "@lume/types";
import { createAnonServerClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";
import { readR2PublicBaseUrl } from "@/lib/r2Config";
import { vehicleImagePublicUrl } from "@/lib/vehicleImages";
import { checkPublicApiQuota } from "@/lib/quota.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
type InventoryRow = Database["public"]["Functions"]["public_vehicle_inventory"]["Returns"][number];

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json({ error: "Forbidden origin" }, 403);

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  // This is enforcement, not best-effort telemetry, so it intentionally stays
  // in the request path. The standalone public function only defers metering.
  const quota = await checkPublicApiQuota(tenant.tenantId, "vehicle_requests");
  if (!quota.allowed) return json(quotaExceededPayload(quota), 429, request);
  const quotaHeaders = quotaResponseHeaders(quota);

  const sp = new URL(request.url).searchParams;
  const limit = clamp(parseInt(sp.get("limit") || "") || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(sp.get("offset") || "") || 0);
  const includeCount = sp.get("includeCount") === "true";
  const supabase = createAnonServerClient();

  let query = buildVehicleQuery(supabase, tenant.tenantId, sp, {
    limit,
    offset,
    includeCount,
    useFullTextSearch: true,
  });
  let { data, count, error } = await query;

  if (error && searchTerm(sp) && searchVectorMissing(error.message)) {
    query = buildVehicleQuery(supabase, tenant.tenantId, sp, {
      limit,
      offset,
      includeCount,
      useFullTextSearch: false,
    });
    ({ data, count, error } = await query);
  }

  if (error) {
    console.error("[/api/vehicles] query error:", error.message);
    return json({ error: error.message }, 500, request, quotaHeaders);
  }

  const pageRows = (data ?? []) as InventoryRow[];
  const hasMore = pageRows.length > limit;
  const rows = hasMore ? pageRows.slice(0, limit) : pageRows;
  const publicBaseUrl = readR2PublicBaseUrl() ?? "";
  const vehicles = rows.map((row) => inventoryRowToVehicle(row, publicBaseUrl));
  const response: VehicleListResponse = {
    vehicles,
    hasMore,
    ...(includeCount && count !== null ? { totalCount: count } : {}),
  };

  const etag = rows[0] ? `W/"inventory-${tenant.tenantId}-${rows[0].catalog_version}"` : null;
  const cacheHeaders = {
    ...quotaHeaders,
    "Cache-Control": "private, no-cache",
    Vary: "Origin, X-Lume-Tenant",
    ...(etag ? { ETag: etag } : {}),
  };
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }
  return json(response, 200, request, cacheHeaders);
}

function buildVehicleQuery(
  supabase: ReturnType<typeof createAnonServerClient>,
  tenantId: string,
  sp: URLSearchParams,
  options: {
    limit: number;
    offset: number;
    includeCount: boolean;
    useFullTextSearch: boolean;
  },
) {
  let query = supabase
    .rpc(
      "public_vehicle_inventory",
      { p_tenant_id: tenantId },
      options.includeCount ? { count: "exact" } : {},
    )
    .select("*");

  const search = searchTerm(sp);
  if (search) {
    if (options.useFullTextSearch) {
      query = query.textSearch("search_vector", search, { config: "simple", type: "websearch" });
    } else {
      const like = sanitizeLikeSearch(search);
      if (like) {
        query = query.or([
          `make.ilike.%${like}%`,
          `model.ilike.%${like}%`,
          `trim.ilike.%${like}%`,
          `body_style.ilike.%${like}%`,
          `fuel_type.ilike.%${like}%`,
          `exterior_color.ilike.%${like}%`,
          `seller_city.ilike.%${like}%`,
          `seller_state.ilike.%${like}%`,
        ].join(","));
      }
    }
  }

  for (const [param, column] of [
    ["make", "make"], ["model", "model"], ["bodyStyle", "body_style"],
    ["stockType", "stock_type"], ["fuelType", "fuel_type"],
    ["drivetrain", "drivetrain"], ["sellerState", "seller_state"],
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

  switch (sp.get("sort") || "recommended") {
    case "created_desc": query = query.order("created_at", { ascending: false }); break;
    case "price_asc": query = query.order("price", { ascending: true }); break;
    case "price_desc": query = query.order("price", { ascending: false }); break;
    case "year_desc": query = query.order("year", { ascending: false }); break;
    case "year_asc": query = query.order("year", { ascending: true }); break;
    case "mileage_asc":
      query = query.order("mileage", { ascending: true, nullsFirst: false });
      break;
    case "mileage_desc":
      query = query.order("mileage", { ascending: false, nullsFirst: false });
      break;
    default:
      query = query.order("is_special", { ascending: false }).order("created_at", { ascending: false });
  }

  // Stable tie-breaking prevents duplicates or omissions between offset pages.
  return query.order("id", { ascending: true }).range(options.offset, options.offset + options.limit);
}

function inventoryRowToVehicle(row: InventoryRow, publicBaseUrl: string) {
  const primaryImageSrc = row.primary_image_r2_key
    ? vehicleImagePublicUrl(publicBaseUrl, row.primary_image_r2_key)
    : undefined;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    ...(row.external_id ? { externalId: row.external_id } : {}),
    stockType: row.stock_type ?? "",
    year: row.year,
    make: row.make,
    model: row.model,
    trim: row.trim,
    price: row.price,
    mileage: row.mileage,
    bodyStyle: row.body_style,
    exteriorColor: row.exterior_color,
    interiorColor: row.interior_color,
    drivetrain: row.drivetrain,
    fuelType: row.fuel_type,
    imageSrc: row.image_src,
    ...(primaryImageSrc ? { primaryImageSrc } : {}),
    ...(row.primary_image_alt ? { primaryImageAlt: row.primary_image_alt } : {}),
    sellerCity: row.seller_city,
    sellerState: row.seller_state,
    isSpecial: row.is_special,
    ...(row.special_image_src ? { specialImageSrc: row.special_image_src } : {}),
    status: "live" as const,
    soldAt: row.sold_at,
    soldPrice: row.sold_price,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
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

function json(
  payload: unknown,
  status: number,
  request?: Request,
  responseHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(request ? corsHeadersFor(request) : {}),
      ...responseHeaders,
    },
  });
}
