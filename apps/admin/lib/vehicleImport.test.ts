import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, parseCsv, parseVehicleCsv } from "./vehicleImport";

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
});
