import { describe, expect, it } from "vitest";
import type { Vehicle } from "@lume/types";
import {
  extractVehicleFilters,
  isVehicleQuery,
  matchVehicles,
  mergeTrustedVehicleQuery,
  vehicleQueryFromFilters,
} from "./vehicleFilters";

const mercedes = (id: string, model: string): Vehicle => ({
  id,
  tenantId: "tenant-demo",
  stockType: "Used",
  year: 2021,
  make: "Mercedes-Benz",
  model,
  trim: "",
  price: 75_000,
  mileage: 25_000,
  bodyStyle: "Sedan",
  exteriorColor: "Black",
  interiorColor: "Black",
  drivetrain: "AWD",
  fuelType: "Gasoline",
  imageSrc: "",
  sellerCity: "Miami",
  sellerState: "FL",
  isSpecial: false,
  status: "live",
  soldAt: null,
  soldPrice: null,
});

describe("vehicle query intent", () => {
  it.each([
    "do you have any mercedes",
    "show me Mercedes-Benz vehicles",
    "do you have BMWs",
    "show me Ferraris",
    "browse Land Rovers",
  ])("recognizes make aliases and plurals in %j", (query) => {
    expect(isVehicleQuery(query)).toBe(true);
  });

  it("does not mistake a make substring inside an unrelated word for intent", () => {
    expect(isVehicleQuery("What does your program include?")).toBe(false);
  });

  it("uses the tenant vocabulary for exact make casing and model names", () => {
    expect(
      extractVehicleFilters(
        "Do you have a Mercedes GLC 300 in Miami?",
        [],
        {
          makes: ["Mercedes-Benz", "BMW"],
          models: ["GLB 250", "GLC 300"],
          states: ["FL"],
          cities: ["Miami"],
        },
      ),
    ).toMatchObject({
      make: "Mercedes-Benz",
      model: "GLC 300",
      sellerCity: "Miami",
    });
  });

  it("formats a canonical make safely when no catalog vocabulary is available", () => {
    expect(extractVehicleFilters("any mercedes?").make).toBe("Mercedes-Benz");
    expect(extractVehicleFilters("any bmws?").make).toBe("BMW");
  });

  it("does not interpret 'take me to' as the state code ME", () => {
    expect(
      extractVehicleFilters(
        "Take me to the 2020 BMW X3 xDrive30i",
        [],
        {
          makes: ["BMW"],
          models: ["X1", "X3"],
          states: ["ME", "MN", "FL"],
        },
      ),
    ).toEqual({
      make: "BMW",
      model: "X3",
      year: 2020,
    });
  });

  it("still recognizes explicit state abbreviations and full state names", () => {
    expect(
      extractVehicleFilters("Find BMWs in ME", [], {
        makes: ["BMW"],
        states: ["ME"],
      }).sellerState,
    ).toBe("ME");
    expect(
      extractVehicleFilters("Find BMWs in Maine", [], {
        makes: ["BMW"],
        states: ["ME"],
      }).sellerState,
    ).toBe("ME");
  });

  it("grounds exact price and mileage anchors from the visitor message", () => {
    expect(
      extractVehicleFilters(
        "Take me to the 2020 BMW X3 xDrive30i — 54,153 miles — $108,500",
        [],
        { makes: ["BMW"], models: ["X3"] },
      ),
    ).toEqual({
      make: "BMW",
      model: "X3",
      year: 2020,
      mileageMax: 54_153,
      priceMin: 108_500,
      priceMax: 108_500,
    });
  });
});

describe("vehicle filter grounding", () => {
  it("matches a Mercedes alias against stored Mercedes-Benz rows", () => {
    const result = matchVehicles(
      [mercedes("one", "GLB 250"), mercedes("two", "GLC 300")],
      { make: "Mercedes" },
      "do you have any Mercedes",
    );

    expect(result.totalMatched).toBe(2);
    expect(result.results.map((vehicle) => vehicle.id)).toEqual(["one", "two"]);
  });

  it("maps one model year to an exact server-side range", () => {
    expect(
      vehicleQueryFromFilters({
        make: "Mercedes-Benz",
        model: "GLC 300",
        year: 2022,
        sellerState: "FL",
      }),
    ).toEqual({
      make: "Mercedes-Benz",
      model: "GLC 300",
      yearMin: 2022,
      yearMax: 2022,
      sellerState: "FL",
    });
  });

  it("drops constraints invented by the model while retaining safe controls", () => {
    expect(
      mergeTrustedVehicleQuery(
        {
          make: "BMW",
          model: "X1",
          yearMin: 2018,
          yearMax: 2018,
          sellerState: "ME",
          mileageMax: 54_151,
          sort: "year_desc",
          limit: 12,
        },
        {
          make: "BMW",
          model: "X1",
          yearMin: 2019,
          yearMax: 2019,
        },
      ),
    ).toEqual({
      make: "BMW",
      model: "X1",
      yearMin: 2019,
      yearMax: 2019,
      sort: "year_desc",
      limit: 12,
    });
  });

  it("lets trusted numeric anchors replace drifting model values", () => {
    const trusted = vehicleQueryFromFilters(
      extractVehicleFilters(
        "Take me to the 2020 BMW X3 xDrive30i — 54,153 miles — $108,500",
        [],
        { makes: ["BMW"], models: ["X3"], states: ["ME", "MN"] },
      ),
    );
    expect(
      mergeTrustedVehicleQuery(
        {
          make: "BMW",
          model: "X3",
          yearMin: 2020,
          yearMax: 2020,
          sellerState: "ME",
          mileageMax: 54_151,
          priceMin: 108_500,
          priceMax: 108_500,
          limit: 12,
        },
        trusted,
      ),
    ).toEqual({
      make: "BMW",
      model: "X3",
      yearMin: 2020,
      yearMax: 2020,
      mileageMax: 54_153,
      priceMin: 108_500,
      priceMax: 108_500,
      limit: 12,
    });
  });
});
