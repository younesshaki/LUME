import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { useDualMode } from "@/lib/DualModeContext";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Heart,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  BODY_STYLES,
  DEFAULT_FILTERS,
  DRIVETRAINS,
  FUEL_TYPES,
  MILEAGE_OPTIONS,
  PRICE_MAX_OPTIONS,
  PRICE_OPTIONS,
  VEHICLE_SORT_OPTIONS,
  YEAR_MAX,
  YEAR_MIN,
  countActiveFilters,
  formatVehiclePrice,
  loadVehicleCount,
  loadVehicleFacets,
  loadVehicleResults,
  vehicleDisplayImage,
  type Vehicle,
  type VehicleFacets,
  type VehicleFilters,
  type VehicleSort,
} from "@/experience/vehicles/catalog";
import {
  encodeVehicleUrlState,
  readVehicleUrlState,
  writeVehicleUrlState,
} from "@/experience/vehicles/urlState";
import { vehicleFiltersFromBotAction } from "@/lib/botActionConsumers";
import { useBotAction } from "@/lib/useBotAction";
import { useSound } from "@/lib/sound";
import { useSavedVehicles } from "@/lib/visitor/SavedVehiclesContext";
import { trackConversion } from "@/lib/conversionAnalytics";
import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useVehiclesPageStateBridge } from "./VehiclesPage.state";
import { vehiclePageSoundActions } from "./VehiclesPage.sounds";
import "./VehiclesPage.css";

const PAGE_SIZE = 24;
const COMPARE_STORAGE_KEY = "lume.vehicle-compare.v1";
const SCROLL_STORAGE_PREFIX = "lume.vehicle-scroll:";
const EMPTY_VEHICLE_FACETS: VehicleFacets = {
  makes: [],
  models: [],
  states: [],
  cities: [],
};

function formatMileage(miles: number | null): string {
  if (miles === null) return "N/A";
  if (miles === 0) return "New";
  return `${miles.toLocaleString()} mi`;
}

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredIds(key: string, ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(ids));
}

function mergeVehicleLookup(
  current: Record<string, Vehicle>,
  vehicles: Vehicle[]
): Record<string, Vehicle> {
  if (vehicles.length === 0) return current;
  const next = { ...current };
  for (const vehicle of vehicles) next[vehicle.id] = vehicle;
  return next;
}

function scheduleAfterPaint(callback: () => void): () => void {
  let secondFrame = 0;
  const firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(callback);
  });
  return () => {
    window.cancelAnimationFrame(firstFrame);
    if (secondFrame) window.cancelAnimationFrame(secondFrame);
  };
}

function getScrollStorageKey(filters: VehicleFilters, sort: VehicleSort, page: number): string {
  return `${SCROLL_STORAGE_PREFIX}${encodeVehicleUrlState(filters, sort, page)}`;
}

function useDialogKeyboard(open: boolean, onClose: () => void) {
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

function DemoNotice() {
  return (
    <p className="vehiclesPage__demoNotice">
      Concept demo: prices and imagery are representative until verified listing data is connected.
    </p>
  );
}

function IconButton({
  label,
  active,
  disabled,
  children,
  onClick,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`vehiclesPage__iconBtn${active ? " vehiclesPage__iconBtn--active" : ""}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function VehicleCard({
  vehicle,
  saved,
  compared,
  compareDisabled,
  onViewDetails,
  onToggleSaved,
  onToggleCompare,
  prioritizeImage,
}: {
  vehicle: Vehicle;
  saved: boolean;
  compared: boolean;
  compareDisabled: boolean;
  onViewDetails: () => void;
  onToggleSaved: () => void;
  onToggleCompare: () => void;
  prioritizeImage: boolean;
}) {
  const { play } = useSound();

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spotlight-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--spotlight-y", `${e.clientY - rect.top}px`);
  };

  return (
    <article
      className="vehiclesPage__card"
      onMouseEnter={() => play(vehiclePageSoundActions.cardHover)}
      onMouseMove={handleMouseMove}
    >
      <div className="vehiclesPage__cardImage">
        {vehicleDisplayImage(vehicle) ? (
          <img
            src={vehicleDisplayImage(vehicle)}
            alt={vehicle.primaryImageAlt || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
            loading={prioritizeImage ? "eager" : "lazy"}
            fetchPriority={prioritizeImage ? "high" : "low"}
            decoding="async"
          />
        ) : (
          <div className="vehiclesPage__cardImagePlaceholder">
            <span>{vehicle.make}</span>
          </div>
        )}
        {vehicle.isSpecial && (
          <span className="vehiclesPage__badge vehiclesPage__badge--special">
            Special
          </span>
        )}
        <span className={`vehiclesPage__badge vehiclesPage__badge--${vehicle.stockType.toLowerCase()} ${vehicle.isSpecial ? "vehiclesPage__badge--stockOffset" : ""}`}>
          {vehicle.stockType}
        </span>
      </div>

      <div className="vehiclesPage__cardBody">
        <p className="vehiclesPage__cardYear">{vehicle.year}</p>
        <h2 className="vehiclesPage__cardTitle">{vehicle.make} {vehicle.model}</h2>
        {vehicle.trim && <p className="vehiclesPage__cardTrim">{vehicle.trim}</p>}
      </div>

      <div className="vehiclesPage__cardMeta" aria-label="Vehicle details">
        <span className="vehiclesPage__cardStat">{formatMileage(vehicle.mileage)}</span>
        {vehicle.fuelType && <span className="vehiclesPage__cardStat">{vehicle.fuelType}</span>}
        {vehicle.drivetrain && <span className="vehiclesPage__cardStat">{vehicle.drivetrain}</span>}
      </div>

      <div className="vehiclesPage__cardFooter">
        <span className="vehiclesPage__cardPrice">{formatVehiclePrice(vehicle.price)}</span>
        {vehicle.sellerCity && (
          <span className="vehiclesPage__cardLocation">
            {vehicle.sellerCity}, {vehicle.sellerState}
          </span>
        )}
      </div>

      <div className="vehiclesPage__cardActions">
        <button
          type="button"
          className="vehiclesPage__detailsBtn"
          onClick={() => {
            play(vehiclePageSoundActions.cardOpen);
            onViewDetails();
          }}
        >
          View details
        </button>
        <IconButton
          label={saved ? "Remove saved vehicle" : "Save vehicle"}
          active={saved}
          onClick={() => {
            play(vehiclePageSoundActions.saveToggle);
            onToggleSaved();
          }}
        >
          <Heart size={16} fill={saved ? "currentColor" : "none"} />
        </IconButton>
        <IconButton
          label={compared ? "Remove from compare" : "Add to compare"}
          active={compared}
          disabled={compareDisabled}
          onClick={() => {
            play(vehiclePageSoundActions.compareToggle);
            onToggleCompare();
          }}
        >
          {compared ? <Check size={16} /> : <GitCompare size={16} />}
        </IconButton>
      </div>
    </article>
  );
}

function MarketplaceToolbar({
  filters,
  sort,
  activeCount,
  savedCount,
  makes,
  models,
  onFiltersChange,
  onSortChange,
  onOpenFilters,
}: {
  filters: VehicleFilters;
  sort: VehicleSort;
  activeCount: number;
  savedCount: number;
  makes: string[];
  models: string[];
  onFiltersChange: (patch: Partial<VehicleFilters>) => void;
  onSortChange: (sort: VehicleSort) => void;
  onOpenFilters: () => void;
}) {
  const { play } = useSound();

  return (
    <div className="vehiclesPage__toolbar" aria-label="Vehicle marketplace controls">
      <label className="vehiclesPage__search">
        <Search size={16} aria-hidden="true" />
        <span className="vehiclesPage__srOnly">Search vehicles</span>
        <input
          type="search"
          value={filters.query}
          placeholder="Search make, model, city..."
          onChange={(event) => onFiltersChange({ query: event.target.value })}
        />
        {filters.query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              play(vehiclePageSoundActions.searchClear);
              onFiltersChange({ query: "" });
            }}
          >
            <X size={14} />
          </button>
        )}
      </label>

      <label className="vehiclesPage__toolbarField">
        <span>Sort</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as VehicleSort)}>
          {VEHICLE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      <label className="vehiclesPage__toolbarField vehiclesPage__toolbarField--optional">
        <span>Make</span>
        <select
          value={filters.make}
          onChange={(event) => onFiltersChange({ make: event.target.value, model: "" })}
        >
          <option value="">All Makes</option>
          {makes.map((make) => <option key={make} value={make}>{make}</option>)}
        </select>
      </label>

      <label className="vehiclesPage__toolbarField vehiclesPage__toolbarField--optional">
        <span>Model</span>
        <select
          value={filters.model}
          disabled={!filters.make}
          onChange={(event) => onFiltersChange({ model: event.target.value })}
        >
          <option value="">All Models</option>
          {models.map((model) => <option key={model} value={model}>{model}</option>)}
        </select>
      </label>

      <button
        type="button"
        className="vehiclesPage__filterToggle"
        onClick={() => {
          play(vehiclePageSoundActions.filterOpen);
          onOpenFilters();
        }}
      >
        <SlidersHorizontal size={16} />
        Filters
        {activeCount > 0 && <span>{activeCount}</span>}
      </button>

      {savedCount > 0 && (
        <span className="vehiclesPage__savedCount">{savedCount} saved</span>
      )}
    </div>
  );
}

function PillButton({
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

function AdvancedFilters({
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

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  const { play } = useSound();
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <nav className="vehiclesPage__pagination" aria-label="Vehicle results pagination">
      <button
        className="vehiclesPage__pageBtn"
        disabled={page === 1}
        aria-label="Previous page"
        onClick={() => { play(vehiclePageSoundActions.filterChange); onPage(page - 1); }}
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="vehiclesPage__pageEllipsis">...</span>
        ) : (
          <button
            key={p}
            className={`vehiclesPage__pageBtn${page === p ? " vehiclesPage__pageBtn--active" : ""}`}
            aria-label={`Page ${p}`}
            aria-current={page === p ? "page" : undefined}
            onClick={() => { play(vehiclePageSoundActions.filterChange); onPage(p as number); }}
          >
            {p}
          </button>
        )
      )}
      <button
        className="vehiclesPage__pageBtn"
        disabled={page === totalPages}
        aria-label="Next page"
        onClick={() => { play(vehiclePageSoundActions.filterChange); onPage(page + 1); }}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

function CompareBar({
  vehicles,
  onOpen,
  onClear,
}: {
  vehicles: Vehicle[];
  onOpen: () => void;
  onClear: () => void;
}) {
  if (vehicles.length === 0) return null;

  return (
    <div className="vehiclesPage__compareBar" role="status">
      <span>{vehicles.length} selected for compare</span>
      <div>
        <button type="button" className="vehiclesPage__detailsBtn" onClick={onOpen}>
          Compare
        </button>
        <button type="button" className="vehiclesPage__clearBtn" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}

function CompareModal({
  open,
  vehicles,
  onClose,
}: {
  open: boolean;
  vehicles: Vehicle[];
  onClose: () => void;
}) {
  const dialogRef = useDialogKeyboard(open, onClose);
  if (!open) return null;

  return (
    <div className="vehiclesPage__drawerOverlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="vehiclesPage__compareModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-compare-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="vehiclesPage__drawerHeader">
          <div>
            <p className="vehiclesPage__eyebrowSmall">Compare</p>
            <h2 id="vehicle-compare-title">Selected vehicles</h2>
          </div>
          <button type="button" className="vehiclesPage__iconBtn" aria-label="Close compare" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="vehiclesPage__compareGrid">
          {vehicles.map((vehicle) => (
            <article key={vehicle.id} className="vehiclesPage__compareColumn">
              <img src={vehicleDisplayImage(vehicle)} alt={vehicle.primaryImageAlt || `${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
              <h3>{vehicle.year} {vehicle.make} {vehicle.model}</h3>
              <dl>
                <div><dt>Price</dt><dd>{formatVehiclePrice(vehicle.price)}</dd></div>
                <div><dt>Mileage</dt><dd>{formatMileage(vehicle.mileage)}</dd></div>
                <div><dt>Body</dt><dd>{vehicle.bodyStyle || "N/A"}</dd></div>
                <div><dt>Fuel</dt><dd>{vehicle.fuelType || "N/A"}</dd></div>
                <div><dt>Drive</dt><dd>{vehicle.drivetrain || "N/A"}</dd></div>
                <div><dt>Color</dt><dd>{vehicle.exteriorColor || "N/A"}</dd></div>
                <div><dt>Location</dt><dd>{vehicle.sellerCity ? `${vehicle.sellerCity}, ${vehicle.sellerState}` : "N/A"}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

type VehiclesPageProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
  onSelectVehicle: (vehicleId: string) => void;
};

export default function VehiclesPage({
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
  onSelectVehicle,
}: VehiclesPageProps) {
  const { play } = useSound();
  const { savedIds: savedVehicleIds, toggleSaved: togglePersistentSave } = useSavedVehicles();
  const { mode } = useDualMode();
  const isStandard = mode === "standard";
  const initialState = useMemo(() => readVehicleUrlState(), []);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleLookup, setVehicleLookup] = useState<Record<string, Vehicle>>({});
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [facets, setFacets] = useState<VehicleFacets>(EMPTY_VEHICLE_FACETS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [filters, setFilters] = useState<VehicleFilters>(initialState.filters);
  const [sort, setSort] = useState<VehicleSort>(initialState.sort);
  const [page, setPage] = useState(initialState.page);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compareVehicleIds, setCompareVehicleIds] = useState<string[]>(() => readStoredIds(COMPARE_STORAGE_KEY).slice(0, 3));
  const [compareOpen, setCompareOpen] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const restoredScrollRef = useRef(false);
  const inventoryTrackedRef = useRef(false);
  const analyticsFiltersInitializedRef = useRef(false);
  const [loadedQueryKey, setLoadedQueryKey] = useState("");
  const queryKey = useMemo(
    () => encodeVehicleUrlState(filters, sort, page),
    [filters, page, sort],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTotalCount(null);
    loadVehicleResults(filters, sort, page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setVehicles(result.vehicles);
        setVehicleLookup((current) => mergeVehicleLookup(current, result.vehicles));
        setLoadError(false);
        setLoadedQueryKey(queryKey);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Unable to load vehicle inventory", error);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, page, queryKey, sort]);

  useEffect(() => {
    if (loading || loadError || inventoryTrackedRef.current) return;
    inventoryTrackedRef.current = true;
    trackConversion("inventory_view");
  }, [loadError, loading]);

  useEffect(() => {
    if (!analyticsFiltersInitializedRef.current) {
      analyticsFiltersInitializedRef.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      const activeFilters = countActiveFilters(filters);
      if (filters.query.trim()) {
        trackConversion("search_performed", { metadata: { query_length: filters.query.trim().length, active_filter_count: activeFilters } });
      } else if (activeFilters > 0 || sort !== "recommended") {
        trackConversion("filter_applied", { metadata: { active_filter_count: activeFilters, sort } });
      }
    }, 450);
    return () => window.clearTimeout(timer);
  }, [filters, sort]);

  // Exact counts and filter values are useful, but neither should compete with
  // the first card response. Both start only after React has painted the list.
  useEffect(() => {
    if (loading || loadError || loadedQueryKey !== queryKey) return;
    let cancelled = false;
    const cancelAfterPaint = scheduleAfterPaint(() => {
      void loadVehicleCount(filters, sort).then(
        (count) => {
          if (!cancelled) setTotalCount(count);
        },
        () => undefined,
      );
      void loadVehicleFacets(filters.make, filters.sellerState).then(
        (next) => {
          if (!cancelled) setFacets(next);
        },
        () => undefined,
      );
    });
    return () => {
      cancelled = true;
      cancelAfterPaint();
    };
  }, [filters, loadedQueryKey, loadError, loading, queryKey, sort]);

  // Do not let the shared cinematic artwork begin its large image request in
  // the same commit as the first cards. Unlike metadata, it is purely visual,
  // so wait until a completed card frame is on screen. Once enabled, it stays
  // mounted through filters and pagination to avoid visual flicker.
  useEffect(() => {
    if (backgroundReady || (loading && !loadError)) return;
    return scheduleAfterPaint(() => setBackgroundReady(true));
  }, [backgroundReady, loadError, loading]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeVehicleUrlState(filters, sort, page);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [filters, page, sort]);

  const totalPages = totalCount === null ? Math.max(1, page) : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);
  const compareVehicles = useMemo(
    () => compareVehicleIds
      .map((id) => vehicleLookup[id])
      .filter((vehicle): vehicle is Vehicle => Boolean(vehicle)),
    [compareVehicleIds, vehicleLookup]
  );

  useVehiclesPageStateBridge({
    filtersOpen,
    compareOpen,
    compareCount: compareVehicleIds.length,
  });

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    writeStoredIds(COMPARE_STORAGE_KEY, compareVehicleIds);
  }, [compareVehicleIds]);

  useEffect(() => {
    if (loading || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const key = getScrollStorageKey(filters, sort, page);
    const stored = window.sessionStorage.getItem(key);
    if (!stored) return;
    const y = Number(stored);
    window.sessionStorage.removeItem(key);
    window.requestAnimationFrame(() => {
      if (Number.isFinite(y)) {
        document.querySelector(".vehiclesPage")?.scrollTo({ top: y, behavior: "auto" });
      } else {
        gridRef.current?.scrollIntoView({ behavior: "auto", block: "start" });
      }
    });
  }, [filters, loading, page, sort]);

  const handleFilterChange = (patch: Partial<VehicleFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
    restoredScrollRef.current = true;
  };

  const handleSortChange = (nextSort: VehicleSort) => {
    play(vehiclePageSoundActions.filterChange);
    setSort(nextSort);
    setPage(1);
    restoredScrollRef.current = true;
  };

  const handleClear = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handlePage = (p: number) => {
    setPage(p);
    restoredScrollRef.current = true;
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  useBotAction("filter_inventory", (action) => {
    setFilters(vehicleFiltersFromBotAction(action));
    setSort("recommended");
    setPage(1);
    setFiltersOpen(false);
    restoredScrollRef.current = true;
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const toggleSaved = (vehicleId: string) => {
    const wasSaved = savedVehicleIds.includes(vehicleId);
    void togglePersistentSave(vehicleId).then((changed) => {
      if (changed) trackConversion(wasSaved ? "vehicle_unsaved" : "vehicle_saved", { vehicleId });
    });
  };

  const toggleCompare = (vehicleId: string) => {
    setCompareVehicleIds((ids) => {
      if (ids.includes(vehicleId)) {
        trackConversion("compare_removed", { vehicleId });
        return ids.filter((id) => id !== vehicleId);
      }
      if (ids.length >= 3) return ids;
      trackConversion("compare_added", { vehicleId });
      return [...ids, vehicleId];
    });
  };

  const handleViewDetails = (vehicleId: string) => {
    const scroller = document.querySelector(".vehiclesPage");
    const key = getScrollStorageKey(filters, sort, page);
    window.sessionStorage.setItem(key, String(scroller?.scrollTop ?? 0));
    onSelectVehicle(vehicleId);
  };

  return (
    <CinematicShell loadBackground={backgroundReady || loadError}>
      <div className="vehiclesPage">
        <main className="vehiclesPage__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
          <div className="vehiclesPage__hero">
            <div className="vehiclesPage__lamp" aria-hidden="true" />
            <p className="vehiclesPage__eyebrow">Marketplace Concept</p>
            <h1 className="vehiclesPage__title">Vehicles</h1>
            <p className="vehiclesPage__subtitle">
              Browse a demo marketplace of new and used vehicles with search, filters, and comparison tools.
            </p>
          </div>

          {loadError ? (
            <div className="vehiclesPage__error">
              <p>Unable to load vehicle inventory. Please refresh to try again.</p>
            </div>
          ) : (
            <>
              <MarketplaceToolbar
                filters={filters}
                sort={sort}
                activeCount={activeCount}
                savedCount={savedVehicleIds.length}
                makes={facets.makes}
                models={facets.models}
                onFiltersChange={handleFilterChange}
                onSortChange={handleSortChange}
                onOpenFilters={() => setFiltersOpen(true)}
              />

              <DemoNotice />

              <div className="vehiclesPage__resultsBar" ref={gridRef}>
                {!loading && totalCount !== null && (
                  <span className="vehiclesPage__resultCount">
                    {totalCount} vehicle{totalCount !== 1 ? "s" : ""}
                    {activeCount > 0 ? " matching filters" : ""}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="vehiclesPage__loading">
                  <span>Loading vehicles...</span>
                </div>
              ) : totalCount === 0 ? (
                <div className="vehiclesPage__empty">
                  <p>No vehicles match your filters.</p>
                  <button type="button" className="vehiclesPage__clearBtn" onClick={handleClear}>
                    Clear all filters
                  </button>
                </div>
              ) : (
                <>
                  <motion.div
                    className="vehiclesPage__grid"
                    key={`${safePage}-${JSON.stringify(filters)}-${sort}`}
                    initial={{ opacity: 0, y: isStandard ? 0 : 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: isStandard ? 0.18 : 0.3 }}
                  >
                    {vehicles.map((vehicle, index) => {
                      const compared = compareVehicleIds.includes(vehicle.id);
                      return (
                        <VehicleCard
                          key={vehicle.id}
                          vehicle={vehicle}
                          saved={savedVehicleIds.includes(vehicle.id)}
                          compared={compared}
                          compareDisabled={!compared && compareVehicleIds.length >= 3}
                          onViewDetails={() => handleViewDetails(vehicle.id)}
                          onToggleSaved={() => toggleSaved(vehicle.id)}
                          onToggleCompare={() => toggleCompare(vehicle.id)}
                          prioritizeImage={index < 4}
                        />
                      );
                    })}
                  </motion.div>

                  {totalCount !== null && <Pagination page={safePage} totalPages={totalPages} onPage={handlePage} />}
                </>
              )}
            </>
          )}
        </main>

        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "products") onNavigateToProducts();
          else if (s === "showcase") onNavigateToShowcase();
          else if (s === "contact") onNavigateToContact();
        }} />

        <AdvancedFilters
          open={filtersOpen}
          facets={facets}
          filters={filters}
          activeCount={activeCount}
          onChange={handleFilterChange}
          onClear={handleClear}
          onClose={() => setFiltersOpen(false)}
        />

        <CompareBar
          vehicles={compareVehicles}
          onOpen={() => setCompareOpen(true)}
          onClear={() => setCompareVehicleIds([])}
        />

        <CompareModal
          open={compareOpen}
          vehicles={compareVehicles}
          onClose={() => setCompareOpen(false)}
        />
      </div>
    </CinematicShell>
  );
}
