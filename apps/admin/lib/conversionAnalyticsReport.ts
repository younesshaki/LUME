type JsonRecord = Record<string, unknown>;

export type ConversionVehicleMetric = { vehicleId: string; viewCount: number; submittedLeadCount: number; firstViewedAt: string | null; lastViewedAt: string | null };
export type ConversionSourceMetric = { source: string; campaign: string; viewCount: number; submittedLeadCount: number; sessionCount: number };
export type ConversionIdentityMetric = { identity: "anonymous" | "registered"; viewCount: number; saveCount: number; submittedLeadCount: number };
export type ConversionReport = { funnel: Map<string, { eventCount: number; sessionCount: number }>; vehicles: ConversionVehicleMetric[]; sources: ConversionSourceMetric[]; identities: ConversionIdentityMetric[]; medianViewToLeadSeconds: number | null };

export function parseConversionReport(value: unknown): ConversionReport {
  const root = record(value);
  const funnel = new Map<string, { eventCount: number; sessionCount: number }>();
  for (const row of records(root?.funnel)) {
    if (typeof row.event_name === "string") funnel.set(row.event_name, { eventCount: integer(row.event_count), sessionCount: integer(row.session_count) });
  }
  return {
    funnel,
    vehicles: records(root?.vehicles).flatMap((row) => typeof row.vehicle_id === "string" ? [{ vehicleId: row.vehicle_id, viewCount: integer(row.view_count), submittedLeadCount: integer(row.submitted_lead_count), firstViewedAt: timestamp(row.first_viewed_at), lastViewedAt: timestamp(row.last_viewed_at) }] : []),
    sources: records(root?.sources).flatMap((row) => typeof row.source === "string" && typeof row.campaign === "string" ? [{ source: row.source, campaign: row.campaign, viewCount: integer(row.view_count), submittedLeadCount: integer(row.submitted_lead_count), sessionCount: integer(row.session_count) }] : []),
    identities: records(root?.identities).flatMap((row) => row.identity === "anonymous" || row.identity === "registered" ? [{ identity: row.identity, viewCount: integer(row.view_count), saveCount: integer(row.save_count), submittedLeadCount: integer(row.submitted_lead_count) }] : []),
    medianViewToLeadSeconds: typeof root?.median_view_to_lead_seconds === "number" && Number.isFinite(root.median_view_to_lead_seconds) ? root.median_view_to_lead_seconds : null,
  };
}

function record(value: unknown): JsonRecord | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.flatMap((entry) => { const parsed = record(entry); return parsed ? [parsed] : []; }) : []; }
function integer(value: unknown): number { return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0; }
function timestamp(value: unknown): string | null { return typeof value === "string" && !Number.isNaN(new Date(value).getTime()) ? value : null; }
