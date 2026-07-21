import { describe, expect, it } from "vitest";
import {
  groupManagedImagesByVehicle,
  normalizeVehicleImageFilter,
  pickManagedImage,
  resolveVehicleThumbnail,
  vehicleHasImageSource,
  type ManagedImageRef,
} from "./vehicleGrid";

const BASE_URL = "https://cdn.example.com";

const managed = (overrides: Partial<ManagedImageRef>): ManagedImageRef => ({
  vehicle_id: "v1",
  r2_key: "tenants/t1/vehicles/v1/images/00000000-0000-4000-8000-000000000001.jpg",
  is_primary: false,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const vehicle = (overrides: Partial<{ special_image_src: string | null; image_src: string }> = {}) => ({
  special_image_src: null,
  image_src: "",
  ...overrides,
});

describe("pickManagedImage", () => {
  it("prefers the primary image regardless of sort order", () => {
    const chosen = pickManagedImage([
      managed({ r2_key: "a.jpg", sort_order: 0 }),
      managed({ r2_key: "b.jpg", sort_order: 5, is_primary: true }),
    ]);
    expect(chosen?.r2_key).toBe("b.jpg");
  });

  it("falls back to sort_order, then created_at, when none is primary", () => {
    const bySort = pickManagedImage([
      managed({ r2_key: "later.jpg", sort_order: 2 }),
      managed({ r2_key: "first.jpg", sort_order: 1 }),
    ]);
    expect(bySort?.r2_key).toBe("first.jpg");

    const byCreated = pickManagedImage([
      managed({ r2_key: "newer.jpg", created_at: "2026-02-01T00:00:00Z" }),
      managed({ r2_key: "older.jpg", created_at: "2026-01-01T00:00:00Z" }),
    ]);
    expect(byCreated?.r2_key).toBe("older.jpg");
  });

  it("returns null for an empty list and never mutates the input", () => {
    expect(pickManagedImage([])).toBeNull();
    const images = [managed({ sort_order: 2 }), managed({ sort_order: 1 })];
    pickManagedImage(images);
    expect(images[0].sort_order).toBe(2);
  });
});

describe("resolveVehicleThumbnail", () => {
  it("managed primary image wins over everything", () => {
    const url = resolveVehicleThumbnail({
      managed: [managed({ r2_key: "key/primary.jpg", is_primary: true })],
      vehicle: vehicle({
        special_image_src: "https://special.example.com/s.jpg",
        image_src: "https://legacy.example.com/l.jpg",
      }),
      r2PublicBaseUrl: BASE_URL,
    });
    expect(url).toBe(`${BASE_URL}/key/primary.jpg`);
  });

  it("special_image_src wins over legacy image_src when nothing is managed", () => {
    const url = resolveVehicleThumbnail({
      managed: [],
      vehicle: vehicle({
        special_image_src: "https://special.example.com/s.jpg",
        image_src: "https://legacy.example.com/l.jpg",
      }),
      r2PublicBaseUrl: BASE_URL,
    });
    expect(url).toBe("https://special.example.com/s.jpg");
  });

  it("uses the imported/legacy image_src when it is all that exists", () => {
    const url = resolveVehicleThumbnail({
      managed: undefined,
      vehicle: vehicle({ image_src: "https://cdn.feed.example.com/car.jpg" }),
      r2PublicBaseUrl: BASE_URL,
    });
    expect(url).toBe("https://cdn.feed.example.com/car.jpg");
  });

  it("returns null (placeholder) when nothing is available", () => {
    expect(
      resolveVehicleThumbnail({
        managed: [],
        vehicle: vehicle(),
        r2PublicBaseUrl: BASE_URL,
      }),
    ).toBeNull();
  });

  it("falls through to legacy sources when R2 base URL is unconfigured", () => {
    const url = resolveVehicleThumbnail({
      managed: [managed({ is_primary: true })],
      vehicle: vehicle({ image_src: "https://legacy.example.com/l.jpg" }),
      r2PublicBaseUrl: null,
    });
    expect(url).toBe("https://legacy.example.com/l.jpg");
  });
});

describe("vehicle image filters", () => {
  it("normalizes only supported URL filter values", () => {
    expect(normalizeVehicleImageFilter("with")).toBe("with");
    expect(normalizeVehicleImageFilter("without")).toBe("without");
    expect(normalizeVehicleImageFilter("anything-else")).toBe("all");
    expect(normalizeVehicleImageFilter(undefined)).toBe("all");
  });

  it("treats managed, special, and non-empty legacy images as photos", () => {
    expect(vehicleHasImageSource({ hasManagedImage: true, vehicle: vehicle() })).toBe(true);
    expect(vehicleHasImageSource({
      hasManagedImage: false,
      vehicle: vehicle({ special_image_src: "https://special.example.com/s.jpg" }),
    })).toBe(true);
    expect(vehicleHasImageSource({
      hasManagedImage: false,
      vehicle: vehicle({ image_src: "https://legacy.example.com/l.jpg" }),
    })).toBe(true);
    expect(vehicleHasImageSource({ hasManagedImage: false, vehicle: vehicle() })).toBe(false);
  });
});

describe("groupManagedImagesByVehicle", () => {
  it("groups one bounded query result by vehicle id", () => {
    const grouped = groupManagedImagesByVehicle([
      managed({ vehicle_id: "v1", r2_key: "a.jpg" }),
      managed({ vehicle_id: "v2", r2_key: "b.jpg" }),
      managed({ vehicle_id: "v1", r2_key: "c.jpg" }),
    ]);
    expect(grouped.get("v1")?.map((image) => image.r2_key)).toEqual(["a.jpg", "c.jpg"]);
    expect(grouped.get("v2")).toHaveLength(1);
    expect(grouped.get("v3")).toBeUndefined();
  });
});
