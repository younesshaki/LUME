import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, GitCompare, Heart, Send, X } from "lucide-react";
import { mediaUrl } from "@/config/cdn";
import {
  formatVehiclePrice,
  getVehicleById,
  loadVehicles,
  type Vehicle,
} from "../vehicles/catalog";
import { useSound } from "../../lib/sound";
import CinematicShell from "./CinematicShell";
import "./VehicleDetailPage.css";

const lumeLogoImage = mediaUrl("LUMElogo.png");
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

function useDialogKeyboard(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const root = ref.current;
    root
      ?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      ?.focus();

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

function DetailFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="vehicleDetail__fact">
      <dt>{label}</dt>
      <dd>{value || "N/A"}</dd>
    </div>
  );
}

function InquiryModal({
  open,
  vehicle,
  onClose,
}: {
  open: boolean;
  vehicle: Vehicle;
  onClose: () => void;
}) {
  const { play } = useSound();
  const [submitted, setSubmitted] = useState(false);
  const dialogRef = useDialogKeyboard(open, onClose);

  useEffect(() => {
    if (open) setSubmitted(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    play("vehicle.inquiry.submit");
    setSubmitted(true);
  };

  return (
    <div className="vehicleDetail__modalOverlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="vehicleDetail__modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vehicle-inquiry-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="vehicleDetail__modalHeader">
          <div>
            <p className="vehicleDetail__eyebrow">Demo inquiry</p>
            <h2 id="vehicle-inquiry-title">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
          </div>
          <button type="button" className="vehicleDetail__iconBtn" aria-label="Close inquiry" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="vehicleDetail__success">
            <Check size={22} />
            <p>Inquiry saved for demo review.</p>
          </div>
        ) : (
          <form className="vehicleDetail__form" onSubmit={handleSubmit}>
            <label>
              <span>Name</span>
              <input name="name" required autoComplete="name" />
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" type="tel" autoComplete="tel" />
            </label>
            <label>
              <span>Message</span>
              <textarea
                name="message"
                rows={4}
                defaultValue={`I would like more information about the ${vehicle.year} ${vehicle.make} ${vehicle.model}.`}
              />
            </label>
            <button type="submit" className="vehicleDetail__primaryBtn">
              <Send size={16} />
              Submit demo inquiry
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

type VehicleDetailPageProps = {
  vehicleId: string | null;
  onBackToVehicles: () => void;
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
  onNavigateToContact: () => void;
};

export default function VehicleDetailPage({
  vehicleId,
  onBackToVehicles,
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
  onNavigateToContact,
}: VehicleDetailPageProps) {
  const { play } = useSound();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>(() => readStoredIds(SAVED_STORAGE_KEY));
  const [compareIds, setCompareIds] = useState<string[]>(() => readStoredIds(COMPARE_STORAGE_KEY).slice(0, 3));
  const vehicle = getVehicleById(vehicles, vehicleId);

  useEffect(() => {
    loadVehicles()
      .then((items) => {
        setVehicles(items);
        setLoadError(false);
      })
      .catch((error) => {
        console.error("Unable to load vehicle detail", error);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vehicle) return;
    const previous = document.title;
    document.title = `${vehicle.year} ${vehicle.make} ${vehicle.model} - LUME Marketplace`;
    return () => {
      document.title = previous || "LUME";
    };
  }, [vehicle]);

  useEffect(() => {
    writeStoredIds(SAVED_STORAGE_KEY, savedIds);
  }, [savedIds]);

  useEffect(() => {
    writeStoredIds(COMPARE_STORAGE_KEY, compareIds);
  }, [compareIds]);

  const toggleSaved = () => {
    if (!vehicleId) return;
    play("vehicle.save.toggle");
    setSavedIds((ids) =>
      ids.includes(vehicleId)
        ? ids.filter((id) => id !== vehicleId)
        : [...ids, vehicleId]
    );
  };

  const toggleCompare = () => {
    if (!vehicleId) return;
    play("vehicle.compare.toggle");
    setCompareIds((ids) => {
      if (ids.includes(vehicleId)) return ids.filter((id) => id !== vehicleId);
      if (ids.length >= 3) return ids;
      return [...ids, vehicleId];
    });
  };

  const saved = vehicleId ? savedIds.includes(vehicleId) : false;
  const compared = vehicleId ? compareIds.includes(vehicleId) : false;
  const compareDisabled = !compared && compareIds.length >= 3;

  return (
    <CinematicShell>
      <div className="vehicleDetail">
        <div className="vehicleDetail__floatingLogo" aria-hidden="true">
          <img src={lumeLogoImage} alt="" />
        </div>

        <header className="vehicleDetail__header">
          <nav className="vehicleDetail__nav" aria-label="Primary">
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onGoHome}>Home</button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToProducts}>Products</button>
            <button type="button" className="vehicleDetail__navActive" onMouseEnter={() => play("nav.hover")} onClick={onBackToVehicles}>Vehicles</button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToShowcase}>Showcase</button>
            <button type="button" onMouseEnter={() => play("nav.hover")} onClick={onNavigateToContact}>Contact</button>
          </nav>
        </header>

        <main className="vehicleDetail__main">
          {loadError ? (
            <div className="vehicleDetail__state">Unable to load vehicle details. Please refresh to try again.</div>
          ) : loading ? (
            <div className="vehicleDetail__state">Loading vehicle...</div>
          ) : !vehicle ? (
            <div className="vehicleDetail__state">
              <p>Vehicle not found.</p>
              <button type="button" className="vehicleDetail__secondaryBtn" onClick={onBackToVehicles}>
                Back to vehicles
              </button>
            </div>
          ) : (
            <>
              <button type="button" className="vehicleDetail__backLink" onClick={onBackToVehicles}>
                Back to results
              </button>

              <section className="vehicleDetail__layout">
                <div className="vehicleDetail__media">
                  <img src={vehicle.imageSrc} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
                  <span className={`vehicleDetail__badge vehicleDetail__badge--${vehicle.stockType.toLowerCase()}`}>
                    {vehicle.stockType}
                  </span>
                </div>

                <div className="vehicleDetail__panel">
                  <p className="vehicleDetail__eyebrow">Marketplace Concept</p>
                  <h1>{vehicle.year} {vehicle.make} {vehicle.model}</h1>
                  {vehicle.trim && <p className="vehicleDetail__trim">{vehicle.trim}</p>}
                  <p className="vehicleDetail__price">{formatVehiclePrice(vehicle.price)}</p>
                  <p className="vehicleDetail__notice">
                    Concept demo: price and imagery are representative until verified listing data is connected.
                  </p>

                  <div className="vehicleDetail__actions">
                    <button
                      type="button"
                      className="vehicleDetail__primaryBtn"
                      onClick={() => {
                        play("vehicle.inquiry.open");
                        setInquiryOpen(true);
                      }}
                    >
                      Request info
                    </button>
                    <button
                      type="button"
                      className={`vehicleDetail__iconBtn${saved ? " vehicleDetail__iconBtn--active" : ""}`}
                      aria-label={saved ? "Remove saved vehicle" : "Save vehicle"}
                      aria-pressed={saved}
                      onClick={toggleSaved}
                    >
                      <Heart size={17} fill={saved ? "currentColor" : "none"} />
                    </button>
                    <button
                      type="button"
                      className={`vehicleDetail__iconBtn${compared ? " vehicleDetail__iconBtn--active" : ""}`}
                      aria-label={compared ? "Remove from compare" : "Add to compare"}
                      aria-pressed={compared}
                      disabled={compareDisabled}
                      onClick={toggleCompare}
                    >
                      {compared ? <Check size={17} /> : <GitCompare size={17} />}
                    </button>
                  </div>

                  <dl className="vehicleDetail__facts">
                    <DetailFact label="Mileage" value={formatMileage(vehicle.mileage)} />
                    <DetailFact label="Body" value={vehicle.bodyStyle} />
                    <DetailFact label="Fuel" value={vehicle.fuelType} />
                    <DetailFact label="Drivetrain" value={vehicle.drivetrain} />
                    <DetailFact label="Exterior" value={vehicle.exteriorColor} />
                    <DetailFact label="Interior" value={vehicle.interiorColor} />
                    <DetailFact label="Location" value={vehicle.sellerCity ? `${vehicle.sellerCity}, ${vehicle.sellerState}` : "N/A"} />
                    <DetailFact label="Listing" value="Demo data" />
                  </dl>
                </div>
              </section>

              <InquiryModal
                open={inquiryOpen}
                vehicle={vehicle}
                onClose={() => setInquiryOpen(false)}
              />
            </>
          )}
        </main>
      </div>
    </CinematicShell>
  );
}
