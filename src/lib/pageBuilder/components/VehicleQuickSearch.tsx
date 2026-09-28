import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { encodeVehicleUrlState } from "@/experience/vehicles/urlState";
import {
  DEFAULT_FILTERS,
  loadVehicleFacets,
  type VehicleFacets,
  type VehicleFilters,
} from "@/experience/vehicles/catalog";

const EMPTY_FACETS: VehicleFacets = { makes: [], models: [], states: [], cities: [] };

type VehicleQuickSearchProps = {
  /** Root class; child classes are `<className>__…`, as the search band styled them. */
  className: string;
  buttonLabel: string;
  defaultBudget?: number;
  /** Adds a New / Used choice, the real `stockType` inventory filter. */
  showCondition?: boolean;
};

/**
 * Make, model, budget (and optionally condition) → a link into the inventory
 * page's real URL filters. Shared by the vehicle-search-band block and the
 * hero's "Inventory search" design, so there is one search, not two.
 */
export function VehicleQuickSearch({
  className,
  buttonLabel,
  defaultBudget = 0,
  showCondition = false,
}: VehicleQuickSearchProps) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [condition, setCondition] = useState("");
  const [budget, setBudget] = useState(defaultBudget);
  const [facets, setFacets] = useState<VehicleFacets>(EMPTY_FACETS);

  useEffect(() => setBudget(defaultBudget), [defaultBudget]);

  useEffect(() => {
    let cancelled = false;
    setFacets(EMPTY_FACETS);
    void loadVehicleFacets(make, "")
      .then((next) => {
        if (!cancelled) setFacets(next);
      })
      .catch(() => {
        if (!cancelled) setFacets(EMPTY_FACETS);
      });
    return () => {
      cancelled = true;
    };
  }, [make]);

  const inventoryHref = useMemo(() => {
    const filters: VehicleFilters = {
      ...DEFAULT_FILTERS,
      make,
      model,
      stockType: condition,
      priceMax: budget,
    };
    return `/vehicles${encodeVehicleUrlState(filters, "recommended", 1)}`;
  }, [budget, condition, make, model]);

  return (
    <div className={className} role="search">
      {showCondition ? (
        <label>
          <span>Condition</span>
          <select name="vehicleCondition" value={condition} onChange={(event) => setCondition(event.target.value)}>
            <option value="">New &amp; used</option>
            <option value="New">New</option>
            <option value="Used">Used</option>
          </select>
        </label>
      ) : null}
      <label>
        <span>Make</span>
        <select
          name="vehicleMake"
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
            setModel("");
          }}
        >
          <option value="">All makes</option>
          {facets.makes.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <select
          name="vehicleModel"
          value={model}
          disabled={!make}
          onChange={(event) => setModel(event.target.value)}
        >
          <option value="">All models</option>
          {facets.models.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Maximum budget</span>
        <input
          name="vehicleBudget"
          type="number"
          min={0}
          step={1000}
          inputMode="numeric"
          value={budget || ""}
          placeholder="Any budget"
          onChange={(event) => {
            const nextBudget = Number(event.target.value);
            setBudget(Number.isFinite(nextBudget) ? Math.max(0, nextBudget) : 0);
          }}
        />
      </label>
      <a className={`${className}__submit`} href={inventoryHref}>
        {buttonLabel}
        <ArrowRight aria-hidden="true" />
      </a>
    </div>
  );
}
