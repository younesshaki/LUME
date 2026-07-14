import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS, loadVehicleResults } from "./catalog";

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
  it("requests an exact count once and reuses it for later pages", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicles: [vehicle], totalCount: 73, hasMore: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ vehicles: [{ ...vehicle, id: "count-cache-page-2" }], hasMore: true }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const filters = { ...DEFAULT_FILTERS, make: "CountCacheMake" };

    const first = await loadVehicleResults(filters, "price_asc", 1, 24);
    const second = await loadVehicleResults(filters, "price_asc", 2, 24);

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    const secondUrl = new URL(String(fetchMock.mock.calls[1][0]), "http://localhost");
    expect(firstUrl.searchParams.get("includeCount")).toBe("true");
    expect(secondUrl.searchParams.has("includeCount")).toBe(false);
    expect(secondUrl.searchParams.get("offset")).toBe("24");
    expect(first.totalCount).toBe(73);
    expect(second.totalCount).toBe(73);
  });
});
