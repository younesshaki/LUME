import { describe, expect, it } from "vitest";
import type { VisitorRow } from "./visitors";
import { assembleVisitorLoyalty, deriveTier, rowToVisitor } from "./visitors";

describe("rowToVisitor", () => {
  it("maps to the public shape and never leaks the password hash", () => {
    const row: VisitorRow = {
      id: "v1",
      tenant_id: "t1",
      email: "a@b.com",
      password_hash: "scrypt$deadbeef$cafe",
      first_name: "Ada",
      last_name: "L",
      created_at: "2026-07-11T00:00:00Z",
      updated_at: "2026-07-11T00:00:00Z",
    };
    const visitor = rowToVisitor(row);
    expect(visitor).toEqual({
      id: "v1",
      tenantId: "t1",
      email: "a@b.com",
      firstName: "Ada",
      lastName: "L",
      createdAt: "2026-07-11T00:00:00Z",
    });
    expect(JSON.stringify(visitor)).not.toContain("scrypt");
  });
});

describe("deriveTier", () => {
  const tiers = [
    { name: "Silver", threshold: 100 },
    { name: "Gold", threshold: 500 },
    { name: "Bronze", threshold: 0 },
  ];

  it("returns the highest tier the balance qualifies for", () => {
    expect(deriveTier(tiers, 600)?.name).toBe("Gold");
    expect(deriveTier(tiers, 250)?.name).toBe("Silver");
    expect(deriveTier(tiers, 50)?.name).toBe("Bronze");
  });

  it("returns null when nothing qualifies or no tiers exist", () => {
    expect(deriveTier([{ name: "Gold", threshold: 500 }], 100)).toBeNull();
    expect(deriveTier([], 999)).toBeNull();
  });
});

describe("assembleVisitorLoyalty", () => {
  it("defaults to zero points and maps transactions", () => {
    const view = assembleVisitorLoyalty(
      { points_balance: 300 },
      [
        { id: "tx1", points_delta: 100, description: "Signup bonus", occurred_at: "2026-07-01T00:00:00Z" },
        { id: "tx2", points_delta: -20, description: null, occurred_at: "2026-07-02T00:00:00Z" },
      ],
      [{ name: "Silver", threshold: 100 }],
    );
    expect(view.points).toBe(300);
    expect(view.tier?.name).toBe("Silver");
    expect(view.transactions).toEqual([
      { id: "tx1", delta: 100, reason: "Signup bonus", createdAt: "2026-07-01T00:00:00Z" },
      { id: "tx2", delta: -20, reason: null, createdAt: "2026-07-02T00:00:00Z" },
    ]);
  });

  it("handles a missing account", () => {
    const view = assembleVisitorLoyalty(null, [], []);
    expect(view).toEqual({ points: 0, tier: null, transactions: [] });
  });
});
