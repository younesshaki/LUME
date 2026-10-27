import type { Metadata } from "next";
import { requestTenant } from "../../server/tenant";
import { vehicleRepository, safeImage } from "../../server/vehicles/data";
import {
  canonicalFor,
  priceLabel,
  vehiclePath,
  vehicleTitle,
} from "../../server/vehicles/presentation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Search = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Search> };
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const tenant = await requestTenant((await searchParams).tenant);
  return {
    title: `Vehicles | ${tenant.name}`,
    description: `Browse vehicles available at ${tenant.name}.`,
    alternates: {
      canonical: canonicalFor(tenant, inventoryCanonical(await searchParams)),
    },
  };
}
export default async function Inventory({ searchParams }: Props) {
  const search = await searchParams;
  const tenant = await requestTenant(search.tenant);
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(search))
    if (typeof value === "string") sp.set(key, value);
  const pageSize = 12;
  const offset = Math.max(0, parseInt(sp.get("offset") ?? "") || 0);
  sp.set("limit", String(pageSize));
  sp.set("offset", String(offset));
  sp.set("includeCount", "true");
  const result = await vehicleRepository().inventory(tenant.tenantId, sp);
  function pageLink(next: number) {
    const p = new URLSearchParams(sp);
    p.set("tenant", tenant.slug);
    p.set("offset", String(next));
    p.delete("limit");
    p.delete("includeCount");
    return `/vehicles?${p}`;
  }
  return (
    <main className="vehicle-page">
      <p className="preview-banner">Staging preview · read-only · noindex</p>
      <h1>{tenant.name} vehicles</h1>
      <form action="/vehicles" method="get" className="inventory-filters">
        <input type="hidden" name="tenant" value={tenant.slug} />
        <label>
          Search{" "}
          <input
            type="search"
            name="query"
            defaultValue={sp.get("query") ?? sp.get("q") ?? ""}
          />
        </label>
        <label>
          Make <input name="make" defaultValue={sp.get("make") ?? ""} />
        </label>
        <label>
          Maximum price{" "}
          <input
            name="priceMax"
            type="number"
            min="1"
            defaultValue={sp.get("priceMax") ?? ""}
          />
        </label>
        <label>
          Sort{" "}
          <select name="sort" defaultValue={sp.get("sort") ?? "recommended"}>
            <option value="recommended">Recommended</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
            <option value="year_desc">Newest year</option>
            <option value="mileage_asc">Lowest mileage</option>
          </select>
        </label>
        <button type="submit">Find vehicles</button>
      </form>
      <p>{result.totalCount ?? result.vehicles.length} matching vehicles</p>
      {result.vehicles.length === 0 && <p>No vehicles match your filters.</p>}
      <div className="inventory-grid">
        {result.vehicles.map((v) => {
          const image =
            safeImage(v.primaryImageSrc) ??
            safeImage(v.specialImageSrc) ??
            safeImage(v.imageSrc);
          return (
            <article key={v.id}>
              <a href={vehiclePath(v.id, tenant.slug)}>
                {image ? (
                  <img
                    src={image}
                    alt={v.primaryImageAlt ?? vehicleTitle(v)}
                    width={600}
                    height={400}
                    loading="lazy"
                  />
                ) : (
                  <div className="image-fallback">Photos coming soon</div>
                )}
                <h2>{vehicleTitle(v)}</h2>
              </a>
              <p>{priceLabel(v.price)}</p>
              <p>
                {v.mileage === null
                  ? "Mileage not provided"
                  : `${v.mileage.toLocaleString("en-US")} miles`}
              </p>
            </article>
          );
        })}
      </div>
      <nav aria-label="Inventory pages" className="pagination">
        {offset > 0 && (
          <a href={pageLink(Math.max(0, offset - pageSize))}>Previous</a>
        )}
        {result.hasMore && <a href={pageLink(offset + pageSize)}>Next</a>}
      </nav>
    </main>
  );
}

function inventoryCanonical(search: Search) {
  const p = new URLSearchParams();
  for (const key of [
    "query",
    "q",
    "make",
    "model",
    "bodyStyle",
    "stockType",
    "fuelType",
    "drivetrain",
    "sellerState",
    "sellerCity",
    "yearMin",
    "yearMax",
    "priceMin",
    "priceMax",
    "mileageMax",
    "sort",
    "offset",
  ]) {
    const value = search[key];
    if (typeof value === "string" && value) p.set(key, value);
  }
  return `/vehicles${p.size ? `?${p}` : ""}`;
}
