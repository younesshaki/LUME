import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Standalone Vercel function: intentionally no workspace or relative imports.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SUBDOMAIN_RESERVED = new Set(["www", "app", "api", "admin", "static", "cdn"]);

type VercelRequest = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (payload: unknown) => void;
  end: () => void;
};

type InventoryRow = {
  id: string;
  tenant_id: string;
  external_id: string | null;
  stock_type: string | null;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  body_style: string;
  exterior_color: string;
  interior_color: string;
  drivetrain: string;
  fuel_type: string;
  image_src: string;
  seller_city: string;
  seller_state: string;
  is_special: boolean;
  special_image_src: string | null;
  search_vector: string | null;
  status: string;
  sold_at: string | null;
  sold_price: number | null;
  created_at: string;
  primary_image_r2_key: string | null;
  primary_image_alt: string | null;
  catalog_version: number;
};

type RootDatabase = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      tenant_by_slug: {
        Args: { p_slug: string };
        Returns: Array<{ id: string; slug: string; status: string }>;
      };
      increment_usage_event: {
        Args: {
          p_tenant_id: string;
          p_event_type: "vehicle_requests";
          p_period_start?: string | null;
          p_increment?: number;
        };
        Returns: number;
      };
      public_vehicle_inventory: {
        Args: { p_tenant_id: string };
        Returns: InventoryRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type RootSupabaseClient = SupabaseClient<RootDatabase, "public">;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    return res.status(204).end();
  }
  if (req.method !== "GET") return json(req, res, { error: "Method not allowed" }, 405);
  if (!isAllowedOrigin(req)) return json(req, res, { error: "Forbidden origin" }, 403);

  const supabaseUrl = process.env.SUPABASE_URL
    ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(req, res, { error: "Supabase server env not configured" }, 500);
  }

  const supabase = createClient<RootDatabase>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceClient = serviceRoleKey
    ? createClient<RootDatabase>(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const tenant = await getTenantFromRequest(req, supabase);
  if (!tenant) return json(req, res, { error: "Unknown or inactive tenant" }, 404);

  // Usage metering is best-effort and must not extend the public response's
  // critical path. Quota enforcement remains in the Next API implementation.
  if (serviceClient) {
    void Promise.resolve(serviceClient.rpc("increment_usage_event", {
      p_tenant_id: tenant.tenantId,
      p_event_type: "vehicle_requests",
      p_period_start: null,
      p_increment: 1,
    })).catch(() => undefined);
  }

  const limit = clamp(parseInt(query(req, "limit") || "") || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(query(req, "offset") || "") || 0);
  const includeCount = query(req, "includeCount") === "true";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) params.set(key, first);
  }

  let inventoryQuery = buildVehicleQuery(supabase, tenant.tenantId, params, {
    limit,
    offset,
    includeCount,
    useFullTextSearch: true,
  });
  let { data, count, error } = await inventoryQuery;
  if (error && searchTerm(params) && searchVectorMissing(error.message)) {
    inventoryQuery = buildVehicleQuery(supabase, tenant.tenantId, params, {
      limit,
      offset,
      includeCount,
      useFullTextSearch: false,
    });
    ({ data, count, error } = await inventoryQuery);
  }

  if (error) {
    console.error("[/api/vehicles] query error:", error.message);
    return json(req, res, { error: error.message }, 500);
  }

  const pageRows = (data ?? []) as InventoryRow[];
  const hasMore = pageRows.length > limit;
  const rows = hasMore ? pageRows.slice(0, limit) : pageRows;
  const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim()
    ?? process.env.VITE_R2_PUBLIC_BASE_URL?.trim()
    ?? "";
  const vehicles = rows.map((row) => rowToVehicle(row, r2PublicBaseUrl));
  const payload = {
    vehicles,
    hasMore,
    ...(includeCount && count !== null ? { totalCount: count } : {}),
  };

  const etag = rows[0] ? `W/"inventory-${tenant.tenantId}-${rows[0].catalog_version}"` : null;
  res.setHeader("Cache-Control", "private, no-cache");
  res.setHeader("Vary", "Origin, X-Lume-Tenant");
  if (etag) res.setHeader("ETag", etag);
  if (etag && header(req, "if-none-match") === etag) {
    setCorsHeaders(req, res);
    return res.status(304).end();
  }
  return json(req, res, payload, 200);
}

function buildVehicleQuery(
  supabase: RootSupabaseClient,
  tenantId: string,
  sp: URLSearchParams,
  options: {
    limit: number;
    offset: number;
    includeCount: boolean;
    useFullTextSearch: boolean;
  },
) {
  let vehicleQuery = supabase
    .rpc(
      "public_vehicle_inventory",
      { p_tenant_id: tenantId },
      options.includeCount ? { count: "exact" } : {},
    )
    .select("*");

  const search = searchTerm(sp);
  if (search) {
    if (options.useFullTextSearch) {
      vehicleQuery = vehicleQuery.textSearch("search_vector", search, {
        config: "simple",
        type: "websearch",
      });
    } else {
      const like = sanitizeLikeSearch(search);
      if (like) {
        vehicleQuery = vehicleQuery.or([
          `make.ilike.%${like}%`, `model.ilike.%${like}%`, `trim.ilike.%${like}%`,
          `body_style.ilike.%${like}%`, `fuel_type.ilike.%${like}%`,
          `exterior_color.ilike.%${like}%`, `seller_city.ilike.%${like}%`,
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
    if (value) vehicleQuery = vehicleQuery.eq(column, value);
  }

  const yearMin = parseInt(sp.get("yearMin") || "");
  if (Number.isFinite(yearMin)) vehicleQuery = vehicleQuery.gte("year", yearMin);
  const yearMax = parseInt(sp.get("yearMax") || "");
  if (Number.isFinite(yearMax)) vehicleQuery = vehicleQuery.lte("year", yearMax);
  const priceMin = parseInt(sp.get("priceMin") || "");
  if (Number.isFinite(priceMin) && priceMin > 0) vehicleQuery = vehicleQuery.gte("price", priceMin);
  const priceMax = parseInt(sp.get("priceMax") || "");
  if (Number.isFinite(priceMax) && priceMax > 0) vehicleQuery = vehicleQuery.lte("price", priceMax);
  const mileageMax = parseInt(sp.get("mileageMax") || "");
  if (Number.isFinite(mileageMax) && mileageMax > 0) {
    vehicleQuery = vehicleQuery.or(`mileage.lte.${mileageMax},mileage.is.null`);
  }

  switch (sp.get("sort") || "recommended") {
    case "price_asc": vehicleQuery = vehicleQuery.order("price", { ascending: true }); break;
    case "price_desc": vehicleQuery = vehicleQuery.order("price", { ascending: false }); break;
    case "year_desc": vehicleQuery = vehicleQuery.order("year", { ascending: false }); break;
    case "year_asc": vehicleQuery = vehicleQuery.order("year", { ascending: true }); break;
    case "mileage_asc":
      vehicleQuery = vehicleQuery.order("mileage", { ascending: true, nullsFirst: false });
      break;
    case "mileage_desc":
      vehicleQuery = vehicleQuery.order("mileage", { ascending: false, nullsFirst: false });
      break;
    default:
      vehicleQuery = vehicleQuery
        .order("is_special", { ascending: false })
        .order("created_at", { ascending: false });
  }

  return vehicleQuery
    .order("id", { ascending: true })
    .range(options.offset, options.offset + options.limit);
}

function rowToVehicle(row: InventoryRow, r2PublicBaseUrl: string) {
  const primaryImageSrc = row.primary_image_r2_key
    ? managedVehicleImageUrl(r2PublicBaseUrl, row.primary_image_r2_key)
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
    status: "live",
    soldAt: row.sold_at,
    soldPrice: row.sold_price,
  };
}

function managedVehicleImageUrl(baseUrl: string, r2Key: string): string | undefined {
  if (!baseUrl || !r2Key) return undefined;
  try {
    const base = new URL(baseUrl);
    const path = r2Key.split("/").map(encodeURIComponent).join("/");
    base.pathname = `${base.pathname.replace(/\/$/, "")}/${path}`;
    return base.toString();
  } catch {
    return undefined;
  }
}

async function getTenantFromRequest(
  req: VercelRequest,
  supabase: RootSupabaseClient,
): Promise<{ tenantId: string; slug: string } | null> {
  const slug = extractTenantSlugFromRequest(req);
  if (!slug) return null;
  const { data, error } = await supabase.rpc("tenant_by_slug", { p_slug: slug });
  if (error) {
    console.error("[tenant] tenant_by_slug RPC failed:", error.message);
    return null;
  }
  const row = (data as Array<{ id: string; slug: string; status: string }> | null)?.[0];
  if (!row || row.status !== "active") return null;
  return { tenantId: row.id, slug: row.slug };
}

function extractTenantSlugFromRequest(req: VercelRequest): string | null {
  const headerSlug = header(req, "x-lume-tenant")?.trim();
  if (headerSlug) return headerSlug;
  const querySlug = query(req, "tenant")?.trim();
  if (querySlug) return querySlug;
  const host = header(req, "host");
  if (!host) return null;
  const parts = host.split(":")[0].split(".");
  if (parts.length < 3 || SUBDOMAIN_RESERVED.has(parts[0])) return null;
  return parts[0] || null;
}

function isAllowedOrigin(req: VercelRequest): boolean {
  const allowed = (process.env.ALLOWED_CHAT_ORIGINS ?? "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  const origin = header(req, "origin");
  return !origin || allowed.includes(origin);
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = header(req, "origin") ?? "";
  if (!origin || !isAllowedOrigin(req)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin, X-Lume-Tenant");
}

function json(req: VercelRequest, res: VercelResponse, payload: unknown, status: number) {
  setCorsHeaders(req, res);
  return res.status(status).json(payload);
}

function header(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function query(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  return Array.isArray(value) ? value[0] : value;
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
