import { createClient } from "@supabase/supabase-js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const SUBDOMAIN_RESERVED = new Set(["www", "app", "api", "admin", "static", "cdn"]);
// Only the columns the public client actually renders (plus created_at/is_special
// for ordering) — avoids shipping every column on every list page.
const VEHICLE_COLUMNS =
  "id, tenant_id, external_id, stock_type, year, make, model, trim, price, mileage, " +
  "body_style, exterior_color, interior_color, drivetrain, fuel_type, image_src, " +
  "seller_city, seller_state, is_special, special_image_src, created_at";

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

type Vehicle = {
  id: string;
  tenantId: string;
  externalId?: string;
  stockType: string;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  bodyStyle: string;
  exteriorColor: string;
  interiorColor: string;
  drivetrain: string;
  fuelType: string;
  imageSrc: string;
  primaryImageSrc?: string;
  sellerCity: string;
  sellerState: string;
  isSpecial: boolean;
  specialImageSrc?: string;
};

type VehicleListResponse = {
  vehicles: Vehicle[];
  totalCount: number;
  hasMore: boolean;
};

type ManagedVehicleImageRow = {
  vehicle_id: string;
  r2_key: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(req, res);
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return json(req, res, { error: "Method not allowed" }, 405);
  }

  if (!isAllowedOrigin(req)) {
    return json(req, res, { error: "Forbidden origin" }, 403);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return json(req, res, { error: "Supabase server env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceClient = serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

  const tenant = await getTenantFromRequest(req, supabase);
  if (!tenant) {
    return json(req, res, { error: "Unknown or inactive tenant" }, 404);
  }

  if (serviceClient) {
    try {
      await serviceClient.rpc("increment_usage_event", {
        p_tenant_id: tenant.tenantId,
        p_event_type: "vehicle_requests",
        p_period_start: null,
        p_increment: 1,
      });
    } catch {
      // metering must never fail the public read
    }
  }

  const limit = clamp(parseInt(query(req, "limit") || "") || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(query(req, "offset") || "") || 0);

  // The anonymous client remains the authority for which vehicle rows may be
  // returned publicly. Managed image metadata is loaded later only for these
  // already-visible IDs. Select only the columns the client needs instead of
  // "*" — smaller payload per page.
  let vehicleQuery = supabase
    .from("vehicles")
    .select(VEHICLE_COLUMNS, { count: "exact" })
    .eq("tenant_id", tenant.tenantId);

  const search = query(req, "q")?.trim();
  if (search) {
    const like = search.replace(/[%,]/g, " ").replace(/\s+/g, " ").trim();
    if (like) {
      vehicleQuery = vehicleQuery.or(
        [
          `make.ilike.%${like}%`,
          `model.ilike.%${like}%`,
          `trim.ilike.%${like}%`,
          `body_style.ilike.%${like}%`,
          `fuel_type.ilike.%${like}%`,
          `exterior_color.ilike.%${like}%`,
          `seller_city.ilike.%${like}%`,
          `seller_state.ilike.%${like}%`,
        ].join(","),
      );
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
    const value = query(req, param);
    if (value) vehicleQuery = vehicleQuery.eq(column, value);
  }

  const yearMin = parseInt(query(req, "yearMin") || "");
  if (Number.isFinite(yearMin)) vehicleQuery = vehicleQuery.gte("year", yearMin);
  const yearMax = parseInt(query(req, "yearMax") || "");
  if (Number.isFinite(yearMax)) vehicleQuery = vehicleQuery.lte("year", yearMax);
  const priceMin = parseInt(query(req, "priceMin") || "");
  if (Number.isFinite(priceMin) && priceMin > 0) vehicleQuery = vehicleQuery.gte("price", priceMin);
  const priceMax = parseInt(query(req, "priceMax") || "");
  if (Number.isFinite(priceMax) && priceMax > 0) vehicleQuery = vehicleQuery.lte("price", priceMax);
  const mileageMax = parseInt(query(req, "mileageMax") || "");
  if (Number.isFinite(mileageMax) && mileageMax > 0) {
    vehicleQuery = vehicleQuery.or(`mileage.lte.${mileageMax},mileage.is.null`);
  }

  switch (query(req, "sort") || "recommended") {
    case "price_asc":
      vehicleQuery = vehicleQuery.order("price", { ascending: true });
      break;
    case "price_desc":
      vehicleQuery = vehicleQuery.order("price", { ascending: false });
      break;
    case "year_desc":
      vehicleQuery = vehicleQuery.order("year", { ascending: false });
      break;
    case "year_asc":
      vehicleQuery = vehicleQuery.order("year", { ascending: true });
      break;
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

  const { data, count, error } = await vehicleQuery.range(offset, offset + limit - 1);
  if (error) {
    console.error("[/api/vehicles] query error:", error.message);
    return json(req, res, { error: error.message }, 500);
  }

  const rows = data ?? [];
  // The image RLS policy is stricter than the public vehicle policy. Use the
  // server-only client when available, but constrain it to the tenant and the
  // exact vehicle IDs already approved by the anonymous vehicle query above.
  const managedImages = await loadManagedVehicleImages(
    serviceClient ?? supabase,
    tenant.tenantId,
    rows.map((row: any) => row.id),
  );
  const r2PublicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL?.trim() ??
    process.env.VITE_R2_PUBLIC_BASE_URL?.trim() ??
    "";
  const vehicles = rows.map((row: any) =>
    rowToVehicle(row, managedImages.get(row.id), r2PublicBaseUrl),
  );
  const totalCount = count ?? vehicles.length;
  const response: VehicleListResponse = {
    vehicles,
    totalCount,
    hasMore: offset + vehicles.length < totalCount,
  };

  res.setHeader("Cache-Control", "private, no-store");
  return json(req, res, response, 200);
}

async function loadManagedVehicleImages(
  supabase: any,
  tenantId: string,
  vehicleIds: string[],
): Promise<Map<string, ManagedVehicleImageRow>> {
  const imagesByVehicle = new Map<string, ManagedVehicleImageRow>();
  if (vehicleIds.length === 0) return imagesByVehicle;

  const { data, error } = await supabase
    .from("vehicle_images")
    .select("vehicle_id, r2_key, is_primary, sort_order, created_at")
    .eq("tenant_id", tenantId)
    .in("vehicle_id", vehicleIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[/api/vehicles] managed image query failed:", error.message);
    return imagesByVehicle;
  }

  for (const image of (data ?? []) as ManagedVehicleImageRow[]) {
    const current = imagesByVehicle.get(image.vehicle_id);
    if (!current || image.is_primary || (!current.is_primary && compareImageOrder(image, current) < 0)) {
      imagesByVehicle.set(image.vehicle_id, image);
    }
  }
  return imagesByVehicle;
}

function compareImageOrder(left: ManagedVehicleImageRow, right: ManagedVehicleImageRow): number {
  if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
  return left.created_at.localeCompare(right.created_at);
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
  supabase: any
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
  const hostname = host.split(":")[0];
  const parts = hostname.split(".");
  if (parts.length < 3) return null;
  const sub = parts[0];
  if (SUBDOMAIN_RESERVED.has(sub)) return null;
  return sub || null;
}

function isAllowedOrigin(req: VercelRequest): boolean {
  const allowed = (process.env.ALLOWED_CHAT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;

  const origin = header(req, "origin");
  if (!origin) return true;
  return allowed.includes(origin);
}

function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = header(req, "origin") ?? "";
  if (!origin || !isAllowedOrigin(req)) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Lume-Tenant");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Vary", "Origin");
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function rowToVehicle(
  row: any,
  managedImage: ManagedVehicleImageRow | undefined,
  r2PublicBaseUrl: string,
): Vehicle {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    externalId: row.external_id ?? undefined,
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
    primaryImageSrc: managedImage
      ? managedVehicleImageUrl(r2PublicBaseUrl, managedImage.r2_key)
      : undefined,
    sellerCity: row.seller_city,
    sellerState: row.seller_state,
    isSpecial: row.is_special,
    specialImageSrc: row.special_image_src ?? undefined,
  };
}
