import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useDualMode } from "@/lib/DualModeContext";
import "./CookieBanner.css";

export const COOKIE_CONSENT_STORAGE_KEY = "lume-cookie-consent";
export type CookieConsent = "accepted" | "rejected";

export function CookieBanner({
  onConsentChange,
}: {
  onConsentChange?: (consent: CookieConsent) => void;
}) {
  const { mode } = useDualMode();
  const [consent, setConsent] = useState<CookieConsent | null | undefined>(undefined);

  useEffect(() => {
    setConsent(readCookieConsent());
  }, []);

  if (consent !== null) return null;

  const choose = (choice: CookieConsent) => {
    persistCookieConsent(choice);
    setConsent(choice);
    onConsentChange?.(choice);
  };

  return (
    <section
      className={`cookieBanner cookieBanner--${mode}`}
      role="dialog"
      aria-label="Cookie consent"
      aria-modal="false"
      tabIndex={0}
    >
      <button
        type="button"
        className="cookieBanner__dismiss"
        aria-label="Reject optional cookies and close"
        onClick={() => choose("rejected")}
      >
        <X size={16} aria-hidden="true" />
      </button>

      <div className="cookieBanner__copy">
        <p className="cookieBanner__eyebrow">Your privacy</p>
        <h2 className="cookieBanner__title">Choose your cookie preference</h2>
        <p className="cookieBanner__description">
          LUME uses essential storage to remember your experience. With permission, analytics
          help us understand how the site is used.
        </p>
      </div>

      <div className="cookieBanner__actions">
        <button
          type="button"
          className="cookieBanner__button cookieBanner__button--secondary"
          onClick={() => choose("rejected")}
        >
          Essential only
        </button>
        <button
          type="button"
          className="cookieBanner__button cookieBanner__button--primary"
          onClick={() => choose("accepted")}
        >
          Accept analytics
        </button>
      </div>
    </section>
  );
}

export function readCookieConsent(storage: Pick<Storage, "getItem"> | null = browserStorage()): CookieConsent | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return value === "accepted" || value === "rejected" ? value : null;
  } catch {
    return null;
  }
}

export function persistCookieConsent(
  consent: CookieConsent,
  storage: Pick<Storage, "setItem"> | null = browserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(COOKIE_CONSENT_STORAGE_KEY, consent);
  } catch {
    // Keep the in-memory choice working when storage is blocked or unavailable.
  }
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
