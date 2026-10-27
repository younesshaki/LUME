import {
  CookieBanner as SharedBanner,
  type CookieConsent,
} from "@lume/blocks/react/CookieBanner";
import { useDualMode } from "@/lib/DualModeContext";
import {
  usePublicTenantName,
  houseOrTenantLabel,
} from "@/lib/usePublicTenantName";
import { reportConsentChoice } from "@/lib/consentReporting";
import "./CookieBanner.css";
export {
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_VERSION,
  OPEN_COOKIE_PREFERENCES_EVENT,
  openCookiePreferences,
  readCookieConsent,
  persistCookieConsent,
  resetCookieConsent,
  type CookieConsent,
} from "@lume/blocks/react/CookieBanner";
export function CookieBanner({
  onConsentChange,
}: {
  onConsentChange?: (choice: CookieConsent) => void;
}) {
  const { mode } = useDualMode();
  const tenantName = usePublicTenantName();
  return (
    <SharedBanner
      onConsentChange={onConsentChange}
      mode={mode}
      tenantName={houseOrTenantLabel("LUME", tenantName) || "This site"}
      reportChoice={reportConsentChoice}
    />
  );
}
