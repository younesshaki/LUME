import { TurnstileWidget } from "@/components/TurnstileWidget";
import "../../experience/ui/VehicleDetailPage/VehicleInquiry.css";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

export function isTurnstileConfigured(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

/**
 * Vehicle-inquiry adapter around the shared public Turnstile widget. Keeping a
 * single script loader and Window declaration prevents the contact and vehicle
 * forms from drifting or registering incompatible browser API types.
 */
export function TurnstileField({
  onTokenChange,
}: {
  onTokenChange: (token: string | null) => void;
}) {
  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <div className="vehicleDetail__turnstile">
      <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={onTokenChange} />
    </div>
  );
}
