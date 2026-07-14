import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/vehicles/:id?tenant=<slug>
 *
 * Public, tenant-scoped single-vehicle detail. Unlike the list endpoint
 * (which returns only the primary image per vehicle), this returns the full
 * ordered managed-image gallery: primary first, then sort_order, then
 * created_at. Self-contained on purpose — this is a standalone Vercel function
 * bundled without its relative/workspace deps, and root package.json is
 * "type":"module", so it must import ONLY real npm packages.
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
  primaryImageAlt?: string;
  sellerCity: string;
  sellerState: string;
  isSpecial: boolean;
  specialImageSrc?: string;
};

type GalleryImage = {
  src: string;
  alt?: string;
  isPrimary: boolean;
  sortOrder: number;
};

type VehicleDetailResponse = {
  vehicle: Vehicle;
  images: GalleryImage[];
};

type ManagedVehicleImageRow = {
  vehicle_id: string;
  r2_key: string;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
  ai_description: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  const vehicleId = query(req, "id")?.trim();
  if (!vehicleId || !UUID_PATTERN.test(vehicleId)) {
    return json(req, res, { error: "Invalid vehicle id" }, 400);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  // Public read: the ANON key + RLS is the isolation backstop. The
  // .eq("tenant_id") below is defense-in-depth — never the service-role key.
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

  const { data: row, error } = await supabase
    .from("vehicles")
    .select("*")
    .eq("tenant_id", tenant.tenantId)
    .eq("id", vehicleId)
    .maybeSingle();

  if (error) {
    console.error("[/api/vehicles/:id] query error:", error.message);
    return json(req, res, { error: error.message }, 500);
  }
  if (!row) {
    return json(req, res, { error: "Vehicle not found" }, 404);
  }

  const r2PublicBaseUrl =
    process.env.R2_PUBLIC_BASE_URL?.trim() ??
    process.env.VITE_R2_PUBLIC_BASE_URL?.trim() ??
    "";
  const managedImages = await loadManagedGallery(supabase, tenant.tenantId, vehicleId);
  const gallery = managedImages
    .map((image) => {
      const src = managedVehicleImageUrl(r2PublicBaseUrl, image.r2_key);
      if (!src) return null;
      return {
        src,
        alt: image.ai_description ?? undefined,
        isPrimary: image.is_primary,
        sortOrder: image.sort_order,
      } satisfies GalleryImage;
    })
    .filter((image): image is GalleryImage => image !== null);

  const primary = gallery[0];
  const vehicle = rowToVehicle(row, primary);
  const response: VehicleDetailResponse = { vehicle, images: gallery };

  res.setHeader("Cache-Control", "private, no-store");
  return json(req, res, response, 200);
}

async function loadManagedGallery(
  supabase: any,
  tenantId: string,
  vehicleId: string,
): Promise<ManagedVehicleImageRow[]> {
  const { data, error } = await supabase
    .from("vehicle_images")
    .select("vehicle_id, r2_key, is_primary, sort_order, created_at, ai_description")
    .eq("tenant_id", tenantId)
    .eq("vehicle_id", vehicleId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    // Legacy image_src remains valid if the images table/policy is unavailable.
    console.warn("[/api/vehicles/:id] managed image query failed:", error.message);
    return [];
  }
  return (data ?? []) as ManagedVehicleImageRow[];
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

function rowToVehicle(row: any, primaryImage: GalleryImage | undefined): Vehicle {
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
    primaryImageSrc: primaryImage?.src,
    primaryImageAlt: primaryImage?.alt,
    sellerCity: row.seller_city,
    sellerState: row.seller_state,
    isSpecial: row.is_special,
    specialImageSrc: row.special_image_src ?? undefined,
  };
}
