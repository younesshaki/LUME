import { describe, expect, it } from "vitest";
import {
  leadMessagePreview,
  leadNotificationAddresses,
  leadNotificationUserIds,
  normalizeLeadEmailSettings,
} from "./leadEmailPolicy";

const members = [
  { userId: "owner-1", role: "owner" as const },
  { userId: "admin-1", role: "admin" as const },
  { userId: "editor-1", role: "editor" as const },
  { userId: "viewer-1", role: "viewer" as const },
];

describe("lead email policy", () => {
  it("always includes owners, configured roles, and the assigned member", () => {
    expect(leadNotificationUserIds(members, ["admin"], "viewer-1"))
      .toEqual(["admin-1", "owner-1", "viewer-1"]);
    expect(leadNotificationUserIds(members, [], null)).toEqual(["owner-1"]);
  });

  it("normalizes a default-off tenant configuration", () => {
    expect(normalizeLeadEmailSettings({
      enabled: false,
      roles: ["owner", "admin", "admin"],
      mode: "hourly",
      unassignedAddress: " POOL@Example.com ",
      fromAddress: "notify@example.com",
    })).toEqual({
      enabled: false,
      roles: ["owner", "admin"],
      mode: "hourly",
      unassignedAddress: "pool@example.com",
      fromAddress: "notify@example.com",
    });
    expect(normalizeLeadEmailSettings({
      enabled: true,
      roles: ["invalid"],
      mode: "instant",
      unassignedAddress: null,
    })).toBeNull();
  });

  it("builds a bounded single-line message preview", () => {
    expect(leadMessagePreview("  hello\nthere  ")).toBe("hello there");
    expect(leadMessagePreview("x".repeat(10), 5)).toBe("xxxx…");
    expect(leadMessagePreview("   ")).toBeNull();
  });

  it("deduplicates member and unassigned-pool addresses", () => {
    expect(leadNotificationAddresses(
      ["OWNER@example.com", " owner@example.com ", null, "invalid"],
      "pool@example.com",
      true,
    )).toEqual(["owner@example.com", "pool@example.com"]);
    expect(leadNotificationAddresses([], "pool@example.com", false)).toEqual([]);
  });
});
