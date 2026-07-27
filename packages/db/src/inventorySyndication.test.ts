import { describe, expect, it } from "vitest";
import type { Vehicle } from "@lume/types";
import {
  INVENTORY_SYNDICATION_MAX_FIELDS,
  INVENTORY_SYNDICATION_MAX_RECORDS,
  INVENTORY_SYNDICATION_MAX_TEXT_LENGTH,
  InventorySyndicationValidationError,
  createInventorySyndicationOutput,
  isInventorySyndicationUnchanged,
  mapVehiclesForInventorySyndication,
  serializeInventorySyndication,
  validateInventorySyndicationProfile,
  validateInventorySyndicationVehicles,
  type InventorySyndicationProfile,
} from "./inventorySyndication";

function vehicle(overrides: Partial<Vehicle> = {}): Vehicle {
  return {
    id: "vehicle-b",
    tenantId: "tenant-1",
    externalId: "STOCK-20",
    feedVin: "1HGBH41JXMN109186",
    feedImageUrls: [
      "https://supplier.example/2.jpg",
      "https://supplier.example/1.jpg",
    ],
    stockType: "Used",
    year: 2024,
    make: 'LUME, "Motors"',
    model: "Grand Tourer",
    trim: "Sport & Track",
    price: 68500,
    mileage: 1200,
    bodyStyle: "Coupe",
    exteriorColor: "Black",
    interiorColor: "Tan",
    drivetrain: "AWD",
    fuelType: "Gasoline",
    imageSrc: "https://supplier.example/1.jpg",
    primaryImageSrc: "https://r2.example/primary.jpg",
    sellerCity: "Los Angeles",
    sellerState: "CA",
    isSpecial: false,
    status: "live",
    soldAt: null,
    soldPrice: null,
    ...overrides,
  };
}

const baseProfile: InventorySyndicationProfile = {
  format: "csv",
  fields: [
    { name: "stock_number", source: "stockNumber" },
    { name: "vin", source: "vin" },
    { name: "year", source: "year" },
    { name: "make", source: "make" },
    { name: "price", source: "price" },
    { name: "image_urls", source: "imageUrls" },
  ],
};

describe("inventory syndication mapping", () => {
  it("maps only allow-listed fields in profile order and sorts without mutating input", () => {
    const later = vehicle({ id: "vehicle-z", externalId: "Z-1" });
    const earlier = vehicle({
      id: "vehicle-a",
      externalId: "A-1",
      make: "A Motors",
    });
    const input = [later, earlier];

    const records = mapVehiclesForInventorySyndication(input, baseProfile);

    expect(input.map((item) => item.id)).toEqual(["vehicle-z", "vehicle-a"]);
    expect(records).toEqual([
      {
        stock_number: "A-1",
        vin: "1HGBH41JXMN109186",
        year: 2024,
        make: "A Motors",
        price: 68500,
        image_urls: [
          "https://r2.example/primary.jpg",
          "https://supplier.example/2.jpg",
          "https://supplier.example/1.jpg",
        ],
      },
      {
        stock_number: "Z-1",
        vin: "1HGBH41JXMN109186",
        year: 2024,
        make: 'LUME, "Motors"',
        price: 68500,
        image_urls: [
          "https://r2.example/primary.jpg",
          "https://supplier.example/2.jpg",
          "https://supplier.example/1.jpg",
        ],
      },
    ]);
  });

  it("keeps the full ordered managed R2 gallery ahead of supplier images", () => {
    const records = mapVehiclesForInventorySyndication([
      vehicle({
        managedImageUrls: [
          "https://r2.example/primary.jpg",
          "https://r2.example/detail.jpg",
        ],
      }),
    ], baseProfile);

    expect(records[0]?.image_urls).toEqual([
      "https://r2.example/primary.jpg",
      "https://r2.example/detail.jpg",
      "https://supplier.example/2.jpg",
      "https://supplier.example/1.jpg",
    ]);
  });

  it("accepts and exports the complete supported 20-image R2 plus 50-image supplier gallery", () => {
    const managedImageUrls = Array.from({ length: 20 }, (_, index) => `https://r2.example/${index}.jpg`);
    const feedImageUrls = Array.from({ length: 50 }, (_, index) => `https://supplier.example/${index}.jpg`);
    const records = mapVehiclesForInventorySyndication([
      vehicle({
        primaryImageSrc: managedImageUrls[0],
        managedImageUrls,
        feedImageUrls,
        imageSrc: "https://legacy.example/fallback.jpg",
      }),
    ], baseProfile);

    const imageUrls = records[0]?.image_urls;
    if (!Array.isArray(imageUrls)) throw new Error("expected image URL array");
    expect(imageUrls).toHaveLength(71);
    expect(imageUrls[0]).toBe("https://r2.example/0.jpg");
    expect(imageUrls[imageUrls.length - 1]).toBe("https://legacy.example/fallback.jpg");
  });

  it("uses scalar literals without allowing expressions or object traversal", () => {
    const profile: InventorySyndicationProfile = {
      format: "json",
      fields: [
        { name: "vehicle_id", source: "vehicleId" },
        { name: "provider", value: "lume" },
        { name: "active", value: true },
      ],
    };

    expect(mapVehiclesForInventorySyndication([vehicle()], profile)).toEqual([
      { vehicle_id: "vehicle-b", provider: "lume", active: true },
    ]);

    const issues = validateInventorySyndicationProfile({
      format: "json",
      fields: [
        { name: "bad", source: "make.toUpperCase()" },
        { name: "bad", value: { expression: "vehicle.make" } },
        { name: "constructor", value: "no" },
      ],
      deliveryUrl: "https://unrelated.example",
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "profile.unknown_key",
        "profile.source",
        "profile.literal",
        "profile.duplicate_field_name",
        "profile.field_name",
      ]),
    );
  });

  it("rejects credential-like output fields so secrets cannot enter tenant-readable profiles", () => {
    const issues = validateInventorySyndicationProfile({
      format: "json",
      fields: [
        { name: "api_key", value: "do-not-store-a-secret-here" },
        { name: "authorization", value: "Bearer also-not-allowed" },
      ],
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["profile.sensitive_field"]),
    );
  });
});

describe("inventory syndication serialization", () => {
  it("uses profile header order, RFC 4180 escaping, and CSV formula neutralization", () => {
    const profile: InventorySyndicationProfile = {
      format: "csv",
      fields: [
        { name: "make", source: "make" },
        { name: "trim", source: "trim" },
        { name: "formula", value: "=SUM(A1:A9)" },
      ],
    };
    const records = mapVehiclesForInventorySyndication(
      [vehicle({ make: 'LUME, "Motors"\nNorth', trim: "Sport & Track" })],
      profile,
    );

    expect(serializeInventorySyndication(records, profile)).toBe(
      'make,trim,formula\r\n"LUME, ""Motors""\nNorth",Sport & Track,\'=SUM(A1:A9)',
    );
  });

  it("preserves explicit field order in JSON and optional JSON wrappers", () => {
    const profile: InventorySyndicationProfile = {
      format: "json",
      jsonRoot: "inventory",
      fields: [
        { name: "price", source: "price" },
        { name: "stock", source: "stockNumber" },
        { name: "images", source: "imageUrls" },
      ],
    };
    const records = mapVehiclesForInventorySyndication([vehicle()], profile);

    expect(serializeInventorySyndication(records, profile)).toBe(
      '{"inventory":[{"price":68500,"stock":"STOCK-20","images":["https://r2.example/primary.jpg","https://supplier.example/2.jpg","https://supplier.example/1.jpg"]}]}',
    );
  });

  it("escapes XML text and uses configured safe XML element names", () => {
    const profile: InventorySyndicationProfile = {
      format: "xml",
      xmlRoot: "inventory-feed",
      xmlRecord: "listing",
      fields: [
        { name: "trim", source: "trim" },
        { name: "mileage", source: "mileage" },
      ],
    };
    const records = mapVehiclesForInventorySyndication(
      [vehicle({ trim: 'Sport & <Track> "Edition"\'', mileage: null })],
      profile,
    );

    expect(serializeInventorySyndication(records, profile)).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><inventory-feed><listing><trim>Sport &amp; &lt;Track&gt; &quot;Edition&quot;&apos;</trim><mileage></mileage></listing></inventory-feed>',
    );
  });

  it("rejects XML-invalid controls rather than producing an invalid XML document", () => {
    const profile: InventorySyndicationProfile = {
      format: "xml",
      fields: [{ name: "trim", source: "trim" }],
    };
    const records = mapVehiclesForInventorySyndication(
      [vehicle({ trim: "Sport\u0000" })],
      profile,
    );

    expect(() => serializeInventorySyndication(records, profile)).toThrow(
      InventorySyndicationValidationError,
    );
  });
});

describe("inventory syndication semantic hashes", () => {
  it("is stable across incidental source ordering and changes when exported semantics change", async () => {
    const first = vehicle({ id: "vehicle-a", price: 50000 });
    const second = vehicle({ id: "vehicle-z", price: 60000 });
    const firstOutput = await createInventorySyndicationOutput(
      [second, first],
      baseProfile,
    );
    const sameOutput = await createInventorySyndicationOutput(
      [first, second],
      baseProfile,
    );
    const changedOutput = await createInventorySyndicationOutput(
      [first, vehicle({ id: "vehicle-z", price: 60001 })],
      baseProfile,
    );

    expect(sameOutput.content).toBe(firstOutput.content);
    expect(sameOutput.semanticHash).toBe(firstOutput.semanticHash);
    expect(changedOutput.semanticHash).not.toBe(firstOutput.semanticHash);
    expect(
      isInventorySyndicationUnchanged(firstOutput.semanticHash, sameOutput),
    ).toBe(true);
    expect(isInventorySyndicationUnchanged(null, sameOutput)).toBe(false);
  });
});

describe("inventory syndication bounds", () => {
  it("reports field-count, literal-size, duplicate-identity, and record-count bounds", () => {
    const fields = Array.from(
      { length: INVENTORY_SYNDICATION_MAX_FIELDS + 1 },
      (_, index) => ({
        name: `field_${index}`,
        value: "ok",
      }),
    );
    const profileIssues = validateInventorySyndicationProfile({
      format: "csv",
      fields,
    });
    expect(profileIssues.map((issue) => issue.code)).toContain(
      "profile.field_count",
    );

    const literalIssues = validateInventorySyndicationProfile({
      format: "json",
      fields: [
        {
          name: "label",
          value: "x".repeat(INVENTORY_SYNDICATION_MAX_TEXT_LENGTH + 1),
        },
      ],
    });
    expect(literalIssues.map((issue) => issue.code)).toContain(
      "profile.literal",
    );

    const duplicateIssues = validateInventorySyndicationVehicles([
      vehicle(),
      vehicle(),
    ]);
    expect(duplicateIssues.map((issue) => issue.code)).toContain(
      "vehicle.duplicate_id",
    );

    const tooMany = Array.from(
      { length: INVENTORY_SYNDICATION_MAX_RECORDS + 1 },
      (_, index) => vehicle({ id: `vehicle-${index}` }),
    );
    expect(
      validateInventorySyndicationVehicles(tooMany).map((issue) => issue.code),
    ).toContain("vehicles.too_many");
  });
});
