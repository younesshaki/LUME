import {
  CSSProperties,
  MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Heart,
  X,
} from "lucide-react";
import {
  DEFAULT_FILTERS,
  activeFilterChips,
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
import { vehicleFiltersFromBotAction } from "@/lib/botActionConsumers";
import { readVehicleUrlState } from "@/experience/vehicles/urlState";
import { useBotAction } from "@/lib/useBotAction";
import { useSound } from "@/lib/sound";
import { useOptionalSavedVehicles } from "@/lib/visitor/SavedVehiclesContext";
import { trackConversion } from "@/lib/conversionAnalytics";
import { vehiclePageSoundActions } from "@/experience/ui/VehiclesPage/VehiclesPage.sounds";
import {
  AdvancedFilters,
  MarketplaceToolbar,
} from "@/experience/ui/VehiclesPage/VehicleFilters";
import type { BlockComponentProps } from "../registry";
import { usePageBuilderRenderContext } from "../renderContext";
import { booleanProp, stringProp } from "./props";
import "@/experience/ui/VehiclesPage/VehiclesPage.css";

const PAGE_SIZE = 24;
const SAVED_STORAGE_KEY = "lume.vehicle-saved.v1";
const COMPARE_STORAGE_KEY = "lume.vehicle-compare.v1";
const EMPTY_VEHICLE_FACETS: VehicleFacets = {
  makes: [],
  models: [],
  states: [],
  cities: [],
};

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

function formatMileage(miles: number | null): string {
  if (miles === null) return "N/A";
  if (miles === 0) return "New";
  return `${miles.toLocaleString()} mi`;
}

function readStoredIds(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id) => typeof id === "string")
      : [];
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

// Every 5th tile (0-indexed: 4, 9, 14, ...) is the Bento layout's larger
// "featured" tile — periodic rather than fixed indices so the effect reads
// consistently regardless of how many vehicles the current page/filter has.
const BENTO_FEATURED_INTERVAL = 5;

function VehicleCard({
  vehicle,
  index,
  saved,
  compared,
  compareDisabled,
  cardStyle,
  cardColor,
  onViewDetails,
  onToggleSaved,
  onToggleCompare,
}: {
  vehicle: Vehicle;
  index: number;
  saved: boolean;
  compared: boolean;
  compareDisabled: boolean;
  cardStyle: "classic" | "notch" | "bento";
  cardColor: string;
  onViewDetails: () => void;
  onToggleSaved: () => void;
  onToggleCompare: () => void;
}) {
  const { play } = useSound();
  const isBentoFeatured =
    cardStyle === "bento" &&
    index % BENTO_FEATURED_INTERVAL === BENTO_FEATURED_INTERVAL - 1;

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--spotlight-x",
      `${event.clientX - rect.left}px`,
    );
    event.currentTarget.style.setProperty(
      "--spotlight-y",
      `${event.clientY - rect.top}px`,
    );
  };

  return (
    <article
      className={[
        "vehiclesPage__card",
        cardStyle === "notch" && "vehiclesPage__card--notch",
        cardStyle === "bento" && "vehiclesPage__card--bento",
        isBentoFeatured && "vehiclesPage__card--bento-featured",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        cardStyle === "notch" || cardStyle === "bento"
          ? ({ "--vehicle-card-accent": cardColor } as CSSProperties &
              Record<"--vehicle-card-accent", string>)
          : undefined
      }
      onMouseEnter={() => play(vehiclePageSoundActions.cardHover)}
      onMouseMove={handleMouseMove}
    >
      <div className="vehiclesPage__cardImage">
        {vehicleDisplayImage(vehicle) ? (
          <img
            src={vehicleDisplayImage(vehicle)}
            alt={
              vehicle.primaryImageAlt ||
              `${vehicle.year} ${vehicle.make} ${vehicle.model}`
            }
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
        <span
          className={`vehiclesPage__badge vehiclesPage__badge--${vehicle.stockType.toLowerCase()} ${vehicle.isSpecial ? "vehiclesPage__badge--stockOffset" : ""}`}
        >
          {vehicle.stockType}
        </span>
      </div>

      <div className="vehiclesPage__cardBody">
        <p className="vehiclesPage__cardYear">{vehicle.year}</p>
        <h2 className="vehiclesPage__cardTitle">
          {vehicle.make} {vehicle.model}
        </h2>
        {vehicle.trim && (
          <p className="vehiclesPage__cardTrim">{vehicle.trim}</p>
        )}
      </div>

      <div className="vehiclesPage__cardMeta" aria-label="Vehicle details">
        <span className="vehiclesPage__cardStat">
          {formatMileage(vehicle.mileage)}
        </span>
        {vehicle.fuelType && (
          <span className="vehiclesPage__cardStat">{vehicle.fuelType}</span>
        )}
        {vehicle.drivetrain && (
          <span className="vehiclesPage__cardStat">{vehicle.drivetrain}</span>
        )}
      </div>

      <div className="vehiclesPage__cardFooter">
        <span className="vehiclesPage__cardPrice">
          {formatVehiclePrice(vehicle.price)}
        </span>
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
    if (
      index === 1 ||
      index === totalPages ||
      (index >= page - 2 && index <= page + 2)
    ) {
      pages.push(index);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <nav
      className="vehiclesPage__pagination"
      aria-label="Vehicle results pagination"
    >
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
          <span
            key={`ellipsis-${index}`}
            className="vehiclesPage__pageEllipsis"
          >
            ...
          </span>
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
        ),
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
  const visitorSaves = useOptionalSavedVehicles();
  const isStandard = mode === "standard";
  const title = stringProp(block, "title");
  const showFilters = booleanProp(block, "showFilters", true);
  const rawCardStyle = stringProp(block, "cardStyle", "classic");
  const cardStyle =
    rawCardStyle === "notch" || rawCardStyle === "bento"
      ? rawCardStyle
      : "classic";
  const rawCardColor = stringProp(block, "cardColor", "#B68A35");
  const cardColor = /^#[0-9a-fA-F]{6}$/.test(rawCardColor)
    ? rawCardColor
    : "#B68A35";
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [facets, setFacets] = useState<VehicleFacets>(EMPTY_VEHICLE_FACETS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const initialState = useMemo(() => readVehicleUrlState(), []);
  const [filters, setFilters] = useState<VehicleFilters>(initialState.filters);
  const [sort, setSort] = useState<VehicleSort>(initialState.sort);
  const [page, setPage] = useState(initialState.page);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [previewSavedVehicleIds, setPreviewSavedVehicleIds] = useState<
    string[]
  >(() => readStoredIds(SAVED_STORAGE_KEY));
  const [compareVehicleIds, setCompareVehicleIds] = useState<string[]>(() =>
    readStoredIds(COMPARE_STORAGE_KEY).slice(0, 3),
  );
  const gridRef = useRef<HTMLDivElement>(null);
  const queryKey = useMemo(
    () => JSON.stringify({ filters, sort, page }),
    [filters, page, sort],
  );
  const [loadedQueryKey, setLoadedQueryKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setTotalCount(null);
    loadVehicleResults(filters, sort, page, PAGE_SIZE)
      .then((result) => {
        if (cancelled) return;
        setVehicles(result.vehicles);
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

  // Page-builder previews use the same bounded API path as the public
  // marketplace. Counts and filter options are secondary metadata, so defer
  // them until the visible card page has painted instead of loading a complete
  // catalog to derive them in the browser.
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

  useEffect(() => {
    // The page-preview iframe has no visitor session provider. Keep its
    // existing local-only interaction, but never let it overwrite the public
    // visitor queue once the authoritative provider is available.
    if (!visitorSaves)
      writeStoredIds(SAVED_STORAGE_KEY, previewSavedVehicleIds);
  }, [previewSavedVehicleIds, visitorSaves]);

  useEffect(() => {
    writeStoredIds(COMPARE_STORAGE_KEY, compareVehicleIds);
  }, [compareVehicleIds]);

  const totalPages =
    totalCount === null
      ? Math.max(1, page)
      : Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);
  const filterChips = useMemo(() => activeFilterChips(filters), [filters]);

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
    console.warn(
      `[pageBuilder] vehicle selected without route handler: ${vehicleId}`,
    );
  };

  const savedVehicleIds = visitorSaves?.savedIds ?? previewSavedVehicleIds;

  const toggleSaved = (vehicleId: string) => {
    if (visitorSaves) {
      const wasSaved = visitorSaves.savedIds.includes(vehicleId);
      void visitorSaves.toggleSaved(vehicleId).then((changed) => {
        if (changed)
          trackConversion(wasSaved ? "vehicle_unsaved" : "vehicle_saved", {
            vehicleId,
          });
      });
      return;
    }
    setPreviewSavedVehicleIds((ids) =>
      ids.includes(vehicleId)
        ? ids.filter((id) => id !== vehicleId)
        : [...ids, vehicleId],
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
          {showFilters ? (
            <MarketplaceToolbar
              filters={filters}
              sort={sort}
              activeCount={activeCount}
              savedCount={savedVehicleIds.length}
              makes={facets.makes}
              models={facets.models}
              onFiltersChange={handleFilterChange}
              onSortChange={(nextSort) => {
                play(vehiclePageSoundActions.filterChange);
                setSort(nextSort);
                setPage(1);
              }}
              onOpenFilters={() => setFiltersOpen(true)}
            />
          ) : null}

          {showFilters && filterChips.length > 0 && (
            <div
              className="vehiclesPage__activeFilters"
              aria-label="Active filters"
            >
              {filterChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  className="vehiclesPage__activeFilterChip"
                  onClick={() => {
                    play(vehiclePageSoundActions.filterChange);
                    handleFilterChange(chip.clear);
                  }}
                >
                  <span>{chip.label}</span>
                  <X size={12} aria-hidden="true" />
                  <span className="vehiclesPage__srOnly">
                    Remove filter: {chip.label}
                  </span>
                </button>
              ))}
              {filterChips.length > 1 && (
                <button
                  type="button"
                  className="vehiclesPage__activeFiltersClearAll"
                  onClick={() => {
                    setFilters(DEFAULT_FILTERS);
                    setPage(1);
                  }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}

          <p className="vehiclesPage__demoNotice">
            Concept demo: prices and imagery are representative until verified
            listing data is connected.
          </p>

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
          ) : vehicles.length === 0 ? (
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
                className={`vehiclesPage__grid${cardStyle === "bento" ? " vehiclesPage__grid--bento" : ""}`}
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
                      index={index}
                      saved={savedVehicleIds.includes(vehicle.id)}
                      compared={compared}
                      compareDisabled={
                        !compared && compareVehicleIds.length >= 3
                      }
                      cardStyle={cardStyle}
                      cardColor={cardColor}
                      onViewDetails={() => handleViewDetails(vehicle.id)}
                      onToggleSaved={() => toggleSaved(vehicle.id)}
                      onToggleCompare={() => toggleCompare(vehicle.id)}
                    />
                  );
                })}
              </motion.div>

              {totalCount !== null && (
                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  onPage={(nextPage) => {
                    setPage(nextPage);
                    gridRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                />
              )}
            </>
          )}
        </>
      )}
      {showFilters ? (
        <AdvancedFilters
          open={filtersOpen}
          facets={facets}
          filters={filters}
          activeCount={activeCount}
          onChange={handleFilterChange}
          onClear={() => {
            setFilters(DEFAULT_FILTERS);
            setPage(1);
          }}
          onClose={() => setFiltersOpen(false)}
        />
      ) : null}
    </section>
  );
}
