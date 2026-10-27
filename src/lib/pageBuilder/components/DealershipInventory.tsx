import { VehicleCardView } from "@lume/blocks/react/VehicleCard";
import { VehicleCollectionView } from "@lume/blocks/react/VehicleCollection";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useReducedMotion } from "motion/react";
import {
  DEFAULT_FILTERS,
  formatVehiclePrice,
  loadVehicleById,
  loadVehicleResults,
  vehicleDisplayImage,
  type Vehicle,
  type VehicleSort,
} from "@/experience/vehicles/catalog";
import type { BlockComponentProps } from "../registry";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { MakeLogo } from "@/components/vehicles/MakeLogo";
import { VehicleQuickSearch } from "./VehicleQuickSearch";
import {
  labelBodyItemsProp,
  numberProp,
  stringArrayProp,
  stringProp,
} from "./props";

type CollectionState =
  | { status: "loading"; vehicles: Vehicle[] }
  | { status: "ready"; vehicles: Vehicle[] }
  | { status: "error"; vehicles: Vehicle[] };

function useVehicleCollection(
  block: BlockComponentProps["block"],
  sort: VehicleSort,
): CollectionState {
  const curatedIds = stringArrayProp(block, "vehicleIds").slice(0, 12);
  const curatedKey = curatedIds.join(",");
  const make = stringProp(block, "make");
  const bodyStyle = stringProp(block, "bodyStyle");
  const priceMax = Math.max(0, numberProp(block, "priceMax"));
  const maxItems = Math.min(
    12,
    Math.max(1, Math.round(numberProp(block, "maxItems", 6))),
  );
  const [state, setState] = useState<CollectionState>({
    status: "loading",
    vehicles: [],
  });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading", vehicles: [] });

    async function load() {
      try {
        const vehicles =
          curatedIds.length > 0
            ? (
                await Promise.allSettled(
                  curatedIds
                    .slice(0, maxItems)
                    .map((id) => loadVehicleById(id)),
                )
              ).flatMap((result) =>
                result.status === "fulfilled" && result.value
                  ? [result.value.vehicle]
                  : [],
              )
            : (
                await loadVehicleResults(
                  {
                    ...DEFAULT_FILTERS,
                    make,
                    bodyStyle,
                    priceMax,
                  },
                  sort,
                  1,
                  maxItems,
                )
              ).vehicles;
        if (!cancelled) setState({ status: "ready", vehicles });
      } catch {
        if (!cancelled) setState({ status: "error", vehicles: [] });
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [bodyStyle, curatedKey, make, maxItems, priceMax, sort]);

  return state;
}

function VehicleCollection({
  block,
  sort,
}: {
  block: BlockComponentProps["block"];
  sort: VehicleSort;
}) {
  const collection = useVehicleCollection(block, sort);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollerId = useId();
  const headingId = useId();
  const reduceMotion = useReducedMotion();

  function scroll(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: direction * Math.max(280, scroller.clientWidth * 0.82),
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    scroll(event.key === "ArrowLeft" ? -1 : 1);
  }

  const controls = (
    <div
      className="vehicleCarousel__controls"
      aria-label="Vehicle carousel controls"
    >
      <button
        type="button"
        aria-label="Previous vehicles"
        aria-controls={scrollerId}
        onClick={() => scroll(-1)}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Next vehicles"
        aria-controls={scrollerId}
        onClick={() => scroll(1)}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <VehicleCollectionView
      block={block}
      headingId={headingId}
      collection={collection}
      scrollerId={scrollerId}
      scrollerRef={scrollerRef}
      controls={controls}
      onKeyDown={handleKeyDown}
      cards={collection.vehicles.map((vehicle) => (
        <VehicleCard key={vehicle.id} vehicle={vehicle} />
      ))}
    />
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const image = vehicleDisplayImage(vehicle);
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <VehicleCardView
      vehicle={vehicle}
      image={image}
      price={formatVehiclePrice(vehicle.price)}
      href={`/vehicles/${encodeURIComponent(vehicle.id)}`}
    />
  );
}

export function FeaturedVehicles({ block }: BlockComponentProps) {
  return <VehicleCollection block={block} sort="recommended" />;
}

export function NewArrivals({ block }: BlockComponentProps) {
  return <VehicleCollection block={block} sort="created_desc" />;
}

export function VehicleSearchBand({ block }: BlockComponentProps) {
  return (
    <DealershipSection
      block={block}
      className="dealershipBlock--search"
      headerAside={<Search aria-hidden="true" />}
    >
      <VehicleQuickSearch
        className="vehicleSearchBand"
        buttonLabel={stringProp(block, "buttonLabel")}
        defaultBudget={Math.max(0, numberProp(block, "defaultBudget"))}
      />
    </DealershipSection>
  );
}

export { VehicleSpecTable } from "@lume/blocks/react/VehicleSpecTable";
