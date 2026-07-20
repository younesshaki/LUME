import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  YEAR_MAX,
  YEAR_MIN,
  countActiveFilters,
  type VehicleFilters,
  filterVehicles,
  formatVehiclePrice,
  getCitiesForState,
  getUniqueStates,
  getVehicleById,
  normalizeVehiclePriceSignalPayload,
  sortVehicles,
  vehicleFacetsFromVehicles,
  vehicleFiltersToApiSearchParams,
  vehicleDisplayImage,
  type Vehicle,
} from "./catalog";
import { encodeVehicleUrlState, readVehicleUrlState } from "./urlState";

const vehicles: Vehicle[] = [
  {
    id: "tesla-ca",
    stockType: "Used",
    year: 2024,
    make: "Tesla",
    model: "Model S",
    trim: "Plaid",
    price: 72000,
    mileage: 4200,
    bodyStyle: "Sedan",
    exteriorColor: "Black",
    interiorColor: "White",
    drivetrain: "AWD",
    fuelType: "Electric",
    imageSrc: "/vehicles/vehicle-type-1.webp",
    sellerCity: "Los Angeles",
    sellerState: "CA",
    isSpecial: false,
  },
  {
    id: "ford-fl",
    stockType: "New",
    year: 2026,
    make: "Ford",
    model: "F-150",
    trim: "Raptor",
    price: 64000,
    mileage: 0,
    bodyStyle: "Truck",
    exteriorColor: "Blue",
    interiorColor: "Black",
    drivetrain: "4WD",
    fuelType: "Gasoline",
    imageSrc: "/vehicles/vehicle-type-2.webp",
    sellerCity: "Miami",
    sellerState: "FL",
    isSpecial: false,
  },
  {
    id: "toyota-ca",
    stockType: "Used",
    year: 2021,
    make: "Toyota",
    model: "RAV4",
    trim: "XLE",
    price: 28000,
    mileage: 39000,
    bodyStyle: "SUV",
    exteriorColor: "Silver",
    interiorColor: "Gray",
    drivetrain: "AWD",
    fuelType: "Hybrid",
    imageSrc: "/vehicles/vehicle-type-3.webp",
    sellerCity: "San Diego",
    sellerState: "CA",
    isSpecial: false,
  },
];

describe("vehicle catalog", () => {
  it("matches text search across vehicle and location fields", () => {
    const result = filterVehicles(vehicles, {
      ...DEFAULT_FILTERS,
      query: "tesla los angeles",
    });

    expect(result.map((vehicle) => vehicle.id)).toEqual(["tesla-ca"]);
  });

  it("filters by make, model, state, and city", () => {
    const result = filterVehicles(vehicles, {
      ...DEFAULT_FILTERS,
      make: "Ford",
      model: "F-150",
      sellerState: "FL",
      sellerCity: "Miami",
    });

    expect(result.map((vehicle) => vehicle.id)).toEqual(["ford-fl"]);
  });

  it("supports state and city option helpers", () => {
    expect(getUniqueStates(vehicles)).toEqual(["CA", "FL"]);
    expect(getCitiesForState(vehicles, "CA")).toEqual(["Los Angeles", "San Diego"]);
  });

  it("handles reversed year and price ranges safely", () => {
    const result = filterVehicles(vehicles, {
      ...DEFAULT_FILTERS,
      yearMin: 2026,
      yearMax: 2024,
      priceMin: 75000,
      priceMax: 60000,
    });

    expect(result.map((vehicle) => vehicle.id)).toEqual(["tesla-ca", "ford-fl"]);
  });

  it("sorts using standard marketplace options", () => {
    expect(sortVehicles(vehicles, "price_asc").map((vehicle) => vehicle.id)).toEqual([
      "toyota-ca",
      "ford-fl",
      "tesla-ca",
    ]);
    expect(sortVehicles(vehicles, "year_desc").map((vehicle) => vehicle.id)).toEqual([
      "ford-fl",
      "tesla-ca",
      "toyota-ca",
    ]);
    expect(sortVehicles(vehicles, "mileage_asc").map((vehicle) => vehicle.id)).toEqual([
      "ford-fl",
      "tesla-ca",
      "toyota-ca",
    ]);
  });

  it("counts active filters including search and location", () => {
    expect(
      countActiveFilters({
        ...DEFAULT_FILTERS,
        query: "tesla",
        sellerState: "CA",
        sellerCity: "Los Angeles",
      })
    ).toBe(3);
  });

  it("returns vehicles by id and formats estimated demo prices", () => {
    expect(getVehicleById(vehicles, "toyota-ca")?.model).toBe("RAV4");
    expect(getVehicleById(vehicles, "missing")).toBeUndefined();
    expect(formatVehiclePrice(72000)).toBe("Est. $72,000");
  });

  it("prefers a managed primary image over special and legacy imagery", () => {
    expect(vehicleDisplayImage({
      primaryImageSrc: "https://cdn.example/primary.webp",
      specialImageSrc: "https://cdn.example/special.webp",
      imageSrc: "https://cdn.example/legacy.webp",
    })).toBe("https://cdn.example/primary.webp");
    expect(vehicleDisplayImage({
      specialImageSrc: "https://cdn.example/special.webp",
      imageSrc: "https://cdn.example/legacy.webp",
    })).toBe("https://cdn.example/special.webp");
  });

  it("builds API search params for server-side vehicle queries", () => {
    const params = vehicleFiltersToApiSearchParams(
      {
        ...DEFAULT_FILTERS,
        query: "tesla plaid",
        make: "Tesla",
        sellerState: "CA",
        priceMax: 100000,
      },
      "price_desc",
      24,
      24
    );

    expect(params.get("q")).toBe("tesla plaid");
    expect(params.get("make")).toBe("Tesla");
    expect(params.get("sellerState")).toBe("CA");
    expect(params.get("priceMax")).toBe("100000");
    expect(params.get("sort")).toBe("price_desc");
    expect(params.get("offset")).toBe("24");
    expect(params.get("limit")).toBe("24");
  });

  it("builds fallback facets from local vehicles", () => {
    expect(vehicleFacetsFromVehicles(vehicles, { make: "Tesla", sellerState: "CA" })).toEqual({
      makes: ["Ford", "Tesla", "Toyota"],
      models: ["Model S"],
      states: ["CA", "FL"],
      cities: ["Los Angeles", "San Diego"],
    });
  });

  it("normalizes the aggregate public price-reduction signal defensively", () => {
    expect(normalizeVehiclePriceSignalPayload({ enabled: true, reductions: 3 })).toEqual({
      enabled: true,
      reductions: 3,
    });
    expect(normalizeVehiclePriceSignalPayload({ enabled: false, reductions: 99 })).toEqual({
      enabled: false,
      reductions: 0,
    });
    expect(normalizeVehiclePriceSignalPayload({ enabled: true, reductions: -1 })).toBeNull();
    expect(normalizeVehiclePriceSignalPayload({ reductions: 2 })).toBeNull();
  });

  it("encodes only non-default URL state", () => {
    const filters: VehicleFilters = {
      ...DEFAULT_FILTERS,
      query: "tesla",
      sellerState: "CA",
      yearMin: 2020,
    };

    expect(encodeVehicleUrlState(filters, "price_asc", 2)).toBe(
      "#vehicles?query=tesla&state=CA&yearMin=2020&sort=price_asc&page=2"
    );
  });

  it("reads vehicle state from the hash URL", () => {
    window.history.replaceState(
      null,
      "",
      "#vehicles?query=ford&state=FL&city=Miami&sort=year_desc&page=3"
    );

    const state = readVehicleUrlState();

    expect(state.filters).toMatchObject({
      query: "ford",
      sellerState: "FL",
      sellerCity: "Miami",
      yearMin: YEAR_MIN,
      yearMax: YEAR_MAX,
    });
    expect(state.sort).toBe("year_desc");
    expect(state.page).toBe(3);
  });

  it("round-trips the server-backed recently-added sort used by new-arrival blocks", () => {
    expect(encodeVehicleUrlState(DEFAULT_FILTERS, "created_desc", 1)).toBe(
      "#vehicles?sort=created_desc",
    );
    window.history.replaceState(null, "", "#vehicles?sort=created_desc");
    expect(readVehicleUrlState().sort).toBe("created_desc");
  });
});
