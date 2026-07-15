import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVehicleFacets } from "./catalog";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFacets(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("loadVehicleFacets", () => {
  it("returns normalized, sorted facet sets from the endpoint", async () => {
    mockFacets({
      makes: ["Toyota", "BMW", ""],
      models: ["X5", "Camry"],
      states: ["CA", "AZ"],
      cities: ["Denver"],
      ranges: {
        yearMin: 2005,
        yearMax: 2026,
        priceMin: 12500,
        priceMax: 240000,
        mileageMin: 0,
        mileageMax: 180000,
      },
    });

    const facets = await loadVehicleFacets("BMW", "CO");
    expect(facets.makes).toEqual(["BMW", "Toyota"]);
    expect(facets.models).toEqual(["Camry", "X5"]);
    expect(facets.states).toEqual(["AZ", "CA"]);
    expect(facets.cities).toEqual(["Denver"]);
    expect(facets.ranges).toEqual({
      yearMin: 2005,
      yearMax: 2026,
      priceMin: 12500,
      priceMax: 240000,
      mileageMin: 0,
      mileageMax: 180000,
    });
  });

  it("memoizes per make/state scope (no second request)", async () => {
    const fetchMock = mockFacets({ makes: ["Audi"], models: [], states: [], cities: [] });
    await loadVehicleFacets("Audi", "TX");
    await loadVehicleFacets("Audi", "TX");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes cached facets after the short TTL", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const fetchMock = mockFacets({ makes: ["TTLMake"], models: [], states: [], cities: [] });

    await loadVehicleFacets("TTLMake", "WA");
    await loadVehicleFacets("TTLMake", "WA");
    now.mockReturnValue(61_001);
    await loadVehicleFacets("TTLMake", "WA");

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends make/state as query params", async () => {
    const fetchMock = mockFacets({ makes: [], models: [], states: [], cities: [] });
    await loadVehicleFacets("Ford", "FL");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/vehicles/facets");
    expect(calledUrl).toContain("make=Ford");
    expect(calledUrl).toContain("sellerState=FL");
  });

  it("does not download the full catalog when facets fail", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Unavailable",
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadVehicleFacets("NoCatalogFallback", "ZZ")).resolves.toMatchObject({
      makes: [], models: [], states: [], cities: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/vehicles/facets");
  });
});
