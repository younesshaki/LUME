import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Heart,
  Search,
  X,
} from "lucide-react";
import {
  DEFAULT_FILTERS,
  VEHICLE_SORT_OPTIONS,
  countActiveFilters,
  filterVehicles,
  formatVehiclePrice,
  getModelsForMake,
  getUniqueMakes,
  loadVehicles,
  sortVehicles,
  vehicleDisplayImage,
  type Vehicle,
  type VehicleFilters,
  type VehicleSort,
} from "@/experience/vehicles/catalog";
import {
  consumePendingInventoryFilter,
  vehicleFiltersFromBotAction,
} from "@/lib/botActionConsumers";
import { useBotAction } from "@/lib/useBotAction";
import { useSound } from "@/lib/sound";
import { vehiclePageSoundActions } from "@/experience/ui/VehiclesPage/VehiclesPage.sounds";
import type { BlockComponentProps } from "../registry";
import { usePageBuilderRenderContext } from "../renderContext";
import { booleanProp, stringProp } from "./props";
import "@/experience/ui/VehiclesPage/VehiclesPage.css";

const PAGE_SIZE = 24;
const SAVED_STORAGE_KEY = "lume.vehicle-saved.v1";
const COMPARE_STORAGE_KEY = "lume.vehicle-compare.v1";

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
}: {
  vehicle: Vehicle;
  saved: boolean;
  compared: boolean;
  compareDisabled: boolean;
  onViewDetails: () => void;
  onToggleSaved: () => void;
  onToggleCompare: () => void;
}) {
  const { play } = useSound();

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
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

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  const { play } = useSound();
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  for (let index = 1; index <= totalPages; index += 1) {
    if (index === 1 || index === totalPages || (index >= page - 2 && index <= page + 2)) {
      pages.push(index);
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
        onClick={() => {
          play(vehiclePageSoundActions.filterChange);
          onPage(page - 1);
        }}
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((item, index) =>
        item === "..." ? (
          <span key={`ellipsis-${index}`} className="vehiclesPage__pageEllipsis">...</span>
        ) : (
          <button
            key={item}
            className={`vehiclesPage__pageBtn${page === item ? " vehiclesPage__pageBtn--active" : ""}`}
            aria-label={`Page ${item}`}
            aria-current={page === item ? "page" : undefined}
            onClick={() => {
              play(vehiclePageSoundActions.filterChange);
              onPage(item);
            }}
          >
            {item}
          </button>
        )
      )}
      <button
        className="vehiclesPage__pageBtn"
        disabled={page === totalPages}
        aria-label="Next page"
        onClick={() => {
          play(vehiclePageSoundActions.filterChange);
          onPage(page + 1);
        }}
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

export function VehicleInventory({ block, mode }: BlockComponentProps) {
  const { onSelectVehicle } = usePageBuilderRenderContext();
  const { play } = useSound();
  const isStandard = mode === "standard";
  const title = stringProp(block, "title");
  const showFilters = booleanProp(block, "showFilters", true);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filters, setFilters] = useState<VehicleFilters>(
    () => consumePendingInventoryFilter() ?? DEFAULT_FILTERS
  );
  const [sort, setSort] = useState<VehicleSort>("recommended");
  const [page, setPage] = useState(1);
  const [savedVehicleIds, setSavedVehicleIds] = useState<string[]>(() =>
    readStoredIds(SAVED_STORAGE_KEY)
  );
  const [compareVehicleIds, setCompareVehicleIds] = useState<string[]>(() =>
    readStoredIds(COMPARE_STORAGE_KEY).slice(0, 3)
  );
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadVehicles()
      .then((loadedVehicles) => {
        setVehicles(loadedVehicles);
        setLoadError(false);
      })
      .catch((error) => {
        console.error("Unable to load vehicle inventory", error);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    writeStoredIds(SAVED_STORAGE_KEY, savedVehicleIds);
  }, [savedVehicleIds]);

  useEffect(() => {
    writeStoredIds(COMPARE_STORAGE_KEY, compareVehicleIds);
  }, [compareVehicleIds]);

  const makes = useMemo(() => getUniqueMakes(vehicles), [vehicles]);
  const models = useMemo(
    () => (filters.make ? getModelsForMake(vehicles, filters.make) : []),
    [filters.make, vehicles]
  );
  const filtered = useMemo(() => filterVehicles(vehicles, filters), [filters, vehicles]);
  const sorted = useMemo(() => sortVehicles(filtered, sort), [filtered, sort]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handleFilterChange = (patch: Partial<VehicleFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  useBotAction("filter_inventory", (action) => {
    setFilters(vehicleFiltersFromBotAction(action));
    setSort("recommended");
    setPage(1);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const handleViewDetails = (vehicleId: string) => {
    if (onSelectVehicle) {
      onSelectVehicle(vehicleId);
      return;
    }
    console.warn(`[pageBuilder] vehicle selected without route handler: ${vehicleId}`);
  };

  const toggleSaved = (vehicleId: string) => {
    setSavedVehicleIds((ids) =>
      ids.includes(vehicleId)
        ? ids.filter((id) => id !== vehicleId)
        : [...ids, vehicleId]
    );
  };

  const toggleCompare = (vehicleId: string) => {
    setCompareVehicleIds((ids) => {
      if (ids.includes(vehicleId)) return ids.filter((id) => id !== vehicleId);
      if (ids.length >= 3) return ids;
      return [...ids, vehicleId];
    });
  };

  return (
    <section>
      {title && (
        <div className="vehiclesPage__hero">
          <div className="vehiclesPage__lamp" aria-hidden="true" />
          <h2 className="vehiclesPage__title">{title}</h2>
        </div>
      )}

      {loadError ? (
        <div className="vehiclesPage__error">
          <p>Unable to load vehicle inventory. Please refresh to try again.</p>
        </div>
      ) : (
        <>
          {showFilters && (
            <div className="vehiclesPage__toolbar" aria-label="Vehicle marketplace controls">
              <label className="vehiclesPage__search">
                <Search size={16} aria-hidden="true" />
                <span className="vehiclesPage__srOnly">Search vehicles</span>
                <input
                  type="search"
                  value={filters.query}
                  placeholder="Search make, model, city..."
                  onChange={(event) => handleFilterChange({ query: event.target.value })}
                />
                {filters.query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => {
                      play(vehiclePageSoundActions.searchClear);
                      handleFilterChange({ query: "" });
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>

              <label className="vehiclesPage__toolbarField">
                <span>Sort</span>
                <select
                  value={sort}
                  onChange={(event) => {
                    play(vehiclePageSoundActions.filterChange);
                    setSort(event.target.value as VehicleSort);
                    setPage(1);
                  }}
                >
                  {VEHICLE_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="vehiclesPage__toolbarField vehiclesPage__toolbarField--optional">
                <span>Make</span>
                <select
                  value={filters.make}
                  onChange={(event) => handleFilterChange({ make: event.target.value, model: "" })}
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
                  onChange={(event) => handleFilterChange({ model: event.target.value })}
                >
                  <option value="">All Models</option>
                  {models.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              </label>

              <span className="vehiclesPage__savedCount">
                {activeCount > 0 ? `${activeCount} active` : `${savedVehicleIds.length} saved`}
              </span>
            </div>
          )}

          <p className="vehiclesPage__demoNotice">
            Concept demo: prices and imagery are representative until verified listing data is connected.
          </p>

          <div className="vehiclesPage__resultsBar" ref={gridRef}>
            {!loading && (
              <span className="vehiclesPage__resultCount">
                {sorted.length} vehicle{sorted.length !== 1 ? "s" : ""}
                {activeCount > 0 ? " matching filters" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <div className="vehiclesPage__loading">
              <span>Loading vehicles...</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="vehiclesPage__empty">
              <p>No vehicles match your filters.</p>
              <button
                type="button"
                className="vehiclesPage__clearBtn"
                onClick={() => {
                  setFilters(DEFAULT_FILTERS);
                  setPage(1);
                }}
              >
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
                {paginated.map((vehicle) => {
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
                    />
                  );
                })}
              </motion.div>

              <Pagination
                page={safePage}
                totalPages={totalPages}
                onPage={(nextPage) => {
                  setPage(nextPage);
                  gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
