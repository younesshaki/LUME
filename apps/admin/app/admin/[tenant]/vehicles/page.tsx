import Link from "next/link";
import { notFound } from "next/navigation";
import { Car, LayoutGrid, Plus, Search, TableProperties, Upload } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  VEHICLE_STATUS_FILTERS,
  normalizeVehicleStatusFilter,
  vehicleStatusFilterLabel,
} from "@/lib/vehicleStatus";
import { readR2PublicBaseUrl } from "@/lib/r2Config";
import {
  groupManagedImagesByVehicle,
  normalizeVehicleImageFilter,
  resolveVehicleThumbnail,
  type ManagedImageRef,
} from "@/lib/vehicleGrid";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VehiclePriceRange } from "./VehiclePriceRange";
import { VehiclesTableClient, type InventoryView } from "./VehiclesTableClient";

type PageProps = {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
    dir?: string;
    page?: string;
    status?: string;
    view?: string;
    images?: string;
    minPrice?: string;
    maxPrice?: string;
    minYear?: string;
    maxYear?: string;
    maxMileage?: string;
  }>;
};

const PAGE_SIZE = 25;

const SORTABLE: Record<string, string> = {
  year: "year",
  make: "make",
  model: "model",
  price: "price",
  mileage: "mileage",
};

export default async function VehiclesPage({ params, searchParams }: PageProps) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const sort = SORTABLE[sp.sort ?? ""] ? sp.sort! : "year";
  const dir = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);
  const status = normalizeVehicleStatusFilter(sp.status);
  const view: InventoryView = sp.view === "grid" ? "grid" : "table";
  const imageFilter = normalizeVehicleImageFilter(sp.images);
  const minPrice = parseBoundedPositiveInt(sp.minPrice);
  const maxPrice = parseBoundedPositiveInt(sp.maxPrice);
  const minYear = parseBoundedPositiveInt(sp.minYear, 1886, 3000);
  const maxYear = parseBoundedPositiveInt(sp.maxYear, 1886, 3000);
  const maxMileage = parseBoundedPositiveInt(sp.maxMileage, 0, 2_000_000);

  const supabase = await createSupabaseServerClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("id, slug, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!tenant) notFound();

  let query = supabase
    .from("vehicles")
    .select(
      "id, year, make, model, trim, price, mileage, body_style, exterior_color, status, sold_at, stock_type, external_id, image_src, special_image_src",
      { count: "exact" },
    )
    .eq("tenant_id", tenant.id);

  if (status === "active") query = query.neq("status", "archived");
  else if (status !== "all") query = query.eq("status", status);

  if (q) {
    const term = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
    query = query.or(`make.ilike.${term},model.ilike.${term},trim.ilike.${term}`);
  }
  if (minPrice !== undefined) query = query.gte("price", minPrice);
  if (maxPrice !== undefined) query = query.lte("price", maxPrice);
  if (minYear !== undefined) query = query.gte("year", minYear);
  if (maxYear !== undefined) query = query.lte("year", maxYear);
  if (maxMileage !== undefined) query = query.lte("mileage", maxMileage);

  // The main query stays paginated. Fetching just vehicle IDs from the
  // managed-image table lets the photo filter include the same sources the
  // grid thumbnail resolver uses: managed R2, special, and legacy feed URLs.
  if (imageFilter !== "all") {
    const { data: managedImageRows } = await supabase
      .from("vehicle_images")
      .select("vehicle_id")
      .eq("tenant_id", tenant.id);
    const managedVehicleIds = [...new Set((managedImageRows ?? []).map((image) => image.vehicle_id))];
    const managedIdsFilter = managedVehicleIds.length > 0
      ? `,id.in.(${managedVehicleIds.join(",")})`
      : "";

    if (imageFilter === "with") {
      query = query.or(`image_src.neq.\"\",special_image_src.neq.\"\"${managedIdsFilter}`);
    } else {
      query = query
        .or('image_src.is.null,image_src.eq.\"\"')
        .or('special_image_src.is.null,special_image_src.eq.\"\"');
      if (managedVehicleIds.length > 0) {
        query = query.not("id", "in", `(${managedVehicleIds.join(",")})`);
      }
    }
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data: vehicles, count, error } = await query
    .order(SORTABLE[sort], { ascending: dir === "asc", nullsFirst: false })
    .range(from, from + PAGE_SIZE - 1);

  // One bounded, tenant-scoped image lookup for the vehicles on this page —
  // managed R2 images stay authoritative over imported external URLs. A
  // failed read (e.g. migration missing) degrades to legacy fallbacks only.
  const pageVehicles = vehicles ?? [];
  let managedByVehicle = new Map<string, ManagedImageRef[]>();
  if (pageVehicles.length > 0) {
    const { data: managedImages } = await supabase
      .from("vehicle_images")
      .select("vehicle_id, r2_key, is_primary, sort_order, created_at")
      .eq("tenant_id", tenant.id)
      .in("vehicle_id", pageVehicles.map((vehicle) => vehicle.id));
    managedByVehicle = groupManagedImagesByVehicle(managedImages ?? []);
  }
  const r2PublicBaseUrl = readR2PublicBaseUrl();
  const thumbnails: Record<string, string | null> = Object.fromEntries(
    pageVehicles.map((vehicle) => [
      vehicle.id,
      resolveVehicleThumbnail({
        managed: managedByVehicle.get(vehicle.id),
        vehicle: {
          special_image_src: vehicle.special_image_src,
          image_src: vehicle.image_src,
        },
        r2PublicBaseUrl,
      }),
    ]),
  );

  // Slider bounds come from the tenant's own inventory, and deliberately ignore
  // the active filters so the scale doesn't move as you drag it.
  //
  // Uses roughly the 95th percentile rather than the maximum: a single
  // exotic/mispriced unit would otherwise stretch the track so far that the
  // range real inventory sits in becomes undraggable.
  const { count: pricedCount } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenant.id);
  const percentileOffset = Math.floor((pricedCount ?? 0) * 0.05);
  const { data: nearTop } = await supabase
    .from("vehicles")
    .select("price")
    .eq("tenant_id", tenant.id)
    .order("price", { ascending: false })
    .range(percentileOffset, percentileOffset);
  // Never clip a constraint already in the URL — the concierge may have set a
  // range above the percentile, and the control must be able to represent it.
  const priceCeiling = Math.max(
    1000,
    Math.ceil(((nearTop?.[0]?.price ?? 0) || 50_000) / 1000) * 1000,
    maxPrice ?? 0,
    minPrice ?? 0,
  );

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const statusDescriptor = status === "all" ? "" : `${vehicleStatusFilterLabel(status).toLowerCase()} `;
  const constraintDescriptor = vehicleConstraintDescriptor({ minPrice, maxPrice, minYear, maxYear, maxMileage });

  const href = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, sort, dir, page, status, view, images: imageFilter, minPrice, maxPrice, minYear, maxYear, maxMileage, ...overrides };
    if (merged.q) params.set("q", String(merged.q));
    if (merged.sort && merged.sort !== "year") params.set("sort", String(merged.sort));
    if (merged.dir && merged.dir !== "desc") params.set("dir", String(merged.dir));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    if (merged.status && merged.status !== "active") params.set("status", String(merged.status));
    if (merged.view && merged.view !== "table") params.set("view", String(merged.view));
    if (merged.images && merged.images !== "all") params.set("images", String(merged.images));
    if (merged.minPrice !== undefined) params.set("minPrice", String(merged.minPrice));
    if (merged.maxPrice !== undefined) params.set("maxPrice", String(merged.maxPrice));
    if (merged.minYear !== undefined) params.set("minYear", String(merged.minYear));
    if (merged.maxYear !== undefined) params.set("maxYear", String(merged.maxYear));
    if (merged.maxMileage !== undefined) params.set("maxMileage", String(merged.maxMileage));
    const qs = params.toString();
    return `/admin/${slug}/vehicles${qs ? `?${qs}` : ""}`;
  };

  const sortHref = (column: string) =>
    href({ sort: column, dir: sort === column && dir === "desc" ? "asc" : "desc", page: 1 });
  const sortHrefs = {
    year: sortHref("year"),
    make: sortHref("make"),
    model: sortHref("model"),
    price: sortHref("price"),
    mileage: sortHref("mileage"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description={
          error
            ? "Error loading vehicles"
            : `${totalCount.toLocaleString()} ${statusDescriptor}vehicle${totalCount === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}${constraintDescriptor}`
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/admin/${slug}/vehicles/import`}>
                <Upload />
                Import CSV
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/admin/${slug}/vehicles/new`}>
                <Plus />
                Add vehicle
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-2" aria-label="Filter vehicles by status">
          {VEHICLE_STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              variant={status === filter.value ? "secondary" : "outline"}
              size="sm"
              asChild
            >
              <Link
                href={href({ status: filter.value, page: 1 })}
                aria-current={status === filter.value ? "page" : undefined}
              >
                {filter.label}
              </Link>
            </Button>
          ))}
        </nav>
        <nav className="flex gap-1 rounded-lg border p-0.5" aria-label="Inventory layout">
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href={href({ view: "table" })} aria-current={view === "table" ? "true" : undefined}>
              <TableProperties aria-hidden="true" />
              Table
            </Link>
          </Button>
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="sm"
            asChild
          >
            <Link href={href({ view: "grid" })} aria-current={view === "grid" ? "true" : undefined}>
              <LayoutGrid aria-hidden="true" />
              Grid
            </Link>
          </Button>
        </nav>
      </div>

      {/* Price/year/mileage can be set by the concierge as well as by hand, so
          every active constraint must be visible AND removable here. Without
          this the dashboard can be driven into a filtered state the UI has no
          way to clear — href() carries these params onto every link and form
          on the page, so they survive searching, sorting and paging. */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3">
        <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Filter vehicles by price, year and mileage">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {status !== "active" ? <input type="hidden" name="status" value={status} /> : null}
          {view !== "table" ? <input type="hidden" name="view" value={view} /> : null}
          {imageFilter !== "all" ? <input type="hidden" name="images" value={imageFilter} /> : null}
          {sort !== "year" ? <input type="hidden" name="sort" value={sort} /> : null}
          {dir !== "desc" ? <input type="hidden" name="dir" value={dir} /> : null}
          <VehiclePriceRange ceiling={priceCeiling} minPrice={minPrice} maxPrice={maxPrice} />
          {([
            ["minYear", "Min year", minYear],
            ["maxYear", "Max year", maxYear],
            ["maxMileage", "Max mileage", maxMileage],
          ] as const).map(([name, label, value]) => (
            <label key={name} className="grid gap-1 text-xs text-muted-foreground">
              {label}
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                name={name}
                defaultValue={value ?? ""}
                className="h-9 w-28"
              />
            </label>
          ))}
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
        </form>

        {constraintDescriptor ? (
          <div className="flex flex-wrap items-center gap-2">
            {([
              ["minPrice", minPrice === undefined ? null : `Over $${minPrice.toLocaleString()}`],
              ["maxPrice", maxPrice === undefined ? null : `Under $${maxPrice.toLocaleString()}`],
              ["minYear", minYear === undefined ? null : `From ${minYear}`],
              ["maxYear", maxYear === undefined ? null : `Up to ${maxYear}`],
              ["maxMileage", maxMileage === undefined ? null : `Under ${maxMileage.toLocaleString()} mi`],
            ] as const).map(([name, label]) =>
              label ? (
                <Button key={name} variant="outline" size="sm" asChild>
                  <Link href={href({ [name]: undefined, page: 1 })}>
                    {label}
                    <span aria-hidden="true">×</span>
                    <span className="sr-only">Remove this filter</span>
                  </Link>
                </Button>
              ) : null,
            )}
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={href({
                  minPrice: undefined,
                  maxPrice: undefined,
                  minYear: undefined,
                  maxYear: undefined,
                  maxMileage: undefined,
                  page: 1,
                })}
              >
                Clear filters
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {view === "grid" ? (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Filter vehicles by photo availability">
          <span className="text-sm text-muted-foreground">Photos</span>
          {([
            ["all", "All"],
            ["with", "With photos"],
            ["without", "No photos"],
          ] as const).map(([value, label]) => (
            <Button
              key={value}
              variant={imageFilter === value ? "secondary" : "outline"}
              size="sm"
              asChild
            >
              <Link
                href={href({ images: value, page: 1 })}
                aria-current={imageFilter === value ? "true" : undefined}
              >
                {label}
              </Link>
            </Button>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="relative w-full max-w-sm">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            name="q"
            aria-label="Search vehicles"
            defaultValue={q}
            placeholder="Search make, model, trim…"
            className="pl-8"
          />
          {sort !== "year" && <input type="hidden" name="sort" value={sort} />}
          {dir !== "desc" && <input type="hidden" name="dir" value={dir} />}
          {status !== "active" && <input type="hidden" name="status" value={status} />}
          {view !== "table" && <input type="hidden" name="view" value={view} />}
          {imageFilter !== "all" && <input type="hidden" name="images" value={imageFilter} />}
          {minPrice !== undefined && <input type="hidden" name="minPrice" value={minPrice} />}
          {maxPrice !== undefined && <input type="hidden" name="maxPrice" value={maxPrice} />}
          {minYear !== undefined && <input type="hidden" name="minYear" value={minYear} />}
          {maxYear !== undefined && <input type="hidden" name="maxYear" value={maxYear} />}
          {maxMileage !== undefined && <input type="hidden" name="maxMileage" value={maxMileage} />}
        </form>

        {view === "grid" ? (
          <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Sort vehicle grid">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {status !== "active" ? <input type="hidden" name="status" value={status} /> : null}
            {imageFilter !== "all" ? <input type="hidden" name="images" value={imageFilter} /> : null}
            {minPrice !== undefined ? <input type="hidden" name="minPrice" value={minPrice} /> : null}
            {maxPrice !== undefined ? <input type="hidden" name="maxPrice" value={maxPrice} /> : null}
            {minYear !== undefined ? <input type="hidden" name="minYear" value={minYear} /> : null}
            {maxYear !== undefined ? <input type="hidden" name="maxYear" value={maxYear} /> : null}
            {maxMileage !== undefined ? <input type="hidden" name="maxMileage" value={maxMileage} /> : null}
            <input type="hidden" name="view" value="grid" />
            <label className="grid gap-1 text-xs text-muted-foreground">
              Sort by
              <select
                name="sort"
                defaultValue={sort}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="year">Year</option>
                <option value="make">Make</option>
                <option value="model">Model</option>
                <option value="price">Price</option>
                <option value="mileage">Mileage</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Direction
              <select
                name="dir"
                defaultValue={dir}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
            <Button type="submit" variant="outline" size="sm">
              Apply sort
            </Button>
          </form>
        ) : null}
      </div>

      {totalCount === 0 && !q && !error ? (
        <EmptyState
          icon={Car}
          title={
            status === "active"
              ? "No current vehicles yet"
              : status === "all"
                ? "No vehicles yet"
                : `No ${vehicleStatusFilterLabel(status).toLowerCase()} vehicles`
          }
          description={
            status === "active"
              ? "Add vehicles one at a time, or import your whole inventory from a CSV file in one go."
              : "Choose another status filter or add a vehicle."
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href={`/admin/${slug}/vehicles/import`}>
                  <Upload />
                  Import CSV
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/admin/${slug}/vehicles/new`}>
                  <Plus />
                  Add vehicle
                </Link>
              </Button>
            </div>
          }
        />
      ) : (
        <VehiclesTableClient
          tenantId={tenant.id}
          tenantSlug={tenant.slug}
          vehicles={pageVehicles}
          thumbnails={thumbnails}
          view={view}
          query={q}
          errorMessage={error ? "Failed to load vehicles" : null}
          clearSearchHref={href({ q: undefined, page: 1 })}
          sort={sort}
          direction={dir}
          sortHrefs={sortHrefs}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {totalCount.toLocaleString()} vehicles
          </span>
          <div className="flex gap-2">
            {page <= 1 ? (
              <Button variant="outline" size="sm" disabled>
                Previous
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: page - 1 })}>Previous</Link>
              </Button>
            )}
            {page >= totalPages ? (
              <Button variant="outline" size="sm" disabled>
                Next
              </Button>
            ) : (
              <Button variant="outline" size="sm" asChild>
                <Link href={href({ page: page + 1 })}>Next</Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function parseBoundedPositiveInt(
  value: string | undefined,
  minimum = 0,
  maximum = 10_000_000,
): number | undefined {
  if (!value || !/^\d{1,8}$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
}

function vehicleConstraintDescriptor(filters: {
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxYear?: number;
  maxMileage?: number;
}): string {
  const parts: string[] = [];
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    parts.push(
      filters.minPrice !== undefined && filters.maxPrice !== undefined
        ? ` priced $${filters.minPrice.toLocaleString()}–$${filters.maxPrice.toLocaleString()}`
        : filters.maxPrice !== undefined
          ? ` under $${filters.maxPrice.toLocaleString()}`
          : ` over $${filters.minPrice!.toLocaleString()}`,
    );
  }
  if (filters.minYear !== undefined || filters.maxYear !== undefined) {
    parts.push(filters.minYear === filters.maxYear ? ` from ${filters.minYear}` : " in the selected year range");
  }
  if (filters.maxMileage !== undefined) parts.push(` under ${filters.maxMileage.toLocaleString()} miles`);
  return parts.length ? ` ·${parts.join(" ·")}` : "";
}
