import { describe, expect, it } from "vitest";
import { nextRoundRobinAssignee, normalizeLeadAssignmentMode } from "./leadAssignment";

const member = (
  userId: string,
  overrides: Partial<{
    createdAt: string;
    salesEnabled: boolean;
    outOfOffice: boolean;
  }> = {},
) => ({
  userId,
  createdAt: "2026-01-01T00:00:00.000Z",
  salesEnabled: true,
  outOfOffice: false,
  ...overrides,
});

describe("lead round robin", () => {
  it("rotates deterministically and wraps after the final eligible member", () => {
    const members = [
      member("b", { createdAt: "2026-01-02T00:00:00Z" }),
      member("a", { createdAt: "2026-01-01T00:00:00Z" }),
      member("c", { createdAt: "2026-01-03T00:00:00Z" }),
    ];
    expect(nextRoundRobinAssignee(members, null)).toBe("a");
    expect(nextRoundRobinAssignee(members, "a")).toBe("b");
    expect(nextRoundRobinAssignee(members, "c")).toBe("a");
  });

  it("skips non-sales and out-of-office members", () => {
    const members = [
      member("not-sales", { salesEnabled: false }),
      member("away", { outOfOffice: true }),
      member("available"),
    ];
    expect(nextRoundRobinAssignee(members, null)).toBe("available");
  });

  it("returns null when all sales members are unavailable", () => {
    expect(nextRoundRobinAssignee([
      member("away", { outOfOffice: true }),
      member("viewer", { salesEnabled: false }),
    ], "away")).toBeNull();
  });

  it("restarts at the first member when the stored cursor is no longer eligible", () => {
    expect(nextRoundRobinAssignee([member("a"), member("b")], "removed")).toBe("a");
  });

  it("validates assignment mode values", () => {
    expect(normalizeLeadAssignmentMode("manual")).toBe("manual");
    expect(normalizeLeadAssignmentMode("round_robin")).toBe("round_robin");
    expect(normalizeLeadAssignmentMode("random")).toBeNull();
  });
});
