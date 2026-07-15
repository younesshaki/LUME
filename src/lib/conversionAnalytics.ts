import { readCookieConsent } from "@/components/CookieBanner/CookieBanner";
import { publicTenantSlug } from "./publicTenant";

const SESSION_KEY = "lume.analytics-session.v1";
type EventName = "inventory_view" | "search_performed" | "filter_applied" | "vehicle_view" | "vehicle_saved" | "vehicle_unsaved" | "compare_added" | "compare_removed" | "inquiry_opened" | "inquiry_started" | "chat_started" | "account_created";
export function trackConversion(name: EventName, options: { vehicleId?: string; metadata?: Record<string, string | number | boolean> } = {}): void {
  if (readCookieConsent() !== "accepted" || typeof crypto === "undefined") return;
  const anonymousSessionId = sessionId(); if (!anonymousSessionId) return;
  try { void fetch("/api/events", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "X-Lume-Tenant": publicTenantSlug }, body: JSON.stringify({ anonymousSessionId, events: [{ eventId: crypto.randomUUID(), name, ...options }] }) }).catch(() => undefined); } catch { /* non-critical */ }
}
function sessionId(): string | null { try { const existing = sessionStorage.getItem(SESSION_KEY); if (existing) return existing; const id = crypto.randomUUID(); sessionStorage.setItem(SESSION_KEY, id); return id; } catch { return null; } }
