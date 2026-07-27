import { describe, expect, it } from "vitest";

import {
  chunk,
  filterRowsByImagePresence,
  hasAnyImage,
  selectVehicleIdsWithoutImages,
  type VehicleImageSourceRow,
} from "./vehiclesWithoutImages";

const row = (overrides: Partial<VehicleImageSourceRow> = {}): VehicleImageSourceRow => ({
  id: "v1",
  image_src: null,
  special_image_src: null,
  ...overrides,
});

describe("selectVehicleIdsWithoutImages", () => {
  it("selects a vehicle with no source at all", () => {
    expect(selectVehicleIdsWithoutImages([row()], new Set())).toEqual(["v1"]);
  });

  it("skips vehicles with a managed R2 image", () => {
    expect(selectVehicleIdsWithoutImages([row()], new Set(["v1"]))).toEqual([]);
  });

  it("skips vehicles with a legacy feed URL", () => {
    const rows = [row({ image_src: "https://cdn.example.com/a.jpg" })];
    expect(selectVehicleIdsWithoutImages(rows, new Set())).toEqual([]);
  });

  it("skips vehicles with a special image source", () => {
    const rows = [row({ special_image_src: "https://cdn.example.com/b.jpg" })];
    expect(selectVehicleIdsWithoutImages(rows, new Set())).toEqual([]);
  });

  it("treats whitespace-only sources as no image", () => {
    const rows = [row({ image_src: "   ", special_image_src: "\t" })];
    expect(selectVehicleIdsWithoutImages(rows, new Set())).toEqual(["v1"]);
  });

  it("keeps only the vehicles that fail every check", () => {
    const rows = [
      row({ id: "none" }),
      row({ id: "legacy", image_src: "x.jpg" }),
      row({ id: "special", special_image_src: "y.jpg" }),
      row({ id: "managed" }),
      row({ id: "blank", image_src: "" }),
    ];
    expect(selectVehicleIdsWithoutImages(rows, new Set(["managed"]))).toEqual([
      "none",
      "blank",
    ]);
  });

  it("returns nothing for an empty inventory", () => {
    expect(selectVehicleIdsWithoutImages([], new Set())).toEqual([]);
  });
});

describe("chunk", () => {
  it("splits into batches of the requested size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("keeps everything in one batch when the size exceeds the list", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe("hasAnyImage", () => {
  it("counts each source independently", () => {
    expect(hasAnyImage(row(), new Set())).toBe(false);
    expect(hasAnyImage(row(), new Set(["v1"]))).toBe(true);
    expect(hasAnyImage(row({ image_src: "a.jpg" }), new Set())).toBe(true);
    expect(hasAnyImage(row({ special_image_src: "b.jpg" }), new Set())).toBe(true);
  });
});

describe("filterRowsByImagePresence", () => {
  const rows = [
    row({ id: "bare" }),
    row({ id: "legacy", image_src: "a.jpg" }),
    row({ id: "managed" }),
  ];
  const managed = new Set(["managed"]);

  it("passes everything through in 'all' mode", () => {
    expect(filterRowsByImagePresence(rows, managed, "all").map((r) => r.id)).toEqual([
      "bare",
      "legacy",
      "managed",
    ]);
  });

  it("keeps only vehicles that show a photo in 'with' mode", () => {
    expect(filterRowsByImagePresence(rows, managed, "with").map((r) => r.id)).toEqual([
      "legacy",
      "managed",
    ]);
  });

  it("keeps only vehicles with no photo in 'without' mode", () => {
    expect(filterRowsByImagePresence(rows, managed, "without").map((r) => r.id)).toEqual([
      "bare",
    ]);
  });
});
