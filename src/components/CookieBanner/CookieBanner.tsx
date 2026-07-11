import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useDualMode } from "@/lib/DualModeContext";
import { reportConsentChoice } from "@/lib/consentReporting";
import "./CookieBanner.css";

export const COOKIE_CONSENT_STORAGE_KEY = "lume-cookie-consent";
export type CookieConsent = "accepted" | "rejected";

/**
 * Bump when the cookie policy materially changes (SCRUM-200): stored choices
 * from older versions read as null, so returning visitors are re-prompted.
 */
export const COOKIE_CONSENT_VERSION = 1;

/** Window event that re-opens the banner (e.g. a "Cookie preferences" link). */
export const OPEN_COOKIE_PREFERENCES_EVENT = "lume:open-cookie-preferences";

export function openCookiePreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
}

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reopen = () => setConsent(null);
    window.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, reopen);
  }, []);

  if (consent !== null) return null;

  const choose = (choice: CookieConsent) => {
    persistCookieConsent(choice);
    setConsent(choice);
    onConsentChange?.(choice);
    // Anonymous, fire-and-forget compliance ledger write (SCRUM-200).
    reportConsentChoice(choice, COOKIE_CONSENT_VERSION);
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

type StoredConsent = {
  choice: CookieConsent;
  version: number;
  at: string;
};

/**
 * Read the stored choice. Two accepted shapes: the current versioned JSON
 * record, and the legacy bare string (treated as version 1). Choices recorded
 * against an older policy version read as null so the banner re-prompts.
 */
export function readCookieConsent(
  storage: Pick<Storage, "getItem"> | null = browserStorage()
): CookieConsent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    // Legacy bare string from before consent versioning.
    if (raw === "accepted" || raw === "rejected") {
      return COOKIE_CONSENT_VERSION <= 1 ? raw : null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (
      (parsed.choice === "accepted" || parsed.choice === "rejected") &&
      typeof parsed.version === "number" &&
      parsed.version >= COOKIE_CONSENT_VERSION
    ) {
      return parsed.choice;
    }
    return null;
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
    const record: StoredConsent = {
      choice: consent,
      version: COOKIE_CONSENT_VERSION,
      at: new Date().toISOString(),
    };
    storage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Keep the in-memory choice working when storage is blocked or unavailable.
  }
}

/** Forget the stored choice entirely — next load re-prompts. */
export function resetCookieConsent(
  storage: Pick<Storage, "removeItem"> | null = browserStorage()
): void {
  if (!storage) return;
  try {
    storage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

function browserStorage(): Storage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}
