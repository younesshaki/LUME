import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
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
  const maxItems = Math.min(12, Math.max(1, Math.round(numberProp(block, "maxItems", 6))));
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
                  curatedIds.slice(0, maxItems).map((id) => loadVehicleById(id)),
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
    <div className="vehicleCarousel__controls" aria-label="Vehicle carousel controls">
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
    <DealershipSection
      block={block}
      className="dealershipBlock--vehicles"
      headerAside={controls}
    >
      {collection.status === "loading" ? (
        <p className="dealershipBlock__empty" role="status">Loading vehicles…</p>
      ) : collection.status === "error" ? (
        <p className="dealershipBlock__empty" role="alert">
          The live collection is temporarily unavailable.
        </p>
      ) : collection.vehicles.length === 0 ? (
        <p className="dealershipBlock__empty" role="status">
          No live vehicles match this selection yet.
        </p>
      ) : (
        <div
          id={scrollerId}
          ref={scrollerRef}
          className="vehicleCarousel"
          role="region"
          aria-label="Featured vehicles"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {collection.vehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      )}
      <div className="dealershipBlock__footerAction">
        <DealershipActionLink href="/vehicles" secondary>
          {stringProp(block, "ctaLabel")}
          <ArrowRight aria-hidden="true" />
        </DealershipActionLink>
      </div>
    </DealershipSection>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const image = vehicleDisplayImage(vehicle);
  const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  return (
    <article className="vehicleCarousel__card">
      <a href={`/vehicles/${encodeURIComponent(vehicle.id)}`}>
        <div className="vehicleCarousel__media">
          {image ? (
            <img
              src={image}
              alt={vehicle.primaryImageAlt || vehicleName}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span aria-hidden="true">{vehicle.make}</span>
          )}
        </div>
        <div className="vehicleCarousel__copy">
          <p>{vehicle.year}</p>
          <h3 className="dealershipVehicleCard__title">
            <MakeLogo make={vehicle.make} size={18} />
            {vehicle.make} {vehicle.model}
          </h3>
          {vehicle.trim ? <span>{vehicle.trim}</span> : null}
          <strong>{formatVehiclePrice(vehicle.price)}</strong>
        </div>
      </a>
    </article>
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

export function VehicleSpecTable({ block }: BlockComponentProps) {
  const items = labelBodyItemsProp(block);

  return (
    <DealershipSection block={block} className="dealershipBlock--specs">
      <div className="vehicleSpecTable">
        <dl>
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`}>
              <dt>{item.label}</dt>
              <dd>{item.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </DealershipSection>
  );
}
