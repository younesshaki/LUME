import "server-only";
import { databaseConfiguration } from "../../config/environment.ts";
import type {
  Vehicle,
  VehicleGalleryImage,
  VehicleFacets,
  VehicleListResponse,
} from "@lume/types";

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Row = Record<string, unknown>;
export type Detail = {
  vehicle: Vehicle;
  images: VehicleGalleryImage[];
  priceSignal: { enabled: boolean; reductions: number };
};
export class ReadFailure extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super("Vehicle data temporarily unavailable");
    this.status = status;
    this.detail = detail;
  }
}
export function safeImage(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && !url.username && !url.password)
      return url.href;
  } catch {
    /* Invalid media is omitted. */
  }
}
export function managedImage(
  base: string | undefined,
  key: unknown,
): string | undefined {
  if (
    !base ||
    typeof key !== "string" ||
    !key ||
    key.split("/").some((p) => p === "." || p === "..")
  )
    return;
  const origin = safeImage(base);
  if (!origin) return;
  return `${origin.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
export function feedGallery(row: Row): VehicleGalleryImage[] {
  const urls = [
    row.image_src,
    ...(Array.isArray(row.feed_image_urls) ? row.feed_image_urls : []),
  ]
    .map(safeImage)
    .filter((v): v is string => !!v);
  return [...new Set(urls)].slice(0, 50).map((src, i) => ({
    src,
    alt: [row.year, row.make, row.model].filter(Boolean).join(" "),
    isPrimary: i === 0,
    sortOrder: i,
  }));
}
function vehicle(row: Row, primary?: VehicleGalleryImage): Vehicle {
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    ...(row.external_id ? { externalId: String(row.external_id) } : {}),
    stockType: String(row.stock_type ?? ""),
    year: Number(row.year),
    make: String(row.make ?? ""),
    model: String(row.model ?? ""),
    trim: String(row.trim ?? ""),
    price: row.price === null ? NaN : Number(row.price),
    mileage:
      row.mileage == null || !Number.isFinite(Number(row.mileage))
        ? null
        : Number(row.mileage),
    bodyStyle: String(row.body_style ?? ""),
    exteriorColor: String(row.exterior_color ?? ""),
    interiorColor: String(row.interior_color ?? ""),
    drivetrain: String(row.drivetrain ?? ""),
    fuelType: String(row.fuel_type ?? ""),
    imageSrc: String(row.image_src ?? ""),
    ...(primary
      ? {
          primaryImageSrc: primary.src,
          ...(primary.alt ? { primaryImageAlt: primary.alt } : {}),
        }
      : {}),
    sellerCity: String(row.seller_city ?? ""),
    sellerState: String(row.seller_state ?? ""),
    isSpecial: row.is_special === true,
    ...(row.special_image_src
      ? { specialImageSrc: String(row.special_image_src) }
      : {}),
    status: "live",
    soldAt: typeof row.sold_at === "string" ? row.sold_at : null,
    soldPrice:
      row.sold_price === null || row.sold_price === undefined
        ? null
        : Number(row.sold_price),
  };
}

/** Anon/RLS for every vehicle read; optional staging privilege is restricted to gallery metadata AFTER visibility. */
export function vehicleRepository(
  env = process.env,
  transport: typeof fetch = fetch,
) {
  const config = databaseConfiguration(env);
  const mediaBase = env.WEB_PREVIEW_R2_PUBLIC_BASE_URL;
  async function read(
    path: string,
    params = new URLSearchParams(),
    count = false,
    galleryPrivilege = false,
  ) {
    const key =
      galleryPrivilege && config.domainKey ? config.domainKey : config.anon;
    const r = await transport(`${config.url}/rest/v1/${path}?${params}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        ...(count ? { Prefer: "count=exact" } : {}),
      },
    });
    if (!r.ok) {
      const detail = await r.text();
      throw new ReadFailure(r.status, detail);
    }
    const total = r.headers.get("content-range")?.split("/")[1];
    return {
      rows: (await r.json()) as Row[],
      total: total && /^\d+$/.test(total) ? Number(total) : null,
    };
  }
  async function detail(tenantId: string, id: string): Promise<Detail | null> {
    if (!uuidPattern.test(id)) return null;
    const columns =
      "id,tenant_id,external_id,stock_type,year,make,model,trim,price,mileage,body_style,exterior_color,interior_color,drivetrain,fuel_type,image_src,seller_city,seller_state,is_special,special_image_src,status,sold_at,sold_price";
    const p = new URLSearchParams({
      select: `${columns},feed_image_urls`,
      tenant_id: `eq.${tenantId}`,
      id: `eq.${id}`,
      status: "eq.live",
      limit: "1",
    });
    let rows: Row[];
    try {
      rows = (await read("vehicles", p)).rows;
    } catch (e) {
      if (
        !(e instanceof ReadFailure) ||
        !/feed_image_urls|column .* does not exist/i.test(e.detail)
      )
        throw e;
      p.set("select", columns);
      rows = (await read("vehicles", p)).rows;
    }
    const row = rows[0];
    // Explicit DTO-level defense as well as anon RLS and SQL tenant/status filters.
    if (
      !row ||
      row.tenant_id !== tenantId ||
      String(row.id).toLowerCase() !== id.toLowerCase() ||
      row.status !== "live"
    )
      return null;
    const [gallery, signal] = await Promise.all([
      read(
        "vehicle_images",
        new URLSearchParams({
          select: "r2_key,is_primary,sort_order,created_at,ai_description",
          tenant_id: `eq.${tenantId}`,
          vehicle_id: `eq.${id}`,
          order: "is_primary.desc,sort_order.asc,created_at.asc",
          limit: "50",
        }),
        false,
        true,
      )
        .then((r) => r.rows)
        .catch(() => []),
      read(
        "rpc/get_public_vehicle_price_signal",
        new URLSearchParams({ p_tenant_id: tenantId, p_vehicle_id: id }),
      )
        .then((r) => r.rows[0])
        .catch(() => null),
    ]);
    const managed = gallery.flatMap((r) => {
      const src = managedImage(mediaBase, r.r2_key);
      return src
        ? [
            {
              src,
              ...(typeof r.ai_description === "string" && r.ai_description
                ? { alt: r.ai_description }
                : {}),
              isPrimary: r.is_primary === true,
              sortOrder: Number(r.sort_order) || 0,
            },
          ]
        : [];
    });
    const images = managed.length ? managed : feedGallery(row);
    const reductions = Number(signal?.reductions);
    return {
      vehicle: vehicle(row, images[0]),
      images,
      priceSignal:
        signal?.enabled === true
          ? {
              enabled: true,
              reductions: Number.isFinite(reductions)
                ? Math.max(0, Math.floor(reductions))
                : 0,
            }
          : { enabled: false, reductions: 0 },
    };
  }
  async function inventory(
    tenantId: string,
    sp: URLSearchParams,
  ): Promise<VehicleListResponse & { etag: string | null }> {
    const limit = Math.min(
      200,
      Math.max(1, parseInt(sp.get("limit") ?? "") || 50),
    );
    const offset = Math.max(0, parseInt(sp.get("offset") ?? "") || 0);
    const p = inventoryParams(tenantId, sp, limit, offset);
    let result;
    try {
      result = await read(
        "rpc/public_vehicle_inventory",
        p,
        sp.get("includeCount") === "true",
      );
    } catch (e) {
      if (
        !(e instanceof ReadFailure) ||
        !p.has("search_vector") ||
        !/search_vector|column .* does not exist/i.test(e.detail)
      )
        throw e;
      p.delete("search_vector");
      const term = searchTerm(sp)
        .replace(/[,%_()]/g, " ")
        .trim()
        .replace(/\s+/g, " ");
      if (term)
        p.append(
          "or",
          `(${["make", "model", "trim", "body_style", "fuel_type", "exterior_color", "seller_city", "seller_state"].map((c) => `${c}.ilike.%${term}%`).join(",")})`,
        );
      result = await read(
        "rpc/public_vehicle_inventory",
        p,
        sp.get("includeCount") === "true",
      );
    }
    if (
      result.rows.some((r) => r.tenant_id !== tenantId || r.status !== "live")
    )
      throw new ReadFailure(502, "Inventory scope mismatch");
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    return {
      vehicles: rows.map((r) =>
        vehicle(
          r,
          managedImage(mediaBase, r.primary_image_r2_key)
            ? {
                src: managedImage(mediaBase, r.primary_image_r2_key)!,
                alt:
                  typeof r.primary_image_alt === "string"
                    ? r.primary_image_alt
                    : undefined,
                isPrimary: true,
                sortOrder: 0,
              }
            : undefined,
        ),
      ),
      hasMore,
      ...(sp.get("includeCount") === "true" && result.total !== null
        ? { totalCount: result.total }
        : {}),
      etag:
        rows[0]?.catalog_version != null
          ? `W/"inventory-${tenantId}-${rows[0].catalog_version}"`
          : null,
    };
  }
  async function facets(
    tenantId: string,
    sp: URLSearchParams,
  ): Promise<{ facets: VehicleFacets; etag: string | null }> {
    try {
      const { rows } = await read(
        "rpc/vehicle_facets_v2",
        new URLSearchParams({
          p_tenant_id: tenantId,
          ...(sp.get("make") ? { p_make: sp.get("make")! } : {}),
          ...(sp.get("sellerState") ? { p_state: sp.get("sellerState")! } : {}),
        }),
      );
      const r = rows[0] ?? {};
      const strings = (x: unknown) =>
        Array.isArray(x)
          ? x.filter((v): v is string => typeof v === "string")
          : [];
      const num = (v: unknown) =>
        v !== null && v !== undefined && Number.isFinite(Number(v))
          ? Number(v)
          : null;
      return {
        facets: {
          makes: strings(r.makes),
          models: strings(r.models),
          states: strings(r.states),
          cities: strings(r.cities),
          ranges: {
            yearMin: num(r.year_min),
            yearMax: num(r.year_max),
            priceMin: num(r.price_min),
            priceMax: num(r.price_max),
            mileageMin: num(r.mileage_min),
            mileageMax: num(r.mileage_max),
          },
        },
        etag:
          r.catalog_version != null
            ? `W/"inventory-facets-${sp.get("tenant")}-${r.catalog_version}"`
            : null,
      };
    } catch (e) {
      if (
        !(e instanceof ReadFailure) ||
        !/vehicle_facets_v2|PGRST202/i.test(e.detail)
      )
        throw e;
      // Older-schema fallback: bounded pages, never Supabase's silent first 1,000 rows.
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await read(
          "vehicles",
          new URLSearchParams({
            select: "make,model,seller_state,seller_city,year,price,mileage",
            tenant_id: `eq.${tenantId}`,
            status: "eq.live",
            order: "id.asc",
            offset: String(offset),
            limit: "500",
          }),
        );
        rows.push(...page.rows);
        if (page.rows.length < 500) break;
        if (rows.length >= 100000)
          throw new ReadFailure(503, "Facet fallback limit");
      }
      const values = (field: string, source = rows) =>
        [
          ...new Set(
            source
              .map((r) => r[field])
              .filter((v): v is string => typeof v === "string" && !!v),
          ),
        ].sort();
      const range = (field: string, kind: "min" | "max") => {
        const n = rows
          .map((r) => r[field])
          .filter(
            (v): v is number => typeof v === "number" && Number.isFinite(v),
          );
        return n.length ? Math[kind](...n) : null;
      };
      return {
        facets: {
          makes: values("make"),
          models: values(
            "model",
            rows.filter((r) => !sp.get("make") || r.make === sp.get("make")),
          ),
          states: values("seller_state"),
          cities: values(
            "seller_city",
            rows.filter(
              (r) =>
                !sp.get("sellerState") ||
                r.seller_state === sp.get("sellerState"),
            ),
          ),
          ranges: {
            yearMin: range("year", "min"),
            yearMax: range("year", "max"),
            priceMin: range("price", "min"),
            priceMax: range("price", "max"),
            mileageMin: range("mileage", "min"),
            mileageMax: range("mileage", "max"),
          },
        },
        etag: null,
      };
    }
  }
  return { detail, inventory, facets };
}
function searchTerm(sp: URLSearchParams) {
  return (sp.get("query") ?? sp.get("q") ?? "").trim();
}
export function inventoryParams(
  tenantId: string,
  sp: URLSearchParams,
  limit: number,
  offset: number,
) {
  const p = new URLSearchParams({
    p_tenant_id: tenantId,
    limit: String(limit + 1),
    offset: String(offset),
  });
  const term = searchTerm(sp);
  if (term) p.set("search_vector", `wfts(simple).${term}`);
  for (const [param, column] of Object.entries({
    make: "make",
    model: "model",
    bodyStyle: "body_style",
    stockType: "stock_type",
    fuelType: "fuel_type",
    drivetrain: "drivetrain",
    sellerState: "seller_state",
    sellerCity: "seller_city",
  })) {
    const value = sp.get(param);
    if (value) p.set(column, `eq.${value}`);
  }
  for (const [param, column, op] of [
    ["yearMin", "year", "gte"],
    ["yearMax", "year", "lte"],
    ["priceMin", "price", "gte"],
    ["priceMax", "price", "lte"],
  ]) {
    const n = parseInt(sp.get(param) ?? "");
    if (Number.isFinite(n) && (param.startsWith("year") || n > 0))
      p.append(column, `${op}.${n}`);
  }
  const mileage = parseInt(sp.get("mileageMax") ?? "");
  if (Number.isFinite(mileage) && mileage > 0)
    p.append("or", `(mileage.lte.${mileage},mileage.is.null)`);
  const order: Record<string, string> = {
    created_desc: "created_at.desc",
    price_asc: "price.asc",
    price_desc: "price.desc",
    year_desc: "year.desc",
    year_asc: "year.asc",
    mileage_asc: "mileage.asc.nullslast",
    mileage_desc: "mileage.desc.nullslast",
  };
  p.set(
    "order",
    `${order[sp.get("sort") ?? ""] ?? "is_special.desc,created_at.desc"},id.asc`,
  );
  return p;
}
