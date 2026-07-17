import { describe, expect, it } from "vitest";
import {
  buildCustomerTimeline,
  canonicalVehicleTitle,
  customerEngagement,
  CUSTOMER_EVENT_PROJECTION,
  CUSTOMER_VISITOR_PROJECTION,
  summarizeVehicleInterest,
  type CustomerConversionEvent,
} from "./customer360";

const vehicleOne = "11111111-1111-4111-8111-111111111111";
const vehicleTwo = "22222222-2222-4222-8222-222222222222";

function event(overrides: Partial<CustomerConversionEvent> = {}): CustomerConversionEvent {
  return {
    event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    event_name: "vehicle_view",
    event_category: "analytics",
    vehicle_id: vehicleOne,
    vehicle_title: null,
    occurred_at: "2026-01-03T10:15:00.000Z",
    ...overrides,
  };
}

function timeline(overrides: Partial<Parameters<typeof buildCustomerTimeline>[0]> = {}) {
  return buildCustomerTimeline({
    accountCreatedAt: "2026-01-01T09:00:00.000Z",
    events: [],
    saves: [],
    leads: [],
    leadActivities: [],
    chats: [],
    adminSlug: "/admin/tenant-a",
    vehicleTitles: new Map([[vehicleOne, "2026 BMW 740 740i"]]),
    ...overrides,
  });
}

describe("Customer 360 helpers", () => {
  it("summarizes only vehicle views and keeps deterministic order", () => {
    const interest = summarizeVehicleInterest([
      event({ occurred_at: "2026-01-02T00:00:00.000Z" }),
      event({ event_name: "vehicle_saved", occurred_at: "2026-01-03T00:00:00.000Z" }),
      event({ event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", occurred_at: "2026-01-04T00:00:00.000Z" }),
      event({ event_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", vehicle_id: vehicleTwo, occurred_at: "2026-01-05T00:00:00.000Z" }),
    ], new Set([vehicleOne]), new Set([vehicleOne]));
    expect(interest).toEqual([
      { vehicleId: vehicleTwo, viewCount: 1, firstViewedAt: "2026-01-05T00:00:00.000Z", lastViewedAt: "2026-01-05T00:00:00.000Z", isSaved: false, hasInquiry: false },
      { vehicleId: vehicleOne, viewCount: 2, firstViewedAt: "2026-01-02T00:00:00.000Z", lastViewedAt: "2026-01-04T00:00:00.000Z", isSaved: true, hasInquiry: true },
    ]);
  });

  it("does not fabricate engagement when consented activity is unavailable", () => {
    expect(customerEngagement([], 3, 2, 1)).toEqual({ label: "Insufficient activity data", explanation: "No consented conversion activity is available." });
    expect(customerEngagement([event()], 1, 1, 0).label).toBe("Active");
  });

  it("uses the canonical vehicle title and tenant Admin inventory link for trusted save transitions", () => {
    const result = timeline({
      events: [event({
        event_name: "vehicle_saved",
        event_category: "operational",
        vehicle_title: "stale title",
      })],
    });
    expect(result[0]).toMatchObject({
      id: "event-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      label: "Saved vehicle — 2026 BMW 740 740i",
      href: `/admin/tenant-a/vehicles/${vehicleOne}`,
    });
  });

  it("retains one save and one unsave transition while discarding browser analytics duplicates", () => {
    const result = timeline({
      events: [
        event({ event_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", event_name: "vehicle_saved", event_category: "operational", occurred_at: "2026-01-02T10:15:00.000Z" }),
        event({ event_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", event_name: "vehicle_saved", event_category: "analytics", occurred_at: "2026-01-02T10:15:01.000Z" }),
        event({ event_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", event_name: "vehicle_unsaved", event_category: "operational", occurred_at: "2026-01-03T10:15:00.000Z" }),
        event({ event_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", event_name: "vehicle_unsaved", event_category: "analytics", occurred_at: "2026-01-03T10:15:01.000Z" }),
      ],
      saves: [{ vehicle_id: vehicleOne, created_at: "2026-01-02T10:15:00.000Z" }],
    });
    expect(result.filter((item) => item.label.startsWith("Saved vehicle"))).toHaveLength(1);
    expect(result.filter((item) => item.label.startsWith("Removed saved vehicle"))).toHaveLength(1);
  });

  it("deduplicates a repeated stable event ID", () => {
    const repeated = event({ event_name: "vehicle_saved", event_category: "operational" });
    const result = timeline({ events: [repeated, repeated] });
    expect(result.filter((item) => item.id === `event-${repeated.event_id}`)).toHaveLength(1);
  });

  it("preserves a deleted vehicle title without rendering a broken link", () => {
    const result = timeline({
      vehicleTitles: new Map(),
      events: [event({
        event_name: "vehicle_unsaved",
        event_category: "operational",
        vehicle_id: null,
        vehicle_title: "2024 Porsche 911 Carrera",
      })],
    });
    expect(result[0]).toMatchObject({
      label: "Removed saved vehicle — 2024 Porsche 911 Carrera",
      unavailable: true,
    });
    expect(result[0]?.href).toBeUndefined();
  });

  it("uses current save rows only as a legacy fallback", () => {
    const result = timeline({
      saves: [{ vehicle_id: vehicleOne, created_at: "2025-12-31T10:15:00.000Z" }],
    });
    expect(result.some((item) => item.label === "Saved vehicle — 2026 BMW 740 740i")).toBe(true);
  });

  it("normalizes a newest-first bounded timeline", () => {
    const result = timeline({
      events: [event()],
      leads: [{ id: "lead-1", created_at: "2026-01-04T00:00:00.000Z" }],
    });
    expect(result.map((item) => item.label)).toEqual([
      "Submitted lead",
      "Viewed vehicle — 2026 BMW 740 740i",
      "Created account",
    ]);
    expect(result[0]?.href).toBe("/admin/tenant-a/leads/lead-1");
  });

  it("builds canonical titles without empty segments", () => {
    expect(canonicalVehicleTitle({ year: 2026, make: " BMW ", model: "740", trim: "740i" })).toBe("2026 BMW 740 740i");
  });

  it("never requests visitor credentials, session tokens, or arbitrary event metadata", () => {
    expect(CUSTOMER_VISITOR_PROJECTION).not.toMatch(/password_hash|token_hash/);
    expect(CUSTOMER_EVENT_PROJECTION).not.toContain("metadata");
    expect(CUSTOMER_EVENT_PROJECTION).toContain("event_id");
    expect(CUSTOMER_EVENT_PROJECTION).toContain("event_category");
    expect(CUSTOMER_EVENT_PROJECTION).toContain("vehicle_title");
  });
});
