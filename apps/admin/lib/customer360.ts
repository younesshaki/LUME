export const CUSTOMER_VISITOR_PROJECTION = "id, first_name, last_name, email, created_at, updated_at" as const;
export const CUSTOMER_EVENT_PROJECTION = "event_id, event_name, event_category, vehicle_id, vehicle_title, occurred_at" as const;

export type CustomerTimelineItem = {
  id: string;
  occurredAt: string;
  label: string;
  href?: string;
  unavailable?: boolean;
};

export type VehicleInterest = {
  vehicleId: string;
  viewCount: number;
  firstViewedAt: string;
  lastViewedAt: string;
  isSaved: boolean;
  hasInquiry: boolean;
};

export type CustomerConversionEvent = {
  event_id: string;
  event_name: string;
  event_category: "analytics" | "operational";
  vehicle_id: string | null;
  vehicle_title: string | null;
  occurred_at: string;
};

type Timestamped = { id: string; created_at: string };

const EVENT_LABELS: Record<string, string> = {
  inventory_view: "Viewed inventory",
  search_performed: "Searched inventory",
  filter_applied: "Applied inventory filters",
  vehicle_view: "Viewed vehicle",
  vehicle_saved: "Saved vehicle",
  vehicle_unsaved: "Removed saved vehicle",
  compare_added: "Added vehicle to compare",
  compare_removed: "Removed vehicle from compare",
  inquiry_opened: "Opened an inquiry",
  inquiry_started: "Started an inquiry",
  inquiry_submitted: "Submitted an inquiry",
  chat_started: "Started a chat",
  account_created: "Created account",
};

const SAVED_TRANSITIONS = new Set(["vehicle_saved", "vehicle_unsaved"]);

/**
 * Computes the customer-interest panel from already bounded, tenant-scoped
 * conversion events. It deliberately receives no event metadata so profile
 * rendering cannot accidentally expose raw analytics payloads.
 */
export function summarizeVehicleInterest(
  events: ReadonlyArray<Pick<CustomerConversionEvent, "event_name" | "vehicle_id" | "occurred_at">>,
  savedVehicleIds: ReadonlySet<string>,
  leadVehicleIds: ReadonlySet<string>,
): VehicleInterest[] {
  const byVehicle = new Map<string, VehicleInterest>();
  for (const event of events) {
    if (!event.vehicle_id || event.event_name !== "vehicle_view") continue;
    const existing = byVehicle.get(event.vehicle_id);
    if (existing) {
      existing.viewCount += 1;
      if (event.occurred_at < existing.firstViewedAt) existing.firstViewedAt = event.occurred_at;
      if (event.occurred_at > existing.lastViewedAt) existing.lastViewedAt = event.occurred_at;
      continue;
    }
    byVehicle.set(event.vehicle_id, {
      vehicleId: event.vehicle_id,
      viewCount: 1,
      firstViewedAt: event.occurred_at,
      lastViewedAt: event.occurred_at,
      isSaved: savedVehicleIds.has(event.vehicle_id),
      hasInquiry: leadVehicleIds.has(event.vehicle_id),
    });
  }
  return [...byVehicle.values()].sort((left, right) =>
    right.lastViewedAt.localeCompare(left.lastViewedAt) || right.viewCount - left.viewCount || left.vehicleId.localeCompare(right.vehicleId),
  );
}

/** A transparent activity label, not a predictive score. */
export function customerEngagement(
  events: ReadonlyArray<Pick<CustomerConversionEvent, "event_name" | "vehicle_id" | "occurred_at">>,
  savedCount: number,
  leadCount: number,
  chatCount: number,
): { label: "Insufficient activity data" | "Low activity" | "Active" | "Highly engaged"; explanation: string } {
  if (events.length === 0) {
    return { label: "Insufficient activity data", explanation: "No consented conversion activity is available." };
  }
  const views = events.filter((event) => event.event_name === "vehicle_view").length;
  const score = Math.min(views, 6) + Math.min(savedCount, 3) * 2 + Math.min(leadCount, 2) * 4 + Math.min(chatCount, 2) * 2;
  const label = score >= 9 ? "Highly engaged" : score >= 4 ? "Active" : "Low activity";
  return {
    label,
    explanation: `${views} vehicle view${views === 1 ? "" : "s"}, ${savedCount} save${savedCount === 1 ? "" : "s"}, ${leadCount} lead${leadCount === 1 ? "" : "s"}, and ${chatCount} chat session${chatCount === 1 ? "" : "s"}.`,
  };
}

export function canonicalVehicleTitle(vehicle: {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
}): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim]
    .map((part) => typeof part === "string" ? part.trim() : part)
    .filter((part) => part !== null && part !== "")
    .join(" ");
}

export function buildCustomerTimeline(input: {
  accountCreatedAt: string;
  events: CustomerConversionEvent[];
  saves: Array<{ vehicle_id: string; created_at: string }>;
  leads: Array<Timestamped>;
  leadActivities: Array<{ id: string; lead_id: string; type: string; created_at: string }>;
  chats: Array<Timestamped>;
  adminSlug: string;
  vehicleTitles: ReadonlyMap<string, string>;
}): CustomerTimelineItem[] {
  const items: CustomerTimelineItem[] = [{ id: "account-created", occurredAt: input.accountCreatedAt, label: "Created account" }];
  const seenEventIds = new Set<string>();
  const trustedSavedVehicleIds = new Set<string>();

  for (const event of input.events) {
    if (seenEventIds.has(event.event_id)) continue;
    seenEventIds.add(event.event_id);

    // Browser analytics remain available to funnel reporting, but Customer 360
    // only treats the server-confirmed operational events as save transitions.
    if (SAVED_TRANSITIONS.has(event.event_name) && event.event_category !== "operational") continue;
    if (event.event_name === "vehicle_saved" && event.vehicle_id) trustedSavedVehicleIds.add(event.vehicle_id);

    const currentTitle = event.vehicle_id ? input.vehicleTitles.get(event.vehicle_id) : undefined;
    const vehicleTitle = currentTitle ?? normalizedHistoricalTitle(event.vehicle_title);
    const baseLabel = EVENT_LABELS[event.event_name] ?? "Recorded customer activity";
    const href = event.vehicle_id && currentTitle
      ? `${input.adminSlug}/vehicles/${event.vehicle_id}`
      : undefined;
    items.push({
      id: `event-${event.event_id}`,
      occurredAt: event.occurred_at,
      label: vehicleTitle ? `${baseLabel} — ${vehicleTitle}` : baseLabel,
      ...(href ? { href } : {}),
      ...(!href && (event.vehicle_id || vehicleTitle) ? { unavailable: true } : {}),
    });
  }

  // Saves created before the operational ledger existed remain visible once.
  // New saves already have a trusted event and are not duplicated here.
  for (const save of input.saves) {
    if (trustedSavedVehicleIds.has(save.vehicle_id)) continue;
    const title = input.vehicleTitles.get(save.vehicle_id);
    items.push({
      id: `legacy-save-${save.vehicle_id}-${save.created_at}`,
      occurredAt: save.created_at,
      label: `Saved vehicle — ${title ?? "Unavailable vehicle"}`,
      ...(title ? { href: `${input.adminSlug}/vehicles/${save.vehicle_id}` } : { unavailable: true }),
    });
  }

  for (const lead of input.leads) items.push({ id: `lead-${lead.id}`, occurredAt: lead.created_at, label: "Submitted lead", href: `${input.adminSlug}/leads/${lead.id}` });
  for (const activity of input.leadActivities) items.push({ id: `lead-activity-${activity.id}`, occurredAt: activity.created_at, label: `Lead ${activity.type.replaceAll("_", " ")}`, href: `${input.adminSlug}/leads/${activity.lead_id}` });
  for (const chat of input.chats) items.push({ id: `chat-${chat.id}`, occurredAt: chat.created_at, label: "Started chat" });

  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id)).slice(0, 50);
}

function normalizedHistoricalTitle(value: string | null): string | undefined {
  const title = value?.trim();
  return title ? title : undefined;
}
