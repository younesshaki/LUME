/**
 * GET /api/vehicles/facets?tenant=<slug>&make=<make>&sellerState=<state>
 *
 * Lightweight filter-dropdown values for the public inventory. Uses the
 * vehicle_facets RPC (distinct sets computed in SQL) with a scoped column-scan
 * fallback. Mirrors the standalone root function api/vehicles/facets.ts so
 * local dev (Vite proxies /api/*) matches production.
 */
import type { VehicleFacets } from "@lume/types";
import { createAnonServerClient } from "@lume/db/server";
import { getTenantFromRequest } from "@/lib/tenant";
import { corsHeadersFor, isAllowedOrigin } from "@/lib/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMPTY: VehicleFacets = {
  makes: [], models: [], states: [], cities: [],
  ranges: {
    yearMin: null, yearMax: null, priceMin: null,
    priceMax: null, mileageMin: null, mileageMax: null,
  },
};

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeadersFor(request) });
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) return json({ error: "Forbidden origin" }, 403);

  const tenant = await getTenantFromRequest(request);
  if (!tenant) return json({ error: "Unknown or inactive tenant" }, 404, request);

  const sp = new URL(request.url).searchParams;
  const make = (sp.get("make") ?? "").trim();
  const state = (sp.get("sellerState") ?? "").trim();
  const supabase = createAnonServerClient();

  const result = await loadFacets(supabase, tenant.tenantId, make, state);
  const etag = result.catalogVersion === null
    ? null
    : `W/"inventory-facets-${tenant.tenantId}-${result.catalogVersion}"`;
  const headers = {
    "Cache-Control": "private, no-cache",
    Vary: "Origin, X-Lume-Tenant",
    ...(etag ? { ETag: etag } : {}),
  };
  if (etag && request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { ...corsHeadersFor(request), ...headers } });
  }
  return json(result.facets, 200, request, headers);
}

async function loadFacets(
  supabase: ReturnType<typeof createAnonServerClient>,
  tenantId: string,
  make: string,
  state: string,
): Promise<{ facets: VehicleFacets; catalogVersion: number | null }> {
  const { data, error } = await supabase.rpc("vehicle_facets_v2", {
    p_tenant_id: tenantId,
    p_make: make || null,
    p_state: state || null,
  });
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    return { facets: normalizeFacets(row), catalogVersion: finiteNumber(row?.catalog_version) };
  }
  if (error) {
    console.warn("[/api/vehicles/facets] RPC unavailable, scanning columns:", error.message);
  }

  const { data: rows, error: scanError } = await supabase
    .from("vehicles")
    .select("make, model, seller_state, seller_city, year, price, mileage")
    .eq("tenant_id", tenantId)
    .eq("status", "live");
  if (scanError || !rows) {
    console.warn("[/api/vehicles/facets] column scan failed:", scanError?.message);
    return { facets: EMPTY, catalogVersion: null };
  }
  return { facets: {
      makes: uniqueSorted(rows.map((r) => r.make)),
      models: uniqueSorted(rows.filter((r) => !make || r.make === make).map((r) => r.model)),
      states: uniqueSorted(rows.map((r) => r.seller_state)),
      cities: uniqueSorted(
        rows.filter((r) => !state || r.seller_state === state).map((r) => r.seller_city),
      ),
      ranges: {
        yearMin: minNumber(rows.map((r) => r.year)),
        yearMax: maxNumber(rows.map((r) => r.year)),
        priceMin: minNumber(rows.map((r) => r.price)),
        priceMax: maxNumber(rows.map((r) => r.price)),
        mileageMin: minNumber(rows.map((r) => r.mileage)),
        mileageMax: maxNumber(rows.map((r) => r.mileage)),
      },
    }, catalogVersion: null,
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

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
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
