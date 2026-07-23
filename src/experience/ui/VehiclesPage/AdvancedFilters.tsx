import { useEffect, useMemo, useRef } from "react";
import { X } from "lucide-react";
import {
  BODY_STYLES,
  DRIVETRAINS,
  FUEL_TYPES,
  MILEAGE_OPTIONS,
  PRICE_MAX_OPTIONS,
  PRICE_OPTIONS,
  YEAR_MAX,
  YEAR_MIN,
  type VehicleFacets,
  type VehicleFilters,
} from "@/experience/vehicles/catalog";
import { useSound } from "@/lib/sound";
import { vehiclePageSoundActions } from "./VehiclesPage.sounds";

export function useDialogKeyboard(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const root = ref.current;
    const focusable = root?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !root) return;
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus();
    };
  }, [onClose, open]);

  return ref;
}

export function PillButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`vehiclesPage__pill${active ? " vehiclesPage__pill--active" : ""}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function AdvancedFilters({
  open,
  facets,
  filters,
  activeCount,
  onChange,
  onClear,
  onClose,
}: {
  open: boolean;
  facets: VehicleFacets;
  filters: VehicleFilters;
  activeCount: number;
  onChange: (patch: Partial<VehicleFilters>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const { play } = useSound();
  const dialogRef = useDialogKeyboard(open, onClose);
  const years = useMemo(() => {
    const ys: number[] = [];
    for (let y = YEAR_MIN; y <= YEAR_MAX; y++) ys.push(y);
    return ys;
  }, []);

  if (!open) return null;

  return (
    <div className="vehiclesPage__drawerOverlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="vehiclesPage__drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-filters-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="vehiclesPage__drawerHeader">
          <div>
            <p className="vehiclesPage__eyebrowSmall">Refine</p>
            <h2 id="vehicle-filters-title">Filters</h2>
          </div>
          <button
            type="button"
            className="vehiclesPage__iconBtn"
            aria-label="Close filters"
            onClick={() => {
              play(vehiclePageSoundActions.filterClose);
              onClose();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="vehiclesPage__filterGrid">
          <div className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">Condition</span>
            <div className="vehiclesPage__pillRow">
              {["New", "Used"].map((type) => (
                <PillButton
                  key={type}
                  label={type}
                  active={filters.stockType === type}
                  onClick={() => onChange({ stockType: filters.stockType === type ? "" : type })}
                />
              ))}
            </div>
          </div>

          <label className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">State</span>
            <select
              className="vehiclesPage__select"
              value={filters.sellerState}
              onChange={(event) => onChange({ sellerState: event.target.value, sellerCity: "" })}
            >
              <option value="">All States</option>
              {facets.states.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>

          <label className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">City</span>
            <select
              className="vehiclesPage__select"
              value={filters.sellerCity}
              disabled={!filters.sellerState}
              onChange={(event) => onChange({ sellerCity: event.target.value })}
            >
              <option value="">All Cities</option>
              {facets.cities.map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>

          <div className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">Year</span>
            <div className="vehiclesPage__rangeRow">
              <select
                className="vehiclesPage__select vehiclesPage__select--sm"
                value={filters.yearMin}
                aria-label="Minimum year"
                onChange={(event) => onChange({ yearMin: Number(event.target.value) })}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span className="vehiclesPage__rangeSep">-</span>
              <select
                className="vehiclesPage__select vehiclesPage__select--sm"
                value={filters.yearMax}
                aria-label="Maximum year"
                onChange={(event) => onChange({ yearMax: Number(event.target.value) })}
              >
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          <div className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">Price</span>
            <div className="vehiclesPage__rangeRow">
              <select
                className="vehiclesPage__select vehiclesPage__select--sm"
                value={filters.priceMin}
                aria-label="Minimum price"
                onChange={(event) => onChange({ priceMin: Number(event.target.value) })}
              >
                {PRICE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              <span className="vehiclesPage__rangeSep">-</span>
              <select
                className="vehiclesPage__select vehiclesPage__select--sm"
                value={filters.priceMax}
                aria-label="Maximum price"
                onChange={(event) => onChange({ priceMax: Number(event.target.value) })}
              >
                {PRICE_MAX_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          <label className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">Mileage</span>
            <select
              className="vehiclesPage__select"
              value={filters.mileageMax}
              onChange={(event) => onChange({ mileageMax: Number(event.target.value) })}
            >
              {MILEAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </label>

          <div className="vehiclesPage__filterGroup vehiclesPage__filterGroup--wide">
            <span className="vehiclesPage__filterLabel">Body Style</span>
            <div className="vehiclesPage__pillRow">
              {BODY_STYLES.map((style) => (
                <PillButton
                  key={style}
                  label={style}
                  active={filters.bodyStyle === style}
                  onClick={() => onChange({ bodyStyle: filters.bodyStyle === style ? "" : style })}
                />
              ))}
            </div>
          </div>

          <div className="vehiclesPage__filterGroup vehiclesPage__filterGroup--wide">
            <span className="vehiclesPage__filterLabel">Fuel Type</span>
            <div className="vehiclesPage__pillRow">
              {FUEL_TYPES.map((fuel) => (
                <PillButton
                  key={fuel}
                  label={fuel}
                  active={filters.fuelType === fuel}
                  onClick={() => onChange({ fuelType: filters.fuelType === fuel ? "" : fuel })}
                />
              ))}
            </div>
          </div>

          <div className="vehiclesPage__filterGroup">
            <span className="vehiclesPage__filterLabel">Drivetrain</span>
            <div className="vehiclesPage__pillRow">
              {DRIVETRAINS.map((drive) => (
                <PillButton
                  key={drive}
                  label={drive}
                  active={filters.drivetrain === drive}
                  onClick={() => onChange({ drivetrain: filters.drivetrain === drive ? "" : drive })}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="vehiclesPage__drawerActions">
          <button
            type="button"
            className="vehiclesPage__clearBtn"
            disabled={activeCount === 0}
            onClick={() => {
              play(vehiclePageSoundActions.filterClear);
              onClear();
            }}
          >
            Clear filters
            {activeCount > 0 && <span className="vehiclesPage__clearCount">{activeCount}</span>}
          </button>
          <button
            type="button"
            className="vehiclesPage__applyBtn"
            onClick={() => {
              play(vehiclePageSoundActions.filterClose);
              onClose();
            }}
          >
            Show results
          </button>
        </div>
      </section>
    </div>
  );
}
