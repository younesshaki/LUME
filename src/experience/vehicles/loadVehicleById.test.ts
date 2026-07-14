import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFallbackGallery, loadVehicleById, type Vehicle } from "./catalog";

const baseVehicle: Vehicle = {
  id: "11111111-1111-4111-8111-111111111111",
  stockType: "Used",
  year: 2022,
  make: "BMW",
  model: "X5",
  trim: "xDrive40i",
  price: 58000,
  mileage: 12000,
  bodyStyle: "SUV",
  exteriorColor: "Black",
  interiorColor: "Tan",
  drivetrain: "AWD",
  fuelType: "Gasoline",
  imageSrc: "/vehicles/fallback.webp",
  sellerCity: "Denver",
  sellerState: "CO",
  isSpecial: false,
};

function mockFetchOnce(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async () => body,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildFallbackGallery", () => {
  it("prefers the managed primary image, then special, then legacy", () => {
    expect(buildFallbackGallery({ ...baseVehicle, primaryImageSrc: "/managed.webp" })[0].src).toBe(
      "/managed.webp",
    );
    expect(
      buildFallbackGallery({ ...baseVehicle, isSpecial: true, specialImageSrc: "/special.webp" })[0]
        .src,
    ).toBe("/special.webp");
    expect(buildFallbackGallery(baseVehicle)[0].src).toBe("/vehicles/fallback.webp");
  });

  it("derives an accessible alt when none is provided", () => {
    expect(buildFallbackGallery(baseVehicle)[0].alt).toBe("2022 BMW X5");
    expect(buildFallbackGallery({ ...baseVehicle, primaryImageAlt: "Front three-quarter" })[0].alt).toBe(
      "Front three-quarter",
    );
  });
});

describe("loadVehicleById", () => {
  it("returns the vehicle with its ordered managed gallery", async () => {
    mockFetchOnce(200, {
      vehicle: { ...baseVehicle, primaryImageSrc: "https://cdn/1.webp" },
      images: [
        { src: "https://cdn/1.webp", alt: "Front", isPrimary: true, sortOrder: 0 },
        { src: "https://cdn/2.webp", isPrimary: false, sortOrder: 1 },
      ],
    });

    const detail = await loadVehicleById(baseVehicle.id);
    expect(detail).not.toBeNull();
    expect(detail!.images).toHaveLength(2);
    expect(detail!.images[0]).toEqual({ src: "https://cdn/1.webp", alt: "Front", isPrimary: true });
    expect(detail!.images[1].src).toBe("https://cdn/2.webp");
    expect(detail!.vehicle.primaryImageSrc).toBe("https://cdn/1.webp");
  });

  it("synthesizes a single-image gallery when the vehicle has no managed images", async () => {
    mockFetchOnce(200, { vehicle: { ...baseVehicle }, images: [] });

    const detail = await loadVehicleById(baseVehicle.id);
    expect(detail).not.toBeNull();
    expect(detail!.images).toHaveLength(1);
    expect(detail!.images[0].src).toBe("/vehicles/fallback.webp");
    expect(detail!.images[0].isPrimary).toBe(true);
  });

  it("returns null for a blank id without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await loadVehicleById("")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
