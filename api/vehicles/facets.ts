import { createClient } from "@supabase/supabase-js";

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

  const tenant = await getTenantFromRequest(req, supabase);
  if (!tenant) {
    return json(req, res, { error: "Unknown or inactive tenant" }, 404);
  }

  const make = query(req, "make")?.trim() || "";
  const state = query(req, "sellerState")?.trim() || "";
  const facets = await loadFacets(supabase, tenant.tenantId, make, state);

  // Facet values are already public via the listing and change only when the
  // catalog does; a short private (browser-only, per-URL keyed by ?tenant=)
  // cache avoids recomputing on every filter interaction without any risk of
  // one tenant's values being served to another.
  res.setHeader("Cache-Control", "private, max-age=60");
  return json(req, res, facets, 200);
}

async function loadFacets(
  supabase: any,
  tenantId: string,
  make: string,
  state: string,
): Promise<VehicleFacets> {
  const { data, error } = await supabase.rpc("vehicle_facets", {
    p_tenant_id: tenantId,
    p_make: make || null,
    p_state: state || null,
  });
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    return normalizeFacets(row);
  }
  if (error) {
    console.warn("[/api/vehicles/facets] RPC unavailable, scanning columns:", error.message);
  }
  return scanFacets(supabase, tenantId, make, state);
}

async function scanFacets(
  supabase: any,
  tenantId: string,
  make: string,
  state: string,
): Promise<VehicleFacets> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("make, model, seller_state, seller_city")
    .eq("tenant_id", tenantId);
  if (error || !data) {
    console.warn("[/api/vehicles/facets] column scan failed:", error?.message);
    return { makes: [], models: [], states: [], cities: [] };
  }
  const rows = data as Array<{
    make: string | null;
    model: string | null;
    seller_state: string | null;
    seller_city: string | null;
  }>;
  return {
    makes: uniqueSorted(rows.map((r) => r.make)),
    models: uniqueSorted(rows.filter((r) => !make || r.make === make).map((r) => r.model)),
    states: uniqueSorted(rows.map((r) => r.seller_state)),
    cities: uniqueSorted(rows.filter((r) => !state || r.seller_state === state).map((r) => r.seller_city)),
  };
}

function normalizeFacets(row: any): VehicleFacets {
  return {
    makes: toStringArray(row?.makes),
    models: toStringArray(row?.models),
    states: toStringArray(row?.states),
    cities: toStringArray(row?.cities),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
}

async function getTenantFromRequest(
  req: VercelRequest,
  supabase: any,
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
