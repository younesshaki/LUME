import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  findDuplicates,
  parseCsv,
  parseVehicleCsv,
  resolveFeedSync,
  type VehicleFingerprint,
  type VehicleImportInsert,
} from "./vehicleImport";

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes, and CRLF", () => {
    const text = 'a,"b,1","say ""hi"""\r\nc,d,e\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b,1", 'say "hi"'],
      ["c", "d", "e"],
    ]);
  });

  it("drops empty trailing rows", () => {
    expect(parseCsv("a,b\n1,2\n\n,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseVehicleCsv", () => {
  const header = "Year,Make,Model,Trim,Price,Mileage,bodyStyle,seller_city";

  it("maps aliased headers and coerces numbers", () => {
    const result = parseVehicleCsv(
      `${header}\n2021,Porsche,911,Carrera,"$120,000",8000,Coupe,Monaco`
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      year: 2021,
      make: "Porsche",
      model: "911",
      price: 120000,
      mileage: 8000,
      body_style: "Coupe",
      seller_city: "Monaco",
      is_special: false,
    });
  });

  it("reports invalid rows with line numbers and keeps valid ones", () => {
    const result = parseVehicleCsv(
      `${header}\nbad,Porsche,911,,50000,,,\n2020,,Cayenne,,60000,,,\n2019,Audi,Q7,,55000,,,`
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.make).toBe("Audi");
    expect(result.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(result.errors[0]?.message).toContain("invalid year");
    expect(result.errors[1]?.message).toContain("make is empty");
  });

  it("fails fast on missing required columns", () => {
    const result = parseVehicleCsv("make,model\nPorsche,911");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toContain("year");
    expect(result.errors[0]?.message).toContain("price");
  });

  it("caps at MAX_IMPORT_ROWS with a warning", () => {
    const lines = ["year,make,model,price"];
    for (let i = 0; i < MAX_IMPORT_ROWS + 5; i++) {
      lines.push(`2020,Make${i},Model,1000`);
    }
    const result = parseVehicleCsv(lines.join("\n"));
    expect(result.rows).toHaveLength(MAX_IMPORT_ROWS);
    expect(result.errors[0]?.message).toContain("only the first");
  });

  it("strips a UTF-8 BOM and accepts blank optional fields", () => {
    const result = parseVehicleCsv("﻿year,make,model,price,trim\r\n2020,Ford,Escape,10000,\r\n");
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ make: "Ford", trim: "" });
  });

  it("rejects tab-delimited files with a clear comma-CSV message", () => {
    const result = parseVehicleCsv("year\tmake\tmodel\tprice\n2020\tFord\tEscape\t10000");
    expect(result.rows).toEqual([]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.message).toContain("tab-separated");
    expect(result.errors[0]?.message).toContain("comma-separated CSV");
  });
});

describe("parseVehicleCsv — Google vehicle-feed dialect", () => {
  it("maps brand/color/condition/id/image_link and feed-formatted numbers", () => {
    const result = parseVehicleCsv(
      [
        "id,brand,model,year,price,color,condition,mileage,image_link,additional_image_link",
        'feed-1,FORD,ESCAPE,2018,10956.00 USD,GOLD,used,102598 MILES,https://cdn.example.com/a.jpg,"https://cdn.example.com/a.jpg,https://cdn.example.com/b.jpg"',
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      external_id: "feed-1",
      make: "FORD",
      model: "ESCAPE",
      price: 10956,
      mileage: 102598,
      exterior_color: "GOLD",
      stock_type: "Used",
      image_src: "https://cdn.example.com/a.jpg",
    });
    // The quoted additional_image_link list feeds the external gallery.
    expect(result.rows[0]?.feed_image_urls).toEqual([
      "https://cdn.example.com/a.jpg",
      "https://cdn.example.com/b.jpg",
    ]);
  });

  it("normalizes new/used case-insensitively and passes unknown conditions through", () => {
    const result = parseVehicleCsv(
      "year,make,model,price,condition\n2018,Ford,Escape,9000,NEW\n2019,Ford,Edge,9500,Certified pre-owned",
    );
    expect(result.rows[0]?.stock_type).toBe("New");
    expect(result.rows[1]?.stock_type).toBe("Certified pre-owned");
  });

  it("does not silently zero fundamentally invalid feed numbers", () => {
    const result = parseVehicleCsv("year,make,model,price\n2018,Ford,Escape,call for price");
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toContain("invalid price");
  });
});

describe("findDuplicates", () => {
  const row = (overrides: Partial<VehicleImportInsert>): VehicleImportInsert => ({
    year: 2021,
    make: "Porsche",
    model: "911",
    trim: "Carrera",
    price: 120000,
    mileage: 8000,
    body_style: "Coupe",
    exterior_color: "",
    interior_color: "",
    drivetrain: "",
    fuel_type: "",
    image_src: "",
    feed_image_urls: [],
    feed_vin: null,
    feed_updated_at: null,
    seller_city: "",
    seller_state: "",
    stock_type: null,
    external_id: null,
    is_special: false,
    special_image_src: null,
    ...overrides,
  });
  const existing = (overrides: Partial<VehicleFingerprint>): VehicleFingerprint => ({
    external_id: null,
    feed_vin: null,
    year: 2021,
    make: "Porsche",
    model: "911",
    trim: "Carrera",
    mileage: 8000,
    ...overrides,
  });

  it("matches on external_id first, case-insensitively", () => {
    const duplicates = findDuplicates(
      [row({ external_id: "abc-1", year: 1999, make: "Other" })],
      [existing({ external_id: "ABC-1" })]
    );
    expect(duplicates.get(0)).toBe("external_id");
  });

  it("reads Homenet ImageList into an ordered external gallery", () => {
    const result = parseVehicleCsv([
      "Stock,VIN,Year,Make,Model,SellingPrice,Miles,ImageList",
      'OW26220,4T1K31AK0RU000001,2026,Toyota,Camry,35000,0,"https://images.example/one.jpg,https://images.example/two.jpg"',
    ].join("\n"));
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      external_id: "OW26220",
      feed_vin: "4T1K31AK0RU000001",
      image_src: "https://images.example/one.jpg",
      feed_image_urls: ["https://images.example/one.jpg", "https://images.example/two.jpg"],
    });
  });

  it("falls back to year+make+model+trim+mileage with normalization", () => {
    const duplicates = findDuplicates(
      [row({ make: "  porsche ", trim: "CARRERA" })],
      [existing({})]
    );
    expect(duplicates.get(0)).toBe("attributes");
  });

  it("treats differing mileage or trim as distinct vehicles", () => {
    const duplicates = findDuplicates(
      [row({ mileage: 9000 }), row({ trim: "Carrera S" })],
      [existing({})]
    );
    expect(duplicates.size).toBe(0);
  });

  it("does not attribute-match a CSV row whose external_id is new", () => {
    // Same attributes but a distinct external_id on the CSV side still
    // attribute-matches (the existing row may simply lack an id) — but a
    // fresh external_id against a DIFFERENT existing id never id-matches.
    const duplicates = findDuplicates(
      [row({ external_id: "new-42" })],
      [existing({ external_id: "old-7" })]
    );
    expect(duplicates.get(0)).toBe("attributes");
  });

  it("handles null trims and mileages symmetrically", () => {
    const duplicates = findDuplicates(
      [row({ trim: "", mileage: null })],
      [existing({ trim: null, mileage: null })]
    );
    expect(duplicates.get(0)).toBe("attributes");
  });
});

describe("resolveFeedSync", () => {
  const row = (overrides: Partial<VehicleImportInsert> = {}): VehicleImportInsert => ({
    year: 2024,
    make: "BMW",
    model: "X3",
    trim: "xDrive30i",
    price: 50000,
    mileage: 1000,
    body_style: "SUV",
    exterior_color: "Black",
    interior_color: "Black",
    drivetrain: "AWD",
    fuel_type: "Gasoline",
    image_src: "",
    feed_image_urls: [],
    feed_vin: null,
    feed_updated_at: null,
    seller_city: "",
    seller_state: "",
    stock_type: null,
    external_id: null,
    is_special: false,
    special_image_src: null,
    ...overrides,
  });

  it("matches a stable VIN before a stock number and retains the existing ID", () => {
    const resolved = resolveFeedSync(
      [row({ feed_vin: "5UX53DP04R9T00001", external_id: "NEW-STOCK" })],
      [{ id: "vehicle-a", feed_vin: "5UX53DP04R9T00001", external_id: "OLD-STOCK", year: 2024, make: "BMW", model: "X3", trim: "", mileage: null }],
    );
    expect(resolved.get(0)).toEqual({ status: "update", vehicleId: "vehicle-a", matchedBy: "feed_vin" });
  });

  it("falls back to stock number and refuses rows without a stable identity", () => {
    const resolved = resolveFeedSync(
      [row({ external_id: "OW26220" }), row({ make: "BMW", model: "X3" })],
      [{ id: "vehicle-a", feed_vin: null, external_id: "ow26220", year: 2024, make: "BMW", model: "X3", trim: "xDrive30i", mileage: 1000 }],
    );
    expect(resolved.get(0)).toEqual({ status: "update", vehicleId: "vehicle-a", matchedBy: "external_id" });
    expect(resolved.get(1)).toMatchObject({ status: "conflict" });
  });

  it("refuses a row when VIN and stock number point to different units", () => {
    const resolved = resolveFeedSync(
      [row({ feed_vin: "5UX53DP04R9T00001", external_id: "OW26220" })],
      [
        { id: "vehicle-a", feed_vin: "5UX53DP04R9T00001", external_id: "A", year: 2024, make: "BMW", model: "X3", trim: "", mileage: null },
        { id: "vehicle-b", feed_vin: null, external_id: "OW26220", year: 2024, make: "BMW", model: "X3", trim: "", mileage: null },
      ],
    );
    expect(resolved.get(0)).toMatchObject({ status: "conflict" });
  });

  it("creates a genuinely new vehicle only when it has a stable feed identifier", () => {
    const resolved = resolveFeedSync(
      [row({ external_id: "NEW-STOCK" })],
      [],
    );
    expect(resolved.get(0)).toEqual({ status: "create" });
  });

  it("keeps matching a stable identity beyond a thousand loaded inventory records", () => {
    const existing = Array.from({ length: 1_001 }, (_, index) => ({
      id: `vehicle-${index}`,
      feed_vin: null,
      external_id: index === 1_000 ? "OW26220" : `OTHER-${index}`,
      year: 2024,
      make: "BMW",
      model: "X3",
      trim: "",
      mileage: null,
    }));

    expect(resolveFeedSync([row({ external_id: "ow26220" })], existing).get(0)).toEqual({
      status: "update",
      vehicleId: "vehicle-1000",
      matchedBy: "external_id",
    });
  });
});
