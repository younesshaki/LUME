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
  resolveVehicleThumbnail,
  type ManagedImageRef,
} from "@/lib/vehicleGrid";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const statusDescriptor = status === "all" ? "" : `${vehicleStatusFilterLabel(status).toLowerCase()} `;

  const href = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const merged = { q, sort, dir, page, status, view, ...overrides };
    if (merged.q) params.set("q", String(merged.q));
    if (merged.sort && merged.sort !== "year") params.set("sort", String(merged.sort));
    if (merged.dir && merged.dir !== "desc") params.set("dir", String(merged.dir));
    if (merged.page && Number(merged.page) > 1) params.set("page", String(merged.page));
    if (merged.status && merged.status !== "active") params.set("status", String(merged.status));
    if (merged.view && merged.view !== "table") params.set("view", String(merged.view));
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
            : `${totalCount.toLocaleString()} ${statusDescriptor}vehicle${totalCount === 1 ? "" : "s"}${q ? ` matching “${q}”` : ""}`
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
        </form>

        {view === "grid" ? (
          <form method="get" className="flex flex-wrap items-end gap-2" aria-label="Sort vehicle grid">
            {q ? <input type="hidden" name="q" value={q} /> : null}
            {status !== "active" ? <input type="hidden" name="status" value={status} /> : null}
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
