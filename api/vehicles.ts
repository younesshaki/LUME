import { createClient } from "@supabase/supabase-js";
import { rowToVehicle } from "@lume/db";
import type { VehicleListResponse } from "@lume/types";

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
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return json(req, res, { error: "Supabase server env not configured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenant = await getTenantFromRequest(req, supabase);
  if (!tenant) {
    return json(req, res, { error: "Unknown or inactive tenant" }, 404);
  }

  const limit = clamp(parseInt(query(req, "limit") || "") || DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, parseInt(query(req, "offset") || "") || 0);

  let vehicleQuery = supabase
    .from("vehicles")
    .select("*", { count: "exact" })
    .eq("tenant_id", tenant.tenantId);

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

  const vehicles = (data ?? []).map(rowToVehicle);
  const totalCount = count ?? vehicles.length;
  const response: VehicleListResponse = {
    vehicles,
    totalCount,
    hasMore: offset + vehicles.length < totalCount,
  };

  res.setHeader("Cache-Control", "private, no-store");
  return json(req, res, response, 200);
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
