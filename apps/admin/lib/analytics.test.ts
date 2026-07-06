import { describe, expect, it } from "vitest";
import { countByValue, leadsPerDay, niceBucketSize, priceHistogram } from "./analytics";

describe("leadsPerDay", () => {
  const today = new Date("2026-07-06T15:00:00Z");

  it("zero-fills the window and counts per UTC day", () => {
    const series = leadsPerDay(
      ["2026-07-06T01:00:00Z", "2026-07-06T23:59:00Z", "2026-07-04T12:00:00Z"],
      3,
      today
    );
    expect(series.map((d) => d.date)).toEqual(["2026-07-04", "2026-07-05", "2026-07-06"]);
    expect(series.map((d) => d.count)).toEqual([1, 0, 2]);
    expect(series[0].label).toBe("Jul 4");
  });

  it("ignores unparseable timestamps and dates outside the window", () => {
    const series = leadsPerDay(["garbage", "2020-01-01T00:00:00Z"], 2, today);
    expect(series.map((d) => d.count)).toEqual([0, 0]);
  });
});

describe("countByValue", () => {
  it("groups case-insensitively, keeps first spelling, folds the tail into Other", () => {
    const result = countByValue(
      ["Porsche", "porsche", "Toyota", "Ford", "Honda", "Tesla"],
      3
    );
    expect(result[0]).toEqual({ name: "Porsche", count: 2 });
    expect(result).toHaveLength(4);
    expect(result[3]).toEqual({ name: "Other", count: 2 });
  });

  it("labels blank values and skips Other when everything fits", () => {
    const result = countByValue(["Sedan", "", null, "Sedan"], 5);
    expect(result).toEqual([
      { name: "Sedan", count: 2 },
      { name: "Unknown", count: 2 },
    ]);
  });
});

describe("niceBucketSize", () => {
  it("rounds up to friendly steps", () => {
    expect(niceBucketSize(1800)).toBe(2000);
    expect(niceBucketSize(2200)).toBe(2500);
    expect(niceBucketSize(4000)).toBe(5000);
    expect(niceBucketSize(60000)).toBe(100000);
    expect(niceBucketSize(0)).toBe(1);
  });
});

describe("priceHistogram", () => {
  it("buckets prices with zero-filled interior gaps", () => {
    // Range 17.8k–129.9k over ≤8 buckets → 20k-wide buckets from $0k to $140k.
    const buckets = priceHistogram([17800, 21500, 38900, 44900, 129900], 8);
    expect(buckets).toHaveLength(7);
    expect(buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(5);
    expect(buckets.map((bucket) => bucket.count)).toEqual([1, 2, 1, 0, 0, 0, 1]);
    expect(buckets[0].label).toBe("$0–$20K");
  });

  it("keeps a single bucket for identical prices and handles empties", () => {
    expect(priceHistogram([])).toEqual([]);
    const single = priceHistogram([5000, 5000]);
    expect(single).toHaveLength(1);
    expect(single[0].count).toBe(2);
  });
});
