import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, GitCompare, Heart, Send, X } from "lucide-react";
import {
  formatVehiclePrice,
  loadVehicleById,
  loadVehiclePriceSignal,
  type Vehicle,
  type VehicleGalleryImage,
  type VehiclePriceSignal,
} from "@/experience/vehicles/catalog";
import { publicTenantSlug } from "@/lib/publicTenant";
import { useSound } from "@/lib/sound";
import CinematicShell from "../CinematicShell";
import { SiteFooter } from "@/components/layout/SiteFooter";
import VehicleGallery from "./VehicleGallery";
import { vehicleDetailSoundActions } from "./VehicleDetailPage.sounds";
import "./VehicleDetailPage.css";

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

type LeadApiResponse = { leadId?: string; error?: string };

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialogKeyboard(open, onClose);

  useEffect(() => {
    if (open) {
      setSubmitted(false);
      setSubmitting(false);
      setError(null);
    }
  }, [open, vehicle.id]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const location = window.location;
    const params = new URLSearchParams(location.search);

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/leads?tenant=${encodeURIComponent(publicTenantSlug)}`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Lume-Tenant": publicTenantSlug,
        },
        body: JSON.stringify({
          firstName,
          lastName,
          email: email || null,
          phone: phone || null,
          message: message || null,
          vehicleId: vehicle.id,
          source: "contact-form",
          utmSource: params.get("utm_source"),
          utmMedium: params.get("utm_medium"),
          utmCampaign: params.get("utm_campaign"),
          utmContent: params.get("utm_content"),
          referrer: document.referrer || null,
          sourceContext: {
            intent: "request-info",
            pagePath: `${location.pathname}${location.search}`,
            vehicleTitle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          },
        }),
      });

      let payload: LeadApiResponse = {};
      try {
        payload = (await response.json()) as LeadApiResponse;
      } catch {
        // Preserve a useful generic error when an upstream returns non-JSON.
      }

      if (!response.ok || !payload.leadId) {
        throw new Error(payload.error || "Unable to submit your inquiry. Please try again.");
      }

      play(vehicleDetailSoundActions.inquirySubmit);
      setSubmitted(true);
      form.reset();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to submit your inquiry. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
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
            <p className="vehicleDetail__eyebrow">Vehicle inquiry</p>
            <h2 id="vehicle-inquiry-title">{vehicle.year} {vehicle.make} {vehicle.model}</h2>
          </div>
          <button type="button" className="vehicleDetail__iconBtn" aria-label="Close inquiry" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {submitted ? (
          <div className="vehicleDetail__success" role="status" aria-live="polite">
            <Check size={22} />
            <p>Your inquiry was sent. The dealership can now follow up with you.</p>
          </div>
        ) : (
          <form className="vehicleDetail__form" onSubmit={handleSubmit}>
            <div className="vehicleDetail__formGrid">
              <label>
                <span>First name</span>
                <input name="firstName" required autoComplete="given-name" disabled={submitting} />
              </label>
              <label>
                <span>Last name</span>
                <input name="lastName" required autoComplete="family-name" disabled={submitting} />
              </label>
            </div>
            <label>
              <span>Email</span>
              <input name="email" type="email" required autoComplete="email" disabled={submitting} />
            </label>
            <label>
              <span>Phone</span>
              <input name="phone" type="tel" autoComplete="tel" disabled={submitting} />
            </label>
            <label>
              <span>Message</span>
              <textarea
                name="message"
                rows={4}
                disabled={submitting}
                defaultValue={`I would like more information about the ${vehicle.year} ${vehicle.make} ${vehicle.model}.`}
              />
            </label>
            {error && (
              <p className="vehicleDetail__formError" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="vehicleDetail__primaryBtn" disabled={submitting}>
              <Send size={16} />
              {submitting ? "Sending…" : "Send inquiry"}
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
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [images, setImages] = useState<VehicleGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>(() => readStoredIds(SAVED_STORAGE_KEY));
  const [compareIds, setCompareIds] = useState<string[]>(() => readStoredIds(COMPARE_STORAGE_KEY).slice(0, 3));
  const [loadedPriceSignal, setLoadedPriceSignal] = useState<{
    vehicleId: string;
    signal: VehiclePriceSignal | null;
  } | null>(null);
  const priceSignal = loadedPriceSignal?.vehicleId === vehicleId
    ? loadedPriceSignal.signal
    : null;

  useEffect(() => {
    if (!vehicleId) {
      setVehicle(null);
      setImages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadVehicleById(vehicleId)
      .then((detail) => {
        if (cancelled) return;
        setVehicle(detail?.vehicle ?? null);
        setImages(detail?.images ?? []);
        setLoadError(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Unable to load vehicle detail", error);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  useEffect(() => {
    if (!vehicleId) return;
    let cancelled = false;
    void loadVehiclePriceSignal(vehicleId).then((signal) => {
      if (!cancelled) setLoadedPriceSignal({ vehicleId, signal });
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

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
    play(vehicleDetailSoundActions.saveToggle);
    setSavedIds((ids) =>
      ids.includes(vehicleId)
        ? ids.filter((id) => id !== vehicleId)
        : [...ids, vehicleId]
    );
  };

  const toggleCompare = () => {
    if (!vehicleId) return;
    play(vehicleDetailSoundActions.compareToggle);
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
        <main className="vehicleDetail__main" style={{ paddingTop: "72px", paddingBottom: "160px" }}>
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
                  <VehicleGallery
                    images={images}
                    title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                    badge={
                      vehicle.stockType ? (
                        <span
                          className={`vehicleDetail__badge vehicleDetail__badge--${vehicle.stockType.toLowerCase()}`}
                        >
                          {vehicle.stockType}
                        </span>
                      ) : null
                    }
                  />
                </div>

                <div className="vehicleDetail__panel">
                  <p className="vehicleDetail__eyebrow">Marketplace Concept</p>
                  <h1>{vehicle.year} {vehicle.make} {vehicle.model}</h1>
                  {vehicle.trim && <p className="vehicleDetail__trim">{vehicle.trim}</p>}
                  <p className="vehicleDetail__price">{formatVehiclePrice(vehicle.price)}</p>
                  {priceSignal?.enabled && priceSignal.reductions > 0 ? (
                    <p className="vehicleDetail__priceSignal">
                      Price reduced {priceSignal.reductions} {priceSignal.reductions === 1 ? "time" : "times"} in the last 30 days
                    </p>
                  ) : null}
                  <p className="vehicleDetail__notice">
                    Concept demo: price and imagery are representative until verified listing data is connected.
                  </p>

                  <div className="vehicleDetail__actions">
                    <button
                      type="button"
                      className="vehicleDetail__primaryBtn"
                      onClick={() => {
                        play(vehicleDetailSoundActions.inquiryOpen);
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
        <SiteFooter onNavigate={(s) => {
          if (s === "home") onGoHome();
          else if (s === "products") onNavigateToProducts();
          else if (s === "vehicles") onBackToVehicles();
          else if (s === "showcase") onNavigateToShowcase();
          else if (s === "contact") onNavigateToContact();
        }} />
      </div>
    </CinematicShell>
  );
}
