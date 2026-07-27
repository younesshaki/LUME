import { describe, expect, it } from "vitest";
import {
  countUnmappedManagedFeedInvalidRecords,
  protectedVehicleHistoryMessage,
  shouldSkipUnchangedManagedFeed,
} from "./managedInventoryFeedPolicy";
import { parseManagedFeed } from "./managedFeed";

describe("managed inventory feed no-op policy", () => {
  it("skips only a fully successful identical payload under the exact same source config", () => {
    const hash = "a".repeat(64);
    expect(shouldSkipUnchangedManagedFeed(hash, hash, 4, 4)).toBe(true);
    expect(shouldSkipUnchangedManagedFeed(null, hash, 4, 4)).toBe(false);
    expect(shouldSkipUnchangedManagedFeed(hash, "b".repeat(64), 4, 4)).toBe(false);
    expect(shouldSkipUnchangedManagedFeed(hash, hash, 5, 4)).toBe(false);
  });

  it("rejects feed identities that belong to sold or archived history", () => {
    expect(protectedVehicleHistoryMessage(
      "4t1daack4tu663212",
      "OW26220",
      new Map([["4t1daack4tu663212", "sold-vehicle"]]),
      new Map(),
    )).toMatch(/sold or archived/i);
    expect(protectedVehicleHistoryMessage(
      null,
      "ow26220",
      new Map(),
      new Map([["ow26220", "archived-vehicle"]]),
    )).toMatch(/stock number/i);
  });

  it("counts malformed raw rows without treating the next valid source row as failed", () => {
    const parsed = parseManagedFeed(
      { format: "csv", mappings: { external_id: { path: "Stock" } } },
      ["Stock", "BAD-ROW,EXTRA", "GOOD-2"].join("\n"),
    );

    expect(parsed.records.map((record) => record.index)).toEqual([1]);
    expect(countUnmappedManagedFeedInvalidRecords(parsed)).toBe(1);
  });
});
