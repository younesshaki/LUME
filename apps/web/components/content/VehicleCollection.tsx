import type { PageBlock } from "@lume/types";
import { VehicleCollectionView } from "@lume/blocks/react/VehicleCollection";
import { VehicleCardView } from "@lume/blocks/react/VehicleCard";
import {
  stringProp,
  numberProp,
  stringArrayProp,
} from "@lume/blocks/react/props";
import { vehicleRepository, safeImage } from "../../server/vehicles/data";
import { priceLabel, vehiclePath } from "../../server/vehicles/presentation";
import { contentContext } from "../../server/content/context";
export async function VehicleCollection({ block }: { block: PageBlock }) {
  const { tenant } = await contentContext();
  const repository = vehicleRepository();
  const max = Math.min(
    12,
    Math.max(1, Math.round(numberProp(block, "maxItems", 6))),
  );
  const ids = stringArrayProp(block, "vehicleIds").slice(0, 12);
  const vehicles = ids.length
    ? (
        await Promise.allSettled(
          ids.slice(0, max).map((id) => repository.detail(tenant.tenantId, id)),
        )
      ).flatMap((r) =>
        r.status === "fulfilled" && r.value ? [r.value.vehicle] : [],
      )
    : (
        await repository.inventory(
          tenant.tenantId,
          new URLSearchParams({
            limit: String(max),
            make: stringProp(block, "make"),
            bodyStyle: stringProp(block, "bodyStyle"),
            priceMax: String(Math.max(0, numberProp(block, "priceMax"))),
            sort:
              block.type === "new-arrivals" ? "created_desc" : "recommended",
          }),
        )
      ).vehicles;
  return (
    <VehicleCollectionView
      block={block}
      collection={{ status: "ready", vehicles }}
      scrollerId={`${block.id}-vehicles`}
      inventoryHref={`/vehicles?tenant=${tenant.slug}`}
      cards={vehicles.map((v) => (
        <VehicleCardView
          key={v.id}
          vehicle={v}
          image={
            safeImage(v.primaryImageSrc) ??
            safeImage(v.specialImageSrc) ??
            safeImage(v.imageSrc) ??
            ""
          }
          price={priceLabel(v.price)}
          href={vehiclePath(v.id, tenant.slug)}
        />
      ))}
    />
  );
}
