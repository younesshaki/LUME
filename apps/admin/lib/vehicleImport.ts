/**
 * CSV → vehicle rows for the admin bulk import (onboarding-backlog item 2).
 *
 * Column contract (header names case-insensitive; snake_case or camelCase):
 *   required: year, make, model, price
 *   optional: trim, mileage, body_style, exterior_color, interior_color,
 *             drivetrain, fuel_type, image_src, seller_city, seller_state,
 *             stock_type, external_id, is_special, special_image_src
 *
 * Unknown columns are ignored. Rows failing validation are reported with
 * their line number and skipped — a partially valid file imports the valid
 * rows (the UI shows the error list before committing).
 */
import type { Database } from "@lume/db";

export type VehicleImportInsert = Omit<
  Database["public"]["Tables"]["vehicles"]["Insert"],
  "tenant_id" | "id"
>;

export type VehicleImportRowError = {
  /** 1-based CSV line number (header = line 1). */
  line: number;
  message: string;
};

export type VehicleImportResult = {
  rows: VehicleImportInsert[];
  errors: VehicleImportRowError[];
  /** Headers that matched the contract, in file order. */
  recognizedHeaders: string[];
};

export const MAX_IMPORT_ROWS = 2_000;

/** Quote-aware CSV parser (RFC-4180-ish: quoted fields, "" escapes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully empty trailing rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Canonical column key ← accepted header spellings (lowercased). */
const HEADER_ALIASES: Record<string, string> = {
  year: "year",
  make: "make",
  model: "model",
  trim: "trim",
  price: "price",
  mileage: "mileage",
  body_style: "body_style",
  bodystyle: "body_style",
  exterior_color: "exterior_color",
  exteriorcolor: "exterior_color",
  interior_color: "interior_color",
  interiorcolor: "interior_color",
  drivetrain: "drivetrain",
  fuel_type: "fuel_type",
  fueltype: "fuel_type",
  image_src: "image_src",
  imagesrc: "image_src",
  image: "image_src",
  seller_city: "seller_city",
  sellercity: "seller_city",
  city: "seller_city",
  seller_state: "seller_state",
  sellerstate: "seller_state",
  state: "seller_state",
  stock_type: "stock_type",
  stocktype: "stock_type",
  external_id: "external_id",
  externalid: "external_id",
  is_special: "is_special",
  isspecial: "is_special",
  special_image_src: "special_image_src",
  specialimagesrc: "special_image_src",
};

const REQUIRED_COLUMNS = ["year", "make", "model", "price"] as const;

export function parseVehicleCsv(text: string): VehicleImportResult {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "File is empty." }], recognizedHeaders: [] };
  }

  const headerCells = table[0].map((h) => h.trim().toLowerCase());
  const columns: Array<string | null> = headerCells.map((h) => HEADER_ALIASES[h] ?? null);
  const recognizedHeaders = columns.filter((c): c is string => c !== null);

  const missing = REQUIRED_COLUMNS.filter((c) => !recognizedHeaders.includes(c));
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [{ line: 1, message: `Missing required column(s): ${missing.join(", ")}.` }],
      recognizedHeaders,
    };
  }

  const dataRows = table.slice(1);
  const errors: VehicleImportRowError[] = [];
  if (dataRows.length > MAX_IMPORT_ROWS) {
    errors.push({
      line: 1,
      message: `File has ${dataRows.length} rows; only the first ${MAX_IMPORT_ROWS} will be imported.`,
    });
  }

  const rows: VehicleImportInsert[] = [];
  dataRows.slice(0, MAX_IMPORT_ROWS).forEach((cells, index) => {
    const line = index + 2;
    const record: Record<string, string> = {};
    columns.forEach((column, i) => {
      if (column) record[column] = (cells[i] ?? "").trim();
    });

    const year = parseIntStrict(record.year);
    const price = parseNumberStrict(record.price);
    const problems: string[] = [];
    if (!record.make) problems.push("make is empty");
    if (!record.model) problems.push("model is empty");
    if (year === null || year < 1900 || year > 2100) problems.push(`invalid year "${record.year}"`);
    if (price === null || price < 0) problems.push(`invalid price "${record.price}"`);

    const mileage = record.mileage ? parseNumberStrict(record.mileage) : null;
    if (record.mileage && mileage === null) problems.push(`invalid mileage "${record.mileage}"`);

    if (problems.length > 0) {
      errors.push({ line, message: problems.join("; ") });
      return;
    }

    rows.push({
      year: year!,
      make: record.make,
      model: record.model,
      trim: record.trim ?? "",
      price: price!,
      mileage,
      body_style: record.body_style ?? "",
      exterior_color: record.exterior_color ?? "",
      interior_color: record.interior_color ?? "",
      drivetrain: record.drivetrain ?? "",
      fuel_type: record.fuel_type ?? "",
      image_src: record.image_src ?? "",
      seller_city: record.seller_city ?? "",
      seller_state: record.seller_state ?? "",
      stock_type: record.stock_type || null,
      external_id: record.external_id || null,
      is_special: parseBoolean(record.is_special),
      special_image_src: record.special_image_src || null,
    });
  });

  return { rows, errors, recognizedHeaders };
}

function parseIntStrict(value: string | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value)) return null;
  return parseInt(value, 10);
}

function parseNumberStrict(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseBoolean(value: string | undefined): boolean {
  return value !== undefined && ["true", "1", "yes"].includes(value.toLowerCase());
}
