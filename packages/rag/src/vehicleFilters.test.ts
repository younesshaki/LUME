import { describe, expect, it } from "vitest";
import type { Vehicle } from "@lume/types";
import {
  composeVehicleFilterHistory,
  extractVehicleFilters,
  hasVehicleFilterConstraint,
  inheritVehicleFilterContext,
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

  it("does not fuzzy-match the comparison word 'less' as Lexus", () => {
    expect(isVehicleQuery("for less than $40k")).toBe(false);
    expect(extractVehicleFilters("for less than $40k")).toEqual({
      priceMax: 40_000,
    });
    expect(
      extractVehicleFilters("any BMWs for less than $20k"),
    ).toEqual({
      make: "BMW",
      priceMax: 20_000,
    });
  });

  it("does not turn comparison language into a model filter ('compare' -> 'Compass')", () => {
    // Live-reproduced 2026-07-23: "compare the first two" answered
    // "Nothing matches 2026 Compass" — the typo corrector rewrote the
    // ordinary word "compare" into the catalog model "compass" before any
    // model matching ran.
    const vocabulary = { models: ["Compass", "Camry", "Cherokee"] };
    expect(extractVehicleFilters("compare the first two", [], vocabulary)).toEqual({});
    expect(extractVehicleFilters("compare the first and second", [], vocabulary)).toEqual({});
    expect(
      extractVehicleFilters("what is the difference between the first two", [], vocabulary),
    ).toEqual({});
    // An exactly named model still matches exactly.
    expect(extractVehicleFilters("show me the compass", [], vocabulary)).toEqual({
      model: "Compass",
    });
  });

  it("does not fuzzy-match the conjunction 'and' as AWD", () => {
    expect(
      extractVehicleFilters(
        "BMW 5 Series 535i xDrive and BMW 3 Series 328i xDrive",
      ).drivetrain,
    ).toBeUndefined();
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

  it("understands abbreviated prices without a currency symbol", () => {
    expect(extractVehicleFilters("BMWs for less than 20k")).toEqual({
      make: "BMW",
      priceMax: 20_000,
    });
  });

  it.each([
    ["BMWs under 50", { make: "BMW", priceMax: 50_000 }],
    ["BMW inventory below 50 grand", { make: "BMW", priceMax: 50_000 }],
    ["BMWs over 30 thousand", { make: "BMW", priceMin: 30_000 }],
    ["BMWs no more than 50", { make: "BMW", priceMax: 50_000 }],
    ["BMWs within 50k", { make: "BMW", priceMax: 50_000 }],
    ["my BMW budget is 50", { make: "BMW", priceMax: 50_000 }],
    ["BMWs, I have 50k to spend", { make: "BMW", priceMax: 50_000 }],
    ["BMWs, my ceiling is 45 grand", { make: "BMW", priceMax: 45_000 }],
    ["BMWs, I have 60 large available", { make: "BMW", priceMax: 60_000 }],
    ["BMWs under fifty grand", { make: "BMW", priceMax: 50_000 }],
    ["I got a 10k budget", { priceMax: 10_000 }],
    ["budget of 10k", { priceMax: 10_000 }],
    ["looking to spend 10k", { priceMax: 10_000 }],
  ])("understands informal price ceilings and floors: %s", (query, expected) => {
    expect(extractVehicleFilters(query)).toMatchObject(expected);
  });

  it("does not extract a negated make during an all-inventory reset", () => {
    expect(
      extractVehicleFilters(
        "I'm not talking about Toyota, I'm talking in general",
        [],
        { makes: ["Toyota"], models: ["Camry"] },
      ),
    ).toEqual({});
    expect(
      extractVehicleFilters(
        "all inventory under 10k, regardless of make",
        [],
        { makes: ["Toyota"], models: ["Camry"] },
      ),
    ).toEqual({ priceMax: 10_000 });
  });

  it("keeps an affirmative replacement make/model after a negated scope", () => {
    const vocabulary = {
      makes: ["Toyota", "BMW"],
      models: ["Camry", "X5"],
    };
    expect(
      extractVehicleFilters("not Toyota — show me BMWs X5s instead under 70k", [], vocabulary),
    ).toEqual({ make: "BMW", model: "X5", priceMax: 70_000 });
    expect(
      extractVehicleFilters("no Camry, I want an X5", [], vocabulary),
    ).toEqual({ model: "X5" });
  });

  it("keeps a natural budget statement free of fuzzy make/model filters", () => {
    expect(extractVehicleFilters("I got a 10k budget", [], {
      makes: ["Toyota"],
      models: ["Ghost", "Camry"],
    })).toEqual({ priceMax: 10_000 });
  });

  it.each([
    ["BMWs around 50k", { make: "BMW", priceMin: 45_000, priceMax: 55_000 }],
    ["BMW inventory about 50 grand", { make: "BMW", priceMin: 45_000, priceMax: 55_000 }],
    ["show me BMWs $50k-ish", { make: "BMW", priceMin: 45_000, priceMax: 55_000 }],
  ])("turns approximate budgets into a bounded, transparent range: %s", (query, expected) => {
    expect(extractVehicleFilters(query)).toMatchObject(expected);
  });

  it.each([
    ["any BMWs between 30k and 70k", { make: "BMW", priceMin: 30_000, priceMax: 70_000 }],
    ["only show me BMWs between 40k and 55k", { make: "BMW", priceMin: 40_000, priceMax: 55_000 }],
    ["BMWs from 30 grand to 70 grand", { make: "BMW", priceMin: 30_000, priceMax: 70_000 }],
    ["BMW inventory 40 to 55", { make: "BMW", priceMin: 40_000, priceMax: 55_000 }],
    ["BMWs $55k–$40k", { make: "BMW", priceMin: 40_000, priceMax: 55_000 }],
    ["BMWs between thirty and seventy grand", { make: "BMW", priceMin: 30_000, priceMax: 70_000 }],
  ])("grounds natural visitor price ranges: %s", (query, expected) => {
    expect(extractVehicleFilters(query)).toMatchObject(expected);
  });

  it("keeps a year range distinct from a price range", () => {
    expect(extractVehicleFilters("BMWs between 2019 and 2021")).toMatchObject({
      make: "BMW",
      yearMin: 2019,
      yearMax: 2021,
    });
  });

  it("resolves unambiguous make and catalog-model typos", () => {
    expect(extractVehicleFilters("show me ferarri").make).toBe("Ferrari");
    expect(extractVehicleFilters("any bwm").make).toBe("BMW");
    expect(
      extractVehicleFilters("find a cayene", [], { models: ["Cayenne", "Macan"] }),
    ).toMatchObject({ model: "Cayenne" });
  });

  it("recognizes a catalog model without a make", () => {
    const vocabulary = { models: ["911", "Cayenne", "X5"] };
    expect(isVehicleQuery("show me 911s", vocabulary)).toBe(true);
    expect(extractVehicleFilters("show me 911s", [], vocabulary)).toEqual({
      model: "911",
    });
  });

  it("does not mistake a model name for a similarly spelled make alias", () => {
    expect(
      extractVehicleFilters("you have a 2026 camry?", [], {
        makes: ["Toyota", "Cadillac"],
        models: ["Camry", "Escalade"],
      }),
    ).toEqual({ year: 2026, model: "Camry" });
  });

  it("does not turn an ordinal continuation into a fuzzy model filter", () => {
    expect(
      extractVehicleFilters("open the first one", [], { models: ["Fiesta"] }),
    ).toEqual({});
  });

  it("never turns a generic vehicle word into a fuzzy catalog model", () => {
    expect(
      extractVehicleFilters("show cars under 50k", [], { models: ["Camry"] }),
    ).toEqual({ priceMax: 50_000 });
  });

  it("does not let a make alias fuzzy-match a differently-prefixed model", () => {
    // "caddy" is the Cadillac make alias; it must not also become model "Camry"
    // (c-a-dd-y vs c-a-mr-y share only two leading chars).
    expect(
      extractVehicleFilters("what about a caddy?", [], {
        makes: ["Cadillac", "Toyota"],
        models: ["Camry", "Escalade"],
      }),
    ).toEqual({ make: "Cadillac" });
  });

  it("still fuzzy-matches a real model typo that shares the prefix", () => {
    expect(
      extractVehicleFilters("do you have a cayene?", [], { models: ["Cayenne"] }),
    ).toEqual({ model: "Cayenne" });
  });

  it("never turns conversational glue words into a fuzzy catalog model", () => {
    expect(
      extractVehicleFilters("show cars newer than 2020", [], { models: ["Titan"] }),
    ).toMatchObject({ yearMin: 2021 });
    expect(
      extractVehicleFilters("show cars newer than 2020", [], { models: ["Titan"] }).model,
    ).toBeUndefined();
  });

  it("tolerates harmless spacing in short catalog model codes", () => {
    const vocabulary = { models: ["X3", "X5"] };
    expect(extractVehicleFilters("show me X 3s", [], vocabulary)).toEqual({
      model: "X3",
    });
  });

  it("keeps abbreviated mileage distinct from price", () => {
    expect(extractVehicleFilters("BMWs under 20k miles")).toEqual({
      make: "BMW",
      mileageMax: 20_000,
    });
  });

  it("does not interpret a model year as a bare price", () => {
    expect(extractVehicleFilters("BMWs from 2020")).toEqual({
      make: "BMW",
      year: 2020,
    });
    expect(extractVehicleFilters("BMWs at least 2020 model")).toEqual({
      make: "BMW",
      year: 2020,
    });
  });

  it.each([
    ["BMWs between 2019 and 2022", { make: "BMW", yearMin: 2019, yearMax: 2022 }],
    ["BMWs newer than 2020", { make: "BMW", yearMin: 2021 }],
    ["BMWs 2020 or newer", { make: "BMW", yearMin: 2020 }],
    ["BMWs 2020+", { make: "BMW", yearMin: 2020 }],
    ["BMWs before 2020", { make: "BMW", yearMax: 2019 }],
  ])("understands natural model-year ranges: %s", (query, expected) => {
    expect(extractVehicleFilters(query)).toMatchObject(expected);
  });

  it.each([
    ["show me the cheapest BMWs", "price_asc"],
    ["which SUVs are newest", "year_desc"],
    ["show the lowest mileage cars", "mileage_asc"],
  ] as const)("extracts ranking intent: %s", (query, sort) => {
    expect(extractVehicleFilters(query).sort).toBe(sort);
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

  it("maps a relative model-year request to server-side bounds", () => {
    expect(vehicleQueryFromFilters({ make: "BMW", yearMin: 2021 })).toEqual({
      make: "BMW",
      yearMin: 2021,
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

  it("composes a short budget refinement with the active trusted search", () => {
    expect(
      inheritVehicleFilterContext(
        { priceMax: 40_000 },
        { make: "BMW", bodyStyle: "SUV", priceMin: 20_000, priceMax: 70_000 },
      ),
    ).toEqual({
      make: "BMW",
      bodyStyle: "SUV",
      priceMin: 20_000,
      priceMax: 40_000,
    });
  });

  it("does not retain an old model when the visitor names a new make", () => {
    expect(
      inheritVehicleFilterContext(
        { make: "Tesla", priceMax: 40_000 },
        { make: "BMW", model: "X3", year: 2020 },
      ),
    ).toEqual({
      make: "Tesla",
      priceMax: 40_000,
    });
  });

  it("retains all active facets when a visitor adds one refinement", () => {
    expect(
      inheritVehicleFilterContext(
        { drivetrain: "AWD" },
        {
          make: "BMW",
          model: "X3",
          bodyStyle: "SUV",
          stockType: "Used",
          priceMax: 70_000,
          sellerState: "FL",
        },
      ),
    ).toEqual({
      make: "BMW",
      model: "X3",
      bodyStyle: "SUV",
      stockType: "Used",
      priceMax: 70_000,
      sellerState: "FL",
      drivetrain: "AWD",
    });
  });

  it("composes every visitor refinement in a multi-turn shopping search", () => {
    expect(
      composeVehicleFilterHistory([
        "show BMW SUVs under 70k",
        "only AWD ones",
        "in Florida",
      ]),
    ).toMatchObject({
      make: "BMW",
      bodyStyle: "SUV",
      drivetrain: "AWD",
      sellerState: "FL",
      priceMax: 70_000,
    });
  });

  it("resets a composed search when the visitor explicitly names a new make", () => {
    expect(
      composeVehicleFilterHistory([
        "show BMW SUVs under 70k",
        "what about Mercedes under 50k",
      ]),
    ).toMatchObject({ make: "Mercedes-Benz", priceMax: 50_000 });
  });

  it("detects whether a parsed message contains a trusted constraint", () => {
    expect(hasVehicleFilterConstraint({})).toBe(false);
    expect(hasVehicleFilterConstraint({ priceMax: 20_000 })).toBe(true);
  });
});
