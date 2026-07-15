import { describe, expect, it } from "vitest";
import { parseAnalyticsEvents, sanitizeMetadata } from "./conversionEvents";

describe("conversion event validation", () => {
  it("accepts only allowlisted analytics events with bounded metadata", () => {
    expect(parseAnalyticsEvents({ events: [{ eventId: "11111111-1111-4111-8111-111111111111", name: "vehicle_view", metadata: { placement: "detail" } }] })).toEqual([
      { eventId: "11111111-1111-4111-8111-111111111111", name: "vehicle_view", metadata: { placement: "detail" } },
    ]);
  });
  it("rejects unknown names and batches above the limit", () => {
    expect(parseAnalyticsEvents({ events: [{ eventId: "11111111-1111-4111-8111-111111111111", name: "lead_export" }] })).toBeNull();
    expect(parseAnalyticsEvents({ events: Array.from({ length: 21 }, () => ({ eventId: "11111111-1111-4111-8111-111111111111", name: "vehicle_view" })) })).toBeNull();
  });
  it("drops unsafe metadata values rather than persisting request bodies", () => {
    expect(sanitizeMetadata({ safe: "value", nested: { email: "private@example.com" }, "bad-key!": "ignored" })).toEqual({ safe: "value" });
  });
});
