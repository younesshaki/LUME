/**
 * Anonymous consent-ledger reporting (SCRUM-200). Fire-and-forget: the
 * visitor's choice is already applied locally before this runs, and a failed
 * report must never affect the UI, so every error path is swallowed.
 * Deliberately sends no credentials — the ledger row must stay anonymous.
 */
import { publicTenantSlug } from "./publicTenant";

const CONSENT_API_PATH = "/api/consent";
const ADMIN_API_HOST = (import.meta.env.VITE_ADMIN_API_HOST as string | undefined)?.replace(
  /\/$/,
  "",
);

export function reportConsentChoice(choice: "accepted" | "rejected", version: number): void {
  try {
    void fetch(consentApiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lume-Tenant": publicTenantSlug,
      },
      body: JSON.stringify({ choice, version }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Unavailable fetch (very old browsers, some test environments) — skip.
  }
}

function consentApiUrl(): string {
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";
  return new URL(`${ADMIN_API_HOST ?? ""}${CONSENT_API_PATH}`, origin).toString();
}
