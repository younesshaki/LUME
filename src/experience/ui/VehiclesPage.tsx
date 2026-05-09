import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { mediaUrl } from "@/config/cdn";
import {
  loadVehicles,
  filterVehicles,
  getUniqueMakes,
  getModelsForMake,
  countActiveFilters,
  DEFAULT_FILTERS,
  BODY_STYLES,
  FUEL_TYPES,
  DRIVETRAINS,
  MILEAGE_OPTIONS,
  PRICE_OPTIONS,
  PRICE_MAX_OPTIONS,
  YEAR_MIN,
  YEAR_MAX,
  type Vehicle,
  type VehicleFilters,
} from "../vehicles/catalog";
import { useSound } from "../../lib/sound";
import CinematicShell from "./CinematicShell";
import "./VehiclesPage.css";

const lumeLogoImage = mediaUrl("LUMElogo.png");
const PAGE_SIZE = 24;

function formatMileage(miles: number | null): string {
  if (miles === null) return "N/A";
  if (miles === 0) return "New";
  return `${miles.toLocaleString()} mi`;
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { play } = useSound();

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spotlight-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--spotlight-y", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      className="vehiclesPage__card"
      onMouseEnter={() => play("product.card.hover")}
      onMouseMove={handleMouseMove}
      role="article"
    >
      <div className="vehiclesPage__cardImage">
        {vehicle.imageSrc ? (
          <img
            src={vehicle.imageSrc}
            alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
          />
        ) : (
          <div className="vehiclesPage__cardImagePlaceholder">
            <span>{vehicle.make}</span>
          </div>
        )}
        <span className={`vehiclesPage__badge vehiclesPage__badge--${vehicle.stockType.toLowerCase()}`}>
          {vehicle.stockType}
        </span>
      </div>

      <div className="vehiclesPage__cardBody">
        <p className="vehiclesPage__cardYear">{vehicle.year}</p>
        <p className="vehiclesPage__cardTitle">{vehicle.make} {vehicle.model}</p>
        {vehicle.trim && (
          <p className="vehiclesPage__cardTrim">{vehicle.trim}</p>
        )}
      </div>

      <div className="vehiclesPage__cardMeta">
        {vehicle.mileage !== null && (
          <span className="vehiclesPage__cardStat">{formatMileage(vehicle.mileage)}</span>
        )}
        {vehicle.fuelType && (
          <span className="vehiclesPage__cardStat">{vehicle.fuelType}</span>
        )}
        {vehicle.drivetrain && (
          <span className="vehiclesPage__cardStat">{vehicle.drivetrain}</span>
        )}
      </div>

      <div className="vehiclesPage__cardFooter">
        <span className="vehiclesPage__cardPrice">
          ${vehicle.price.toLocaleString()}
        </span>
        {vehicle.sellerCity && (
          <span className="vehiclesPage__cardLocation">
            {vehicle.sellerCity}, {vehicle.sellerState}
          </span>
        )}
      </div>
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
  const { play } = useSound();
  return (
    <button
      type="button"
      className={`vehiclesPage__pill${active ? " vehiclesPage__pill--active" : ""}`}
      onClick={() => { play("product.filter.click"); onClick(); }}
      onMouseEnter={() => play("navbar.tab.hover")}
    >
      {label}
    </button>
  );
}

type FilterPanelProps = {
  vehicles: Vehicle[];
  filters: VehicleFilters;
  activeCount: number;
  onChange: (patch: Partial<VehicleFilters>) => void;
  onClear: () => void;
};

function FilterPanel({ vehicles, filters, activeCount, onChange, onClear }: FilterPanelProps) {
  const { play } = useSound();
  const makes = useMemo(() => getUniqueMakes(vehicles), [vehicles]);
  const models = useMemo(
    () => (filters.make ? getModelsForMake(vehicles, filters.make) : []),
    [vehicles, filters.make]
  );

  const years = useMemo(() => {
    const ys: number[] = [];
    for (let y = YEAR_MIN; y <= YEAR_MAX; y++) ys.push(y);
    return ys;
  }, []);

  const handleMakeChange = (make: string) => {
    onChange({ make, model: "" });
  };

  return (
    <div className="vehiclesPage__filters">
      {/* Stock type */}
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

      {/* Make */}
      <div className="vehiclesPage__filterGroup">
        <span className="vehiclesPage__filterLabel">Make</span>
        <select
          className="vehiclesPage__select"
          value={filters.make}
          onChange={(e) => { play("product.filter.click"); handleMakeChange(e.target.value); }}
        >
          <option value="">All Makes</option>
          {makes.map((make) => (
            <option key={make} value={make}>{make}</option>
          ))}
        </select>
      </div>

      {/* Model */}
      <div className="vehiclesPage__filterGroup">
        <span className="vehiclesPage__filterLabel">Model</span>
        <select
          className="vehiclesPage__select"
          value={filters.model}
          disabled={!filters.make}
          onChange={(e) => { play("product.filter.click"); onChange({ model: e.target.value }); }}
        >
          <option value="">All Models</option>
          {models.map((model) => (
            <option key={model} value={model}>{model}</option>
          ))}
        </select>
      </div>

      {/* Year range */}
      <div className="vehiclesPage__filterGroup">
        <span className="vehiclesPage__filterLabel">Year</span>
        <div className="vehiclesPage__rangeRow">
          <select
            className="vehiclesPage__select vehiclesPage__select--sm"
            value={filters.yearMin}
            onChange={(e) => { play("product.filter.click"); onChange({ yearMin: Number(e.target.value) }); }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="vehiclesPage__rangeSep">–</span>
          <select
            className="vehiclesPage__select vehiclesPage__select--sm"
            value={filters.yearMax}
            onChange={(e) => { play("product.filter.click"); onChange({ yearMax: Number(e.target.value) }); }}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Body style */}
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

      {/* Fuel type */}
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

      {/* Drivetrain */}
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

      {/* Mileage */}
      <div className="vehiclesPage__filterGroup">
        <span className="vehiclesPage__filterLabel">Mileage</span>
        <select
          className="vehiclesPage__select"
          value={filters.mileageMax}
          onChange={(e) => { play("product.filter.click"); onChange({ mileageMax: Number(e.target.value) }); }}
        >
          {MILEAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Price */}
      <div className="vehiclesPage__filterGroup">
        <span className="vehiclesPage__filterLabel">Price</span>
        <div className="vehiclesPage__rangeRow">
          <select
            className="vehiclesPage__select vehiclesPage__select--sm vehiclesPage__select--gold"
            value={filters.priceMin}
            onChange={(e) => { play("product.filter.click"); onChange({ priceMin: Number(e.target.value) }); }}
          >
            {PRICE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span className="vehiclesPage__rangeSep">–</span>
          <select
            className="vehiclesPage__select vehiclesPage__select--sm vehiclesPage__select--gold"
            value={filters.priceMax}
            onChange={(e) => { play("product.filter.click"); onChange({ priceMax: Number(e.target.value) }); }}
          >
            {PRICE_MAX_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Clear */}
      {activeCount > 0 && (
        <div className="vehiclesPage__filterGroup vehiclesPage__filterGroup--clear">
          <button
            type="button"
            className="vehiclesPage__clearBtn"
            onClick={() => { play("button.ghost.click"); onClear(); }}
          >
            Clear filters
            <span className="vehiclesPage__clearCount">{activeCount}</span>
          </button>
        </div>
      )}
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
    <div className="vehiclesPage__pagination">
      <button
        className="vehiclesPage__pageBtn"
        disabled={page === 1}
        onClick={() => { play("product.filter.click"); onPage(page - 1); }}
      >
        ‹
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="vehiclesPage__pageEllipsis">…</span>
        ) : (
          <button
            key={p}
            className={`vehiclesPage__pageBtn${page === p ? " vehiclesPage__pageBtn--active" : ""}`}
            onClick={() => { play("product.filter.click"); onPage(p as number); }}
          >
            {p}
          </button>
        )
      )}
      <button
        className="vehiclesPage__pageBtn"
        disabled={page === totalPages}
        onClick={() => { play("product.filter.click"); onPage(page + 1); }}
      >
        ›
      </button>
    </div>
  );
}

type VehiclesPageProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

export default function VehiclesPage({
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
}: VehiclesPageProps) {
  const { play } = useSound();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<VehicleFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadVehicles().then((v) => {
      setVehicles(v);
      setLoading(false);
    });
  }, []);

  const filtered = useMemo(() => filterVehicles(vehicles, filters), [vehicles, filters]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  const handleFilterChange = (patch: Partial<VehicleFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const handleClear = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handlePage = (p: number) => {
    setPage(p);
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <CinematicShell>
      <div className="vehiclesPage">
        <div className="vehiclesPage__floatingLogo" aria-hidden="true">
          <img src={lumeLogoImage} alt="" />
        </div>

        <header className="vehiclesPage__header">
          <nav className="vehiclesPage__nav" aria-label="Primary">
            <button
              type="button"
              className="vehiclesPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onGoHome}
            >
              Home
            </button>
            <button
              type="button"
              className="vehiclesPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onNavigateToProducts}
            >
              Products
            </button>
            <span className="vehiclesPage__navActive">Vehicles</span>
            <button
              type="button"
              className="vehiclesPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onNavigateToShowcase}
            >
              Showcase
            </button>
            <button
              type="button"
              className="vehiclesPage__navLink"
              onMouseEnter={() => play("nav.hover")}
              onClick={onNavigateToContact}
            >
              Contact
            </button>
          </nav>
        </header>

        <main className="vehiclesPage__main">
          <div className="vehiclesPage__hero">
            <div className="vehiclesPage__lamp" aria-hidden="true" />
            <p className="vehiclesPage__eyebrow">Premium Inventory</p>
            <h1 className="vehiclesPage__title">Vehicles</h1>
            <p className="vehiclesPage__subtitle">
              An exclusive collection of premium and exotic vehicles, curated for the discerning few.
            </p>
          </div>

          <FilterPanel
            vehicles={vehicles}
            filters={filters}
            activeCount={activeCount}
            onChange={handleFilterChange}
            onClear={handleClear}
          />

          <div className="vehiclesPage__resultsBar" ref={gridRef}>
            {!loading && (
              <span className="vehiclesPage__resultCount">
                {filtered.length} vehicle{filtered.length !== 1 ? "s" : ""}
                {activeCount > 0 ? " matching filters" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <div className="vehiclesPage__loading">
              <span>Loading vehicles…</span>
            </div>
          ) : filtered.length === 0 ? (
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
                key={`${page}-${JSON.stringify(filters)}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {paginated.map((vehicle) => (
                  <VehicleCard key={vehicle.id} vehicle={vehicle} />
                ))}
              </motion.div>

              <Pagination page={page} totalPages={totalPages} onPage={handlePage} />
            </>
          )}
        </main>

        <footer className="vehiclesPage__footer">
          <img className="vehiclesPage__footerLogo" src={lumeLogoImage} alt="" />
          <div>
            <p>LUME</p>
            <span>Monaco — By invitation only.</span>
          </div>
        </footer>
      </div>
    </CinematicShell>
  );
}
