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
    });

    const facets = await loadVehicleFacets("BMW", "CO");
    expect(facets.makes).toEqual(["BMW", "Toyota"]);
    expect(facets.models).toEqual(["Camry", "X5"]);
    expect(facets.states).toEqual(["AZ", "CA"]);
    expect(facets.cities).toEqual(["Denver"]);
  });

  it("memoizes per make/state scope (no second request)", async () => {
    const fetchMock = mockFacets({ makes: ["Audi"], models: [], states: [], cities: [] });
    await loadVehicleFacets("Audi", "TX");
    await loadVehicleFacets("Audi", "TX");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends make/state as query params", async () => {
    const fetchMock = mockFacets({ makes: [], models: [], states: [], cities: [] });
    await loadVehicleFacets("Ford", "FL");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/api/vehicles/facets");
    expect(calledUrl).toContain("make=Ford");
    expect(calledUrl).toContain("sellerState=FL");
  });
});
