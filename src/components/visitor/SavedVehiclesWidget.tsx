import { useSavedVehicles } from "@/lib/visitor/SavedVehiclesContext";
import type { VisitorSavedVehicle } from "@/lib/visitor/types";

export function SavedVehiclesWidget() {
  const { savedVehicles, status, error, toggleSaved, refresh } = useSavedVehicles();

  if (status === "loading") {
    return <section className="visitorSavedVehicles visitorSavedVehicles--state" aria-live="polite"><p>Loading saved vehicles…</p></section>;
  }
  if (status === "error" && savedVehicles.length === 0) {
    return (
      <section className="visitorSavedVehicles visitorSavedVehicles--state" aria-labelledby="saved-vehicles-error-title">
        <p className="visitorAccount__eyebrow">Saved vehicles</p>
        <h2 id="saved-vehicles-error-title">Saved vehicles unavailable</h2>
        <p className="visitorAccount__status visitorAccount__status--error" role="alert">{error}</p>
        <button className="visitorAccount__secondaryButton" type="button" onClick={() => void refresh()}>Try again</button>
      </section>
    );
  }
  return (
    <section className="visitorSavedVehicles" aria-labelledby="saved-vehicles-title">
      <div className="visitorSavedVehicles__heading">
        <div><p className="visitorAccount__eyebrow">Saved vehicles</p><h2 id="saved-vehicles-title">Your shortlist</h2></div>
        <span>{savedVehicles.length}</span>
      </div>
      {error ? <p className="visitorAccount__status visitorAccount__status--error" role="alert">{error}</p> : null}
      {savedVehicles.length === 0 ? (
        <p className="visitorLoyalty__empty">Save vehicles from the marketplace to keep them here.</p>
      ) : (
        <ul className="visitorSavedVehicles__list">
          {savedVehicles.slice(0, 50).map((vehicle) => <SavedVehicleCard key={vehicle.id} vehicle={vehicle} onRemove={toggleSaved} />)}
        </ul>
      )}
    </section>
  );
}

function SavedVehicleCard({ vehicle, onRemove }: { vehicle: VisitorSavedVehicle; onRemove: (vehicleId: string) => Promise<void> }) {
  const title = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ") || "Unavailable vehicle";
  const isAvailable = vehicle.status === "live";
  const content = (
    <>
      {vehicle.imageSrc ? <img src={vehicle.imageSrc} alt="" loading="lazy" /> : <div className="visitorSavedVehicles__imagePlaceholder" aria-hidden="true" />}
      <div><strong>{title}</strong><span>{isAvailable ? formatPrice(vehicle.price) : availabilityLabel(vehicle.status)}</span><time dateTime={vehicle.savedAt}>Saved {formatDate(vehicle.savedAt)}</time></div>
    </>
  );
  return (
    <li>
      {isAvailable ? <a href={`/vehicles/${vehicle.vehicleId}`}>{content}</a> : <div>{content}</div>}
      <button className="visitorAccount__secondaryButton" type="button" onClick={() => void onRemove(vehicle.vehicleId)}>Remove</button>
    </li>
  );
}

function availabilityLabel(status: VisitorSavedVehicle["status"]): string {
  return status === "sold" ? "Sold" : status === "archived" ? "Unavailable" : status === "draft" ? "Unavailable" : "Vehicle unavailable";
}

function formatPrice(price: number | null): string {
  return price === null ? "Price unavailable" : new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "recently" : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}
