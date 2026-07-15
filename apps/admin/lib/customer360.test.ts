import { describe, expect, it } from "vitest";
import { buildCustomerTimeline, customerEngagement, summarizeVehicleInterest } from "./customer360";

const vehicleOne = "11111111-1111-4111-8111-111111111111";
const vehicleTwo = "22222222-2222-4222-8222-222222222222";

describe("Customer 360 helpers", () => {
  it("summarizes only vehicle views and keeps deterministic order", () => {
    const interest = summarizeVehicleInterest([
      { event_name: "vehicle_view", vehicle_id: vehicleOne, occurred_at: "2026-01-02T00:00:00.000Z" },
      { event_name: "vehicle_saved", vehicle_id: vehicleOne, occurred_at: "2026-01-03T00:00:00.000Z" },
      { event_name: "vehicle_view", vehicle_id: vehicleOne, occurred_at: "2026-01-04T00:00:00.000Z" },
      { event_name: "vehicle_view", vehicle_id: vehicleTwo, occurred_at: "2026-01-05T00:00:00.000Z" },
    ], new Set([vehicleOne]), new Set([vehicleOne]));
    expect(interest).toEqual([
      { vehicleId: vehicleTwo, viewCount: 1, firstViewedAt: "2026-01-05T00:00:00.000Z", lastViewedAt: "2026-01-05T00:00:00.000Z", isSaved: false, hasInquiry: false },
      { vehicleId: vehicleOne, viewCount: 2, firstViewedAt: "2026-01-02T00:00:00.000Z", lastViewedAt: "2026-01-04T00:00:00.000Z", isSaved: true, hasInquiry: true },
    ]);
  });

  it("does not fabricate engagement when consented activity is unavailable", () => {
    expect(customerEngagement([], 3, 2, 1)).toEqual({ label: "Insufficient activity data", explanation: "No consented conversion activity is available." });
    expect(customerEngagement([{ event_name: "vehicle_view", vehicle_id: vehicleOne, occurred_at: "2026-01-01T00:00:00.000Z" }], 1, 1, 0).label).toBe("Active");
  });

  it("normalizes a newest-first bounded timeline without event metadata", () => {
    const result = buildCustomerTimeline({
      accountCreatedAt: "2026-01-01T00:00:00.000Z",
      events: [{ event_name: "vehicle_view", vehicle_id: vehicleOne, occurred_at: "2026-01-03T00:00:00.000Z" }],
      saves: [], leads: [{ id: "lead-1", created_at: "2026-01-04T00:00:00.000Z" }], leadActivities: [], chats: [], loyaltyTransactions: [],
      adminSlug: "/admin/tenant-a", tenantSlug: "tenant-a", vehicleIds: new Set([vehicleOne]),
    });
    expect(result.map((item) => item.label)).toEqual(["Submitted lead", "Viewed vehicle", "Created account"]);
    expect(result[0]?.href).toBe("/admin/tenant-a/leads/lead-1");
  });
});
