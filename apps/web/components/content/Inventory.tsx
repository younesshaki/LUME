import type { PageBlock } from "@lume/types";
import { VehicleInventoryView } from "@lume/blocks/react/VehicleInventory";
import { MarketplaceCardView } from "@lume/blocks/react/MarketplaceCard";
import { booleanProp, stringProp } from "@lume/blocks/react/props";
import { contentContext } from "../../server/content/context";
import { vehicleRepository, safeImage } from "../../server/vehicles/data";
import { priceLabel, vehiclePath } from "../../server/vehicles/presentation";
import QuickSearch from "./QuickSearch";
export async function Inventory({ block }: { block: PageBlock }) {
  const { tenant, url } = await contentContext();
  const params = new URLSearchParams(url.searchParams);
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  params.set("limit", "24");
  params.set("offset", String(offset));
  params.set("includeCount", "true");
  const repository = vehicleRepository();
  const [result, facetResult] = await Promise.all([
    repository.inventory(tenant.tenantId, params),
    repository.facets(
      tenant.tenantId,
      new URLSearchParams({ tenant: tenant.slug }),
    ),
  ]);
  const raw = stringProp(block, "cardStyle", "classic");
  const cardStyle = raw === "notch" || raw === "bento" ? raw : "classic";
  const link = (next: number) => {
    const q = new URLSearchParams(url.searchParams);
    q.set("tenant", tenant.slug);
    q.set("offset", String(next));
    return `${url.pathname}?${q}`;
  };
  return (
    <VehicleInventoryView
      title={stringProp(block, "title")}
      loadError={false}
      showDemo={false}
      loading={false}
      visibleTotalCount={result.totalCount??null}
      activeCount={0}
      vehicleCount={result.vehicles.length}
      toolbar={
        booleanProp(block, "showFilters", true) ? (
          <QuickSearch
            tenant={tenant.slug}
            initialFacets={facetResult.facets}
            className="vehicleSearchBand"
            buttonLabel="Search inventory"
          />
        ) : null
      }
      emptyAction={
        <a href={`/vehicles?tenant=${tenant.slug}`}>Clear all filters</a>
      }
      grid={
        <div
          className={`vehiclesPage__grid${cardStyle === "bento" ? " vehiclesPage__grid--bento" : ""}`}
        >
          {result.vehicles.map((v, index) => (
            <MarketplaceCardView
              key={v.id}
              vehicle={v}
              index={index}
              cardStyle={cardStyle}
              cardColor={stringProp(block, "cardColor")}
              image={
                safeImage(v.primaryImageSrc) ??
                safeImage(v.specialImageSrc) ??
                safeImage(v.imageSrc)
              }
              price={priceLabel(v.price)}
              actions={
                <div className="vehiclesPage__cardActions">
                  <a
                    className="vehiclesPage__detailsBtn"
                    href={vehiclePath(v.id, tenant.slug)}
                  >
                    View details
                  </a>
                </div>
              }
            />
          ))}
        </div>
      }
      pagination={
        <nav
          className="vehiclesPage__pagination"
          aria-label="Vehicle results pagination"
        >
          {offset > 0 && <a href={link(Math.max(0, offset - 24))}>Previous</a>}
          {result.hasMore && <a href={link(offset + 24)}>Next</a>}
        </nav>
      }
    />
  );
}
