import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FILTERS,
  loadVehicleCount,
  loadVehicleResults,
  prefetchVehicleResults,
} from "./catalog";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const vehicle = {
  id: "count-cache-vehicle",
  stockType: "Used",
  year: 2024,
  make: "CountCacheMake",
  model: "One",
  trim: "",
  price: 45000,
  mileage: 12000,
  bodyStyle: "SUV",
  exteriorColor: "Black",
  interiorColor: "Black",
  drivetrain: "AWD",
  fuelType: "Gasoline",
  imageSrc: "/vehicle.webp",
  sellerCity: "Denver",
  sellerState: "CO",
  isSpecial: false,
};

describe("loadVehicleResults pagination", () => {
  it("keeps the initial card request free of exact-count work", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicles: [vehicle], hasMore: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicles: [], totalCount: 73, hasMore: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicles: [{ ...vehicle, id: "count-cache-page-2" }], hasMore: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const filters = { ...DEFAULT_FILTERS, make: "CountCacheMake" };

    const first = await loadVehicleResults(filters, "price_asc", 1, 24);
    const count = await loadVehicleCount(filters, "price_asc");
    const second = await loadVehicleResults(filters, "price_asc", 2, 24);

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    const countUrl = new URL(String(fetchMock.mock.calls[1][0]), "http://localhost");
    const secondUrl = new URL(String(fetchMock.mock.calls[2][0]), "http://localhost");
    expect(firstUrl.searchParams.has("includeCount")).toBe(false);
    expect(fetchMock.mock.calls[0][1]).toBeUndefined();
    expect(countUrl.searchParams.get("includeCount")).toBe("true");
    expect(countUrl.searchParams.get("limit")).toBe("1");
    expect(secondUrl.searchParams.has("includeCount")).toBe(false);
    expect(secondUrl.searchParams.get("offset")).toBe("24");
    expect(first.totalCount).toBeNull();
    expect(count).toBe(73);
    expect(second.totalCount).toBeNull();
  });

  it("shares concurrent requests for the same visible page", async () => {
    let resolveResponse: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    const fetchMock = vi.fn().mockImplementation(
      () => new Promise((resolve) => { resolveResponse = resolve; }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = loadVehicleResults(DEFAULT_FILTERS, "recommended", 1, 24);
    const second = loadVehicleResults(DEFAULT_FILTERS, "recommended", 1, 24);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse?.({
      ok: true,
      json: async () => ({ vehicles: [vehicle], hasMore: false }),
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ vehicles: [expect.objectContaining({ id: vehicle.id })] }),
      expect.objectContaining({ vehicles: [expect.objectContaining({ id: vehicle.id })] }),
    ]);
  });

  it("hands a completed route prefetch to the first visible page request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ vehicles: [vehicle], hasMore: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const filters = { ...DEFAULT_FILTERS, make: "PrefetchMake" };

    await prefetchVehicleResults(filters, "recommended", 1, 24);
    const [result] = await Promise.all([
      loadVehicleResults(filters, "recommended", 1, 24),
      // React Strict Mode can replay the mount effect after a fast prefetch.
      // The bounded handoff must still avoid a duplicate visible-page request.
      loadVehicleResults(filters, "recommended", 1, 24),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.vehicles).toEqual([expect.objectContaining({ id: vehicle.id })]);
  });

  it("uses one legacy CSV request instead of draining API pages after an API failure", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => [
          "_primaryKey,stockType,year,make,model,trim,mileage,bodyStyle,exteriorColor,interiorColor,drivetrain,fuelType,sellerCity,sellerState",
          "fallback-1,Used,2022,Toyota,Camry,SE,20000,Sedan,Blue,Black,FWD,Gasoline,Austin,TX",
        ].join("\n"),
      });
    vi.stubGlobal("fetch", fetchMock);

    await loadVehicleResults(
      { ...DEFAULT_FILTERS, make: "BoundedFallbackMake" },
      "recommended",
      1,
      24,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/vehicles");
    expect(String(fetchMock.mock.calls[1][0])).toContain("vehicles-with-generated-images.csv");
  });
});
