import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * GET /api/vehicles/facets?tenant=<slug>&make=<make>&sellerState=<state>
 *
 * Lightweight filter-dropdown values (makes, models, states, cities) for the
 * public inventory. Computes the distinct sets in SQL via the vehicle_facets
 * RPC instead of downloading the whole catalog client-side; falls back to a
 * scoped column scan if the RPC is unavailable (e.g. migration not yet applied).
 *
 * Self-contained on purpose — standalone Vercel function, "type":"module",
 * bundled without relative/workspace deps: import only real npm packages.
 */

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

type VehicleFacets = {
  makes: string[];
  models: string[];
  states: string[];
  cities: string[];
  ranges: {
    yearMin: number | null;
    yearMax: number | null;
    priceMin: number | null;
    priceMax: number | null;
    mileageMin: number | null;
    mileageMax: number | null;
  };
};

type FacetResult = { facets: VehicleFacets; catalogVersion: number | null };

type FacetRow = {
  makes: string[];
  models: string[];
  states: string[];
  cities: string[];
  year_min: number | null;
  year_max: number | null;
  price_min: number | null;
  price_max: number | null;
  mileage_min: number | null;
  mileage_max: number | null;
  catalog_version: number;
};

type FacetsDatabase = {
  public: {
    Tables: {
      vehicles: {
        Row: {
          tenant_id: string;
          status: string;
          make: string | null;
          model: string | null;
          seller_state: string | null;
          seller_city: string | null;
          year: number | null;
          price: number | null;
          mileage: number | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      tenant_by_slug: {
        Args: { p_slug: string };
        Returns: Array<{ id: string; slug: string; status: string }>;
      };
      vehicle_facets_v2: {
        Args: { p_tenant_id: string; p_make?: string | null; p_state?: string | null };
        Returns: FacetRow[];
      };
      vehicle_facets_by_slug: {
        Args: { p_slug: string; p_make?: string | null; p_state?: string | null };
        Returns: FacetRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type FacetsClient = SupabaseClient<FacetsDatabase, "public">;

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

  const supabase = createClient<FacetsDatabase>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const tenantSlug = extractTenantSlugFromRequest(req);
  if (!tenantSlug) return json(req, res, { error: "Unknown or inactive tenant" }, 404);

  const make = query(req, "make")?.trim() || "";
  const state = query(req, "sellerState")?.trim() || "";
  let result = await loadFacetsBySlug(supabase, tenantSlug, make, state);
  if (!result) {
    const tenant = await getTenantFromRequest(req, supabase);
    if (!tenant) return json(req, res, { error: "Unknown or inactive tenant" }, 404);
    result = await loadFacets(supabase, tenant.tenantId, make, state);
  }

  // Browser caches may retain the public payload, but must revalidate it. The
  // per-tenant version changes after every vehicle or managed-image mutation.
  const etag = result.catalogVersion === null
    ? null
    : `W/"inventory-facets-${tenantSlug}-${result.catalogVersion}"`;
  res.setHeader("Cache-Control", inventoryCacheControl(req));
  res.setHeader("Vary", "Origin");
  if (etag) res.setHeader("ETag", etag);
  if (etag && header(req, "if-none-match") === etag) {
    setCorsHeaders(req, res);
    return res.status(304).end();
  }
  return json(req, res, result.facets, 200);
}

async function loadFacets(
  supabase: FacetsClient,
  tenantId: string,
  make: string,
  state: string,
): Promise<FacetResult> {
  const { data, error } = await supabase.rpc("vehicle_facets_v2", {
    p_tenant_id: tenantId,
    p_make: make || null,
    p_state: state || null,
  });
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    return {
      facets: normalizeFacets(row),
      catalogVersion: finiteNumber(row?.catalog_version),
    };
  }
  if (error) {
    console.warn("[/api/vehicles/facets] RPC unavailable, scanning columns:", error.message);
  }
  return { facets: await scanFacets(supabase, tenantId, make, state), catalogVersion: null };
}

async function loadFacetsBySlug(
  supabase: FacetsClient,
  slug: string,
  make: string,
  state: string,
): Promise<FacetResult | null> {
  const { data, error } = await supabase.rpc("vehicle_facets_by_slug", {
    p_slug: slug,
    p_make: make || null,
    p_state: state || null,
  });
  if (error) {
    if (!slugFastPathUnavailable(error.message)) {
      console.warn("[/api/vehicles/facets] slug fast path failed:", error.message);
    }
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    facets: normalizeFacets(row),
    catalogVersion: finiteNumber(row.catalog_version),
  };
}

async function scanFacets(
  supabase: FacetsClient,
  tenantId: string,
  make: string,
  state: string,
): Promise<VehicleFacets> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("make, model, seller_state, seller_city, year, price, mileage")
    .eq("tenant_id", tenantId)
    .eq("status", "live");
  if (error || !data) {
    console.warn("[/api/vehicles/facets] column scan failed:", error?.message);
    return emptyFacets();
  }
  const rows = data as Array<{
    make: string | null;
    model: string | null;
    seller_state: string | null;
    seller_city: string | null;
    year: number | null;
    price: number | null;
    mileage: number | null;
  }>;
  return {
    makes: uniqueSorted(rows.map((r) => r.make)),
    models: uniqueSorted(rows.filter((r) => !make || r.make === make).map((r) => r.model)),
    states: uniqueSorted(rows.map((r) => r.seller_state)),
    cities: uniqueSorted(rows.filter((r) => !state || r.seller_state === state).map((r) => r.seller_city)),
    ranges: {
      yearMin: minNumber(rows.map((r) => r.year)),
      yearMax: maxNumber(rows.map((r) => r.year)),
      priceMin: minNumber(rows.map((r) => r.price)),
      priceMax: maxNumber(rows.map((r) => r.price)),
      mileageMin: minNumber(rows.map((r) => r.mileage)),
      mileageMax: maxNumber(rows.map((r) => r.mileage)),
    },
  };
}

function normalizeFacets(value: unknown): VehicleFacets {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    makes: toStringArray(row.makes),
    models: toStringArray(row.models),
    states: toStringArray(row.states),
    cities: toStringArray(row.cities),
    ranges: {
      yearMin: finiteNumber(row.year_min),
      yearMax: finiteNumber(row.year_max),
      priceMin: finiteNumber(row.price_min),
      priceMax: finiteNumber(row.price_max),
      mileageMin: finiteNumber(row.mileage_min),
      mileageMax: finiteNumber(row.mileage_max),
    },
  };
}

function emptyFacets(): VehicleFacets {
  return {
    makes: [], models: [], states: [], cities: [],
    ranges: {
      yearMin: null, yearMax: null, priceMin: null,
      priceMax: null, mileageMin: null, mileageMax: null,
    },
  };
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function minNumber(values: unknown[]): number | null {
  const numbers = values.map(finiteNumber).filter((value): value is number => value !== null);
  return numbers.length ? Math.min(...numbers) : null;
}

function maxNumber(values: unknown[]): number | null {
  const numbers = values.map(finiteNumber).filter((value): value is number => value !== null);
  return numbers.length ? Math.max(...numbers) : null;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

async function getTenantFromRequest(
  req: VercelRequest,
  supabase: FacetsClient,
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

function inventoryCacheControl(req: VercelRequest): string {
  return hasStableTenantCacheKey(req)
    ? "public, max-age=0, s-maxage=10, must-revalidate"
    : "private, no-cache";
}

function hasStableTenantCacheKey(req: VercelRequest): boolean {
  const querySlug = query(req, "tenant")?.trim();
  const headerSlug = header(req, "x-lume-tenant")?.trim();
  return Boolean(querySlug) && (!headerSlug || headerSlug === querySlug);
}

function slugFastPathUnavailable(message: string): boolean {
  return message.toLowerCase().includes("vehicle_facets_by_slug");
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
