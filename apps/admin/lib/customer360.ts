export type CustomerTimelineItem = {
  id: string;
  occurredAt: string;
  label: string;
  href?: string;
};

export type VehicleInterest = {
  vehicleId: string;
  viewCount: number;
  firstViewedAt: string;
  lastViewedAt: string;
  isSaved: boolean;
  hasInquiry: boolean;
};

type ConversionEvent = {
  event_name: string;
  vehicle_id: string | null;
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

/**
 * Computes the customer-interest panel from already bounded, tenant-scoped
 * conversion events. It deliberately receives no event metadata so profile
 * rendering cannot accidentally expose raw analytics payloads.
 */
export function summarizeVehicleInterest(
  events: ConversionEvent[],
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
  events: ConversionEvent[],
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

export function buildCustomerTimeline(input: {
  accountCreatedAt: string;
  events: ConversionEvent[];
  saves: Array<{ vehicle_id: string; created_at: string }>;
  leads: Array<Timestamped>;
  leadActivities: Array<{ id: string; lead_id: string; type: string; created_at: string }>;
  chats: Array<Timestamped>;
  loyaltyTransactions: Array<{ id: string; description: string | null; points_delta: number; occurred_at: string }>;
  adminSlug: string;
  tenantSlug: string;
  vehicleIds: ReadonlySet<string>;
}): CustomerTimelineItem[] {
  const items: CustomerTimelineItem[] = [{ id: "account-created", occurredAt: input.accountCreatedAt, label: "Created account" }];
  for (const event of input.events) {
    items.push({
      id: `event-${event.event_name}-${event.occurred_at}-${event.vehicle_id ?? "none"}`,
      occurredAt: event.occurred_at,
      label: EVENT_LABELS[event.event_name] ?? "Recorded customer activity",
      ...(event.vehicle_id && input.vehicleIds.has(event.vehicle_id) ? { href: `/vehicles/${event.vehicle_id}` } : {}),
    });
  }
  for (const save of input.saves) items.push({ id: `save-${save.vehicle_id}-${save.created_at}`, occurredAt: save.created_at, label: "Saved vehicle" });
  for (const lead of input.leads) items.push({ id: `lead-${lead.id}`, occurredAt: lead.created_at, label: "Submitted lead", href: `${input.adminSlug}/leads/${lead.id}` });
  for (const activity of input.leadActivities) items.push({ id: `lead-activity-${activity.id}`, occurredAt: activity.created_at, label: `Lead ${activity.type.replaceAll("_", " ")}`, href: `${input.adminSlug}/leads/${activity.lead_id}` });
  for (const chat of input.chats) items.push({ id: `chat-${chat.id}`, occurredAt: chat.created_at, label: "Started chat" });
  for (const transaction of input.loyaltyTransactions) items.push({ id: `loyalty-${transaction.id}`, occurredAt: transaction.occurred_at, label: transaction.description ?? `${transaction.points_delta >= 0 ? "Earned" : "Used"} loyalty points` });
  return items.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id)).slice(0, 50);
}
