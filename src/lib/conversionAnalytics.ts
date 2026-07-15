import { readCookieConsent } from "@/components/CookieBanner/CookieBanner";
import { publicTenantSlug } from "./publicTenant";

const SESSION_KEY_PREFIX = "lume.analytics-session.v1";
type EventName = "inventory_view" | "search_performed" | "filter_applied" | "vehicle_view" | "vehicle_saved" | "vehicle_unsaved" | "compare_added" | "compare_removed" | "inquiry_opened" | "inquiry_started" | "chat_started" | "account_created";
export function trackConversion(name: EventName, options: { vehicleId?: string; metadata?: Record<string, string | number | boolean> } = {}): void {
  if (readCookieConsent() !== "accepted" || typeof crypto === "undefined") return;
  const anonymousSessionId = sessionId(); if (!anonymousSessionId) return;
  try { void fetch("/api/events", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-Lume-Tenant": publicTenantSlug }, body: JSON.stringify({ anonymousSessionId, attribution: readAttribution(), events: [{ eventId: crypto.randomUUID(), name, ...options }] }) }).catch(() => undefined); } catch { /* non-critical */ }
}
function readAttribution(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const query = new URLSearchParams(window.location.search);
    const value = (name: string) => query.get(name)?.trim().slice(0, 160) || undefined;
    // Store only the referring origin — URL paths and query strings can contain PII.
    const referrer = document.referrer ? new URL(document.referrer).origin : undefined;
    return { ...(value("utm_source") ? { utmSource: value("utm_source") } : {}), ...(value("utm_medium") ? { utmMedium: value("utm_medium") } : {}), ...(value("utm_campaign") ? { utmCampaign: value("utm_campaign") } : {}), ...(value("utm_content") ? { utmContent: value("utm_content") } : {}), ...(referrer ? { referrer } : {}) };
  } catch { return {}; }
}
function sessionId(): string | null {
  try {
    // A tenant-specific key prevents a visitor switching tenant previews in
    // one tab from reusing an analytics identity across tenants.
    const key = `${SESSION_KEY_PREFIX}:${publicTenantSlug}`;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  } catch { return null; }
}
