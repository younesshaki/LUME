import { describe, expect, it } from "vitest";
import { parseConversionReport } from "./conversionAnalyticsReport";

describe("parseConversionReport", () => {
  it("accepts bounded aggregate rows and rejects malformed raw values", () => {
    const report = parseConversionReport({ funnel: [{ event_name: "vehicle_view", event_count: 4, session_count: 3 }], vehicles: [{ vehicle_id: "vehicle-1", view_count: 4, submitted_lead_count: 1, first_viewed_at: "2026-01-01T00:00:00.000Z", last_viewed_at: "2026-01-02T00:00:00.000Z" }], sources: [{ source: "search", campaign: "summer", view_count: 4, submitted_lead_count: 1, session_count: 3 }], identities: [{ identity: "registered", view_count: 2, save_count: 1, submitted_lead_count: 1 }], median_view_to_lead_seconds: 3600 });
    expect(report.funnel.get("vehicle_view")).toEqual({ eventCount: 4, sessionCount: 3 });
    expect(report.vehicles[0]?.vehicleId).toBe("vehicle-1");
    expect(report.medianViewToLeadSeconds).toBe(3600);
  });
  it("returns safe empty aggregates for malformed responses", () => {
    expect(parseConversionReport({ vehicles: [{ vehicle_id: 3 }] }).vehicles).toEqual([]);
    expect(parseConversionReport(null).funnel.size).toBe(0);
  });
});
