import { FormEvent, useEffect, useRef, useState } from "react";
import { Check, GitCompare, Heart, Loader2, Send, X } from "lucide-react";
import type { LeadSourceContext } from "@lume/types";
import {
  formatVehiclePrice,
  loadVehicleById,
  loadVehiclePriceSignal,
  type Vehicle,
  type VehicleGalleryImage,
  type VehiclePriceSignal,
} from "@/experience/vehicles/catalog";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { submitLead } from "@/lib/leads";
import { trackConversion } from "@/lib/conversionAnalytics";
import { useSavedVehicles } from "@/lib/visitor/SavedVehiclesContext";
import { useSound } from "@/lib/sound";
import { useConciergeTarget } from "@/lib/useConciergeTarget";
import { botLeadFormSourceContext } from "@/lib/botActionConsumers";
import VehicleGallery from "./VehicleGallery";
import { vehicleDetailSoundActions } from "./VehicleDetailPage.sounds";
import { MakeLogo } from "@/components/vehicles/MakeLogo";

/**
 * The shared vehicle-detail surface: gallery, title/price, action row, specs,
 * the optional dealer overview section, and the lead-capture modal — plus the
 * concierge `vehicle-inquiry` target and every conversion-tracking call.
 *
 * Both the hardcoded fallback page (VehicleDetailPage) and the page-builder
 * `vehicle-detail` block render through this, so the concierge integration
 * and tracking behave identically on either path. Section props let the
 * page-builder toggle pieces; the defaults reproduce the original hardcoded
 * page exactly.
 */

const COMPARE_STORAGE_KEY = "lume.vehicle-compare.v1";
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim();

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

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() ?? "",
    lastName: parts.join(" "),
  };
}

function InquiryModal({
  open,
  vehicle,
  botSourceContext,
  onClose,
}: {
  open: boolean;
  vehicle: Vehicle;
  botSourceContext: LeadSourceContext | null;
  onClose: () => void;
}) {
  const { play } = useSound();
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [started, setStarted] = useState(false);
  const dialogRef = useDialogKeyboard(open, onClose);

  useEffect(() => {
    if (!open) return;
    setSubmittedLeadId(null);
    setSubmitError(null);
    setSubmitting(false);
    setTurnstileToken(null);
    setStarted(false);
  }, [open, vehicle.id]);

  if (!open) return null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const { firstName, lastName } = splitName(name);

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await submitLead({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
        message: message || undefined,
        vehicleId: vehicle.id,
        source: botSourceContext ? "chat" : "contact-form",
        ...(turnstileToken ? { turnstileToken } : {}),
        sourceContext:
          botSourceContext ?? {
            trigger: "vehicle-inquiry",
            actionType: "request-info",
            ...(typeof window !== "undefined" ? { pagePath: window.location.pathname } : {}),
            vehicleTitle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          },
      });

      play(vehicleDetailSoundActions.inquirySubmit);
      setSubmittedLeadId(response.leadId);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We could not submit your inquiry. Please try again.",
      );
    } finally {
      setSubmitting(false);
      if (TURNSTILE_SITE_KEY) {
        setTurnstileToken(null);
        setTurnstileResetKey((key) => key + 1);
      }
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

        {submittedLeadId ? (
          <div className="vehicleDetail__success" role="status" aria-live="polite">
            <Check size={22} />
            <div>
              <p>Your inquiry was sent successfully.</p>
              <p className="vehicleDetail__formHint">The dealership can now follow up with you.</p>
            </div>
          </div>
        ) : (
          <form className="vehicleDetail__form" onSubmit={handleSubmit} onFocusCapture={() => {
            if (!started) { setStarted(true); trackConversion("inquiry_started", { vehicleId: vehicle.id }); }
          }}>
            <label>
              <span>Name</span>
              <input name="name" required autoComplete="name" disabled={submitting} />
            </label>
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
            {TURNSTILE_SITE_KEY ? (
              <TurnstileWidget
                key={turnstileResetKey}
                siteKey={TURNSTILE_SITE_KEY}
                onToken={setTurnstileToken}
              />
            ) : null}
            {submitError && (
              <p className="vehicleDetail__formError" role="alert">
                {submitError}
              </p>
            )}
            <button
              type="submit"
              className="vehicleDetail__primaryBtn"
              disabled={submitting || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
            >
              {submitting ? <Loader2 size={16} aria-hidden="true" /> : <Send size={16} />}
              {submitting ? "Sending inquiry…" : "Send inquiry"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export type VehicleDetailContentProps = {
  vehicleId: string | null;
  onBackToVehicles: () => void;
  /** Small line above the vehicle title. */
  eyebrow?: string;
  /** Optional dealer overview section — hidden while overviewText is empty. */
  overviewTitle?: string;
  overviewText?: string;
  showGallery?: boolean;
  showSpecs?: boolean;
  showActions?: boolean;
};

export default function VehicleDetailContent({
  vehicleId,
  onBackToVehicles,
  eyebrow = "Marketplace Concept",
  overviewTitle = "",
  overviewText = "",
  showGallery = true,
  showSpecs = true,
  showActions = true,
}: VehicleDetailContentProps) {
  const { play } = useSound();
  const { savedIds, toggleSaved, error: savedError } = useSavedVehicles();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [images, setImages] = useState<VehicleGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const [botInquiryContext, setBotInquiryContext] = useState<LeadSourceContext | null>(null);
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
    if (vehicle) trackConversion("vehicle_view", { vehicleId: vehicle.id });
  }, [vehicle]);

  useConciergeTarget("vehicle-inquiry", (action) => {
    setBotInquiryContext(
      botLeadFormSourceContext({
        vehicleId: action.params?.vehicleId ?? vehicleId ?? undefined,
        attribution: action.attribution,
      }),
    );
    if (vehicleId) trackConversion("inquiry_opened", { vehicleId });
    setInquiryOpen(true);
  });

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
    writeStoredIds(COMPARE_STORAGE_KEY, compareIds);
  }, [compareIds]);

  const handleToggleSaved = () => {
    if (!vehicleId) return;
    play(vehicleDetailSoundActions.saveToggle);
    const wasSaved = savedIds.includes(vehicleId);
    void toggleSaved(vehicleId).then((changed) => {
      if (changed) trackConversion(wasSaved ? "vehicle_unsaved" : "vehicle_saved", { vehicleId });
    });
  };

  const toggleCompare = () => {
    if (!vehicleId) return;
    play(vehicleDetailSoundActions.compareToggle);
    setCompareIds((ids) => {
      if (ids.includes(vehicleId)) {
        trackConversion("compare_removed", { vehicleId });
        return ids.filter((id) => id !== vehicleId);
      }
      if (ids.length >= 3) return ids;
      trackConversion("compare_added", { vehicleId });
      return [...ids, vehicleId];
    });
  };

  const saved = vehicleId ? savedIds.includes(vehicleId) : false;
  const compared = vehicleId ? compareIds.includes(vehicleId) : false;
  const compareDisabled = !compared && compareIds.length >= 3;

  if (loadError) {
    return (
      <div className="vehicleDetail__state">Unable to load vehicle details. Please refresh to try again.</div>
    );
  }
  if (loading) {
    return <div className="vehicleDetail__state">Loading vehicle...</div>;
  }
  if (!vehicle) {
    return (
      <div className="vehicleDetail__state">
        <p>Vehicle not found.</p>
        <button type="button" className="vehicleDetail__secondaryBtn" onClick={onBackToVehicles}>
          Back to vehicles
        </button>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="vehicleDetail__backLink" onClick={onBackToVehicles}>
        Back to results
      </button>

      <section className="vehicleDetail__layout">
        {showGallery ? (
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
        ) : null}

        <div className="vehicleDetail__panel">
          <p className="vehicleDetail__eyebrow">
            {/* Larger here than in list views: the detail page has room, and at
                32px the busier marks (Porsche crest, Land Rover oval) actually
                resolve instead of turning to mush. Decorative — the make is in
                the heading directly below. */}
            <MakeLogo make={vehicle.make} size={32} className="vehicleDetail__mark" />
            <span>{eyebrow}</span>
          </p>
          <h1>{vehicle.year} {vehicle.make} {vehicle.model}</h1>
          {vehicle.trim && <p className="vehicleDetail__trim">{vehicle.trim}</p>}
          <p className="vehicleDetail__price">{formatVehiclePrice(vehicle.price)}</p>
          {priceSignal?.enabled && priceSignal.reductions > 0 ? (
            <p className="vehicleDetail__priceSignal">
              Price reduced {priceSignal.reductions} {priceSignal.reductions === 1 ? "time" : "times"} in the last 30 days
            </p>
          ) : null}
          <p className="vehicleDetail__notice">
            Price and availability should be confirmed directly with the dealership.
          </p>

          {showActions ? (
            <div className="vehicleDetail__actions">
              <button
                type="button"
                className="vehicleDetail__primaryBtn"
                onClick={() => {
                  play(vehicleDetailSoundActions.inquiryOpen);
                  trackConversion("inquiry_opened", { vehicleId: vehicle.id });
                  setBotInquiryContext(null);
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
                onClick={handleToggleSaved}
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
          ) : null}
          {savedError ? <p className="vehicleDetail__saveError" role="alert">{savedError}</p> : null}

          {showSpecs ? (
            <dl className="vehicleDetail__facts">
              <DetailFact label="Mileage" value={formatMileage(vehicle.mileage)} />
              <DetailFact label="Body" value={vehicle.bodyStyle} />
              <DetailFact label="Fuel" value={vehicle.fuelType} />
              <DetailFact label="Drivetrain" value={vehicle.drivetrain} />
              <DetailFact label="Exterior" value={vehicle.exteriorColor} />
              <DetailFact label="Interior" value={vehicle.interiorColor} />
              <DetailFact label="Location" value={vehicle.sellerCity ? `${vehicle.sellerCity}, ${vehicle.sellerState}` : "N/A"} />
              <DetailFact label="Listing" value="Live inventory" />
            </dl>
          ) : null}
        </div>
      </section>

      {overviewText.trim() ? (
        <section className="vehicleDetail__overview">
          {overviewTitle.trim() ? <h2>{overviewTitle}</h2> : null}
          <p>{overviewText}</p>
        </section>
      ) : null}

      <InquiryModal
        open={inquiryOpen}
        vehicle={vehicle}
        botSourceContext={botInquiryContext}
        onClose={() => {
          setInquiryOpen(false);
          setBotInquiryContext(null);
        }}
      />
    </>
  );
}
