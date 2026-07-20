import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  findDuplicates,
  isSafeExternalImageUrl,
  parseAdditionalImageUrls,
  parseCsv,
  parseVehicleCsv,
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

describe("feed header aliases", () => {
  it("maps brand/image_link/id/color/condition to native fields", () => {
    const result = parseVehicleCsv(
      [
        "id,brand,model,year,price,color,condition,image_link",
        "feed-1,FORD,ESCAPE,2018,10956.00 USD,GOLD,used,https://cdn.example.com/a.jpg",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      external_id: "feed-1",
      make: "FORD",
      model: "ESCAPE",
      price: 10956,
      exterior_color: "GOLD",
      stock_type: "Used",
      image_src: "https://cdn.example.com/a.jpg",
    });
  });

  it("native headers win over their feed aliases", () => {
    const result = parseVehicleCsv(
      [
        "year,make,brand,model,price,image_src,image_link,external_id,id,exterior_color,color,stock_type,condition",
        "2020,NativeMake,AliasBrand,X,1000,https://native.example.com/a.jpg,https://alias.example.com/b.jpg,native-id,alias-id,NativeColor,AliasColor,Certified,used",
      ].join("\n"),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      make: "NativeMake",
      image_src: "https://native.example.com/a.jpg",
      external_id: "native-id",
      exterior_color: "NativeColor",
      stock_type: "Certified",
    });
  });

  it("a brand-only feed satisfies the make requirement", () => {
    const result = parseVehicleCsv("brand,model,year,price\nFord,Escape,2020,9000");
    expect(result.errors).toEqual([]);
    expect(result.rows[0]?.make).toBe("Ford");
  });
});

describe("feed value normalization", () => {
  const header = "year,make,model,price,mileage,condition";

  it('parses "10956.00 USD" and "102598 MILES"', () => {
    const result = parseVehicleCsv(`${header}\n2018,Ford,Escape,10956.00 USD,102598 MILES,used`);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({ price: 10956, mileage: 102598, stock_type: "Used" });
  });

  it("maps new/used case-insensitively and passes unknown conditions through", () => {
    const result = parseVehicleCsv(
      `${header}\n2018,Ford,Escape,9000,,NEW\n2019,Ford,Edge,9500,,Certified pre-owned`,
    );
    expect(result.rows[0]?.stock_type).toBe("New");
    expect(result.rows[1]?.stock_type).toBe("Certified pre-owned");
  });

  it("does not silently zero fundamentally invalid numbers", () => {
    const result = parseVehicleCsv(`${header}\n2018,Ford,Escape,call for price,,used`);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.message).toContain("invalid price");
  });

  it("keeps a missing required price a row-level error", () => {
    const result = parseVehicleCsv(`${header}\n2018,Ford,Escape,,,used`);
    expect(result.rows).toEqual([]);
    expect(result.errors[0]?.line).toBe(2);
  });
});

describe("image URL policy", () => {
  it("accepts only well-formed https URLs without credentials", () => {
    expect(isSafeExternalImageUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isSafeExternalImageUrl("http://cdn.example.com/a.jpg")).toBe(false);
    expect(isSafeExternalImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeExternalImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isSafeExternalImageUrl("blob:https://example.com/x")).toBe(false);
    expect(isSafeExternalImageUrl("/var/tmp/a.jpg")).toBe(false);
    expect(isSafeExternalImageUrl("not a url")).toBe(false);
    expect(isSafeExternalImageUrl("https://user:pass@cdn.example.com/a.jpg")).toBe(false);
  });
});

describe("feed image import", () => {
  const header = "year,make,model,price,image_link,additional_image_link";

  it("uses a valid image_link as the primary image", () => {
    const result = parseVehicleCsv(
      `${header}\n2018,Ford,Escape,9000,https://cdn.example.com/a.jpg,`,
    );
    expect(result.rows[0]?.image_src).toBe("https://cdn.example.com/a.jpg");
    expect(result.rowImages[0]).toEqual({
      primary: "https://cdn.example.com/a.jpg",
      additionalCount: 0,
      rejectedCount: 0,
    });
  });

  it("parses quoted additional_image_link lists, dedupes, and removes the primary", () => {
    const result = parseVehicleCsv(
      `${header}\n2018,Ford,Escape,9000,https://cdn.example.com/a.jpg,"https://cdn.example.com/a.jpg,https://cdn.example.com/b.jpg, https://cdn.example.com/b.jpg ,https://cdn.example.com/c.jpg"`,
    );
    expect(result.errors).toEqual([]);
    expect(result.rowImages[0]).toEqual({
      primary: "https://cdn.example.com/a.jpg",
      additionalCount: 2, // b + c: primary removed, duplicate b removed
      rejectedCount: 0,
    });
  });

  it("falls back to the first valid additional image when the primary is missing", () => {
    const result = parseVehicleCsv(
      `${header}\n2018,Ford,Escape,9000,,"https://cdn.example.com/b.jpg,https://cdn.example.com/c.jpg"`,
    );
    expect(result.rows[0]?.image_src).toBe("https://cdn.example.com/b.jpg");
    expect(result.rowImages[0]).toMatchObject({ additionalCount: 1 });
  });

  it("demotes invalid image URLs to warnings without failing the row", () => {
    const result = parseVehicleCsv(
      `${header}\n2018,Ford,Escape,9000,javascript:alert(1),"http://insecure.example.com/x.jpg,https://cdn.example.com/ok.jpg"`,
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    // Invalid primary rejected; first valid additional promoted to primary.
    expect(result.rows[0]?.image_src).toBe("https://cdn.example.com/ok.jpg");
    expect(result.rowImages[0]).toEqual({
      primary: "https://cdn.example.com/ok.jpg",
      additionalCount: 0,
      rejectedCount: 2,
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.message).toContain("rejected");
    expect(result.warnings[0]?.line).toBe(2);
  });

  it("leaves the vehicle photo-less (placeholder) when nothing valid exists", () => {
    const result = parseVehicleCsv(`${header}\n2018,Ford,Escape,9000,,`);
    expect(result.rows[0]?.image_src).toBe("");
    expect(result.rowImages[0]).toEqual({ primary: null, additionalCount: 0, rejectedCount: 0 });
  });
});

describe("parseAdditionalImageUrls", () => {
  it("trims, drops empties, validates, dedupes, and excludes the primary", () => {
    const { urls, rejected } = parseAdditionalImageUrls(
      " https://a.example.com/1.jpg ,, https://a.example.com/1.jpg ,ftp://bad,https://b.example.com/2.jpg",
      "https://b.example.com/2.jpg",
    );
    expect(urls).toEqual(["https://a.example.com/1.jpg"]);
    expect(rejected).toBe(1);
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
