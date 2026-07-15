export const ANALYTICS_EVENT_NAMES = [
  "inventory_view", "search_performed", "filter_applied", "vehicle_view", "vehicle_saved", "vehicle_unsaved", "compare_added", "compare_removed", "inquiry_opened", "inquiry_started", "chat_started", "account_created",
] as const;
export const OPERATIONAL_EVENT_NAMES = ["inquiry_submitted"] as const;
export type ConversionEventName = (typeof ANALYTICS_EVENT_NAMES)[number] | (typeof OPERATIONAL_EVENT_NAMES)[number];
export type AnalyticsEventInput = { eventId: string; name: (typeof ANALYTICS_EVENT_NAMES)[number]; vehicleId?: string; metadata?: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_METADATA_BYTES = 2_048;

export function parseAnalyticsEvents(value: unknown): AnalyticsEventInput[] | null {
  const raw = isRecord(value) && Array.isArray(value.events) ? value.events : [];
  if (!raw.length || raw.length > 20) return null;
  const events: AnalyticsEventInput[] = [];
  for (const event of raw) {
    if (!isRecord(event) || typeof event.eventId !== "string" || !UUID.test(event.eventId) || typeof event.name !== "string" || !ANALYTICS_EVENT_NAMES.includes(event.name as AnalyticsEventInput["name"])) return null;
    const vehicleId = typeof event.vehicleId === "string" && UUID.test(event.vehicleId) ? event.vehicleId : undefined;
    if (event.vehicleId !== undefined && !vehicleId) return null;
    const metadata = sanitizeMetadata(event.metadata);
    if (metadata === null) return null;
    events.push({ eventId: event.eventId, name: event.name as AnalyticsEventInput["name"], ...(vehicleId ? { vehicleId } : {}), ...(Object.keys(metadata).length ? { metadata } : {}) });
  }
  return events;
}

export function sanitizeMetadata(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return {};
  if (!isRecord(value)) return null;
  const result: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!/^[a-z][a-z0-9_]{0,39}$/i.test(key)) continue;
    if (typeof raw === "string") result[key] = raw.slice(0, 160);
    else if (typeof raw === "number" && Number.isFinite(raw)) result[key] = raw;
    else if (typeof raw === "boolean") result[key] = raw;
  }
  return JSON.stringify(result).length <= MAX_METADATA_BYTES ? result : null;
}

export function isUuid(value: string): boolean { return UUID.test(value); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
