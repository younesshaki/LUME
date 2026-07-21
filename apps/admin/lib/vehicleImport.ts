/**
 * CSV → vehicle rows for the admin bulk import (onboarding-backlog item 2).
 *
 * Column contract (header names case-insensitive; snake_case or camelCase):
 *   required: year, make, model, price
 *   optional: trim, mileage, body_style, exterior_color, interior_color,
 *             drivetrain, fuel_type, image_src, seller_city, seller_state,
 *             stock_type, external_id, vin, image_list, is_special,
 *             special_image_src. Homenet aliases such as Stock, ImageList,
 *             SellingPrice, and Miles are accepted too.
 *
 * Unknown columns are ignored. Rows failing validation are reported with
 * their line number and skipped — a partially valid file imports the valid
 * rows (the UI shows the error list before committing).
 */
import type { Database } from "@lume/db";
import {
  isSafeFeedVehicleImageUrl,
  MAX_FEED_VEHICLE_IMAGES,
  resolveFeedVehicleImageUrls,
} from "./feedVehicleImages";

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
  brand: "make",
  model: "model",
  trim: "trim",
  price: "price",
  mileage: "mileage",
  body_style: "body_style",
  bodystyle: "body_style",
  exterior_color: "exterior_color",
  exteriorcolor: "exterior_color",
  color: "exterior_color",
  interior_color: "interior_color",
  interiorcolor: "interior_color",
  drivetrain: "drivetrain",
  fuel_type: "fuel_type",
  fueltype: "fuel_type",
  image_src: "image_src",
  imagesrc: "image_src",
  image: "image_src",
  image_link: "image_src",
  imagelink: "image_src",
  additional_image_link: "additional_image_link",
  additionalimagelink: "additional_image_link",
  image_list: "image_list",
  imagelist: "image_list",
  seller_city: "seller_city",
  sellercity: "seller_city",
  city: "seller_city",
  seller_state: "seller_state",
  sellerstate: "seller_state",
  state: "seller_state",
  stock_type: "stock_type",
  stocktype: "stock_type",
  condition: "stock_type",
  external_id: "external_id",
  externalid: "external_id",
  id: "external_id",
  stock: "external_id",
  vin: "feed_vin",
  sellingprice: "price",
  internet_price: "price",
  internetprice: "price",
  miles: "mileage",
  body: "body_style",
  is_special: "is_special",
  isspecial: "is_special",
  special_image_src: "special_image_src",
  specialimagesrc: "special_image_src",
};

const REQUIRED_COLUMNS = ["year", "make", "model", "price"] as const;

export function parseVehicleCsv(text: string): VehicleImportResult {
  // Strip a UTF-8 BOM (common in spreadsheet exports) so the first header
  // isn't silently mangled.
  const table = parseCsv(text.replace(/^\uFEFF/, ""));
  if (table.length === 0) {
    return { rows: [], errors: [{ line: 1, message: "File is empty." }], recognizedHeaders: [] };
  }

  // Tab-delimited exports (e.g. some Homenet feeds) parse as one comma-less
  // column. Refuse them with a clear message instead of failing later with a
  // confusing "missing required column" error or, worse for sync mode,
  // shifting data into the wrong fields.
  if (table[0].length === 1 && table[0][0].includes("\t")) {
    return {
      rows: [],
      errors: [{
        line: 1,
        message:
          "This file looks tab-separated. LUME imports require a standard comma-separated CSV — re-export the file as CSV (comma delimited) and try again.",
      }],
      recognizedHeaders: [],
    };
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

    const feedImageUrls = parseFeedImageUrls(record);
    const resolvedFeedImageUrls = resolveFeedVehicleImageUrls({
      image_src: record.image_src ?? "",
      feed_image_urls: feedImageUrls,
    });

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
      image_src: resolvedFeedImageUrls[0] ?? "",
      feed_image_urls: resolvedFeedImageUrls,
      feed_vin: normalizeVin(record.feed_vin),
      feed_updated_at: null,
      seller_city: record.seller_city ?? "",
      seller_state: record.seller_state ?? "",
      stock_type: normalizeStockType(record.stock_type),
      external_id: record.external_id || null,
      is_special: parseBoolean(record.is_special),
      special_image_src: record.special_image_src || null,
    });
  });

  return { rows, errors, recognizedHeaders };
}

/**
 * Duplicate detection for re-uploads (the import is otherwise append-only
 * and doubles inventory). A CSV row duplicates an existing vehicle when:
 *   - both have an external_id and they match (case-insensitive), else
 *   - year + make + model + trim + mileage all match (strings normalized).
 */
export type VehicleFingerprint = {
  id?: string;
  external_id: string | null;
  feed_vin: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
};

export type DuplicateReason = "feed_vin" | "external_id" | "attributes";

const norm = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

function attributeKey(v: VehicleFingerprint): string {
  return [v.year, norm(v.make), norm(v.model), norm(v.trim), v.mileage ?? ""].join("|");
}

/** Map of CSV row index → why it matches something already in inventory. */
export function findDuplicates(
  rows: VehicleImportInsert[],
  existing: VehicleFingerprint[]
): Map<number, DuplicateReason> {
  const byExternalId = new Set<string>();
  const byVin = new Set<string>();
  const byAttributes = new Set<string>();
  for (const vehicle of existing) {
    if (vehicle.external_id) byExternalId.add(norm(vehicle.external_id));
    if (vehicle.feed_vin) byVin.add(norm(vehicle.feed_vin));
    byAttributes.add(attributeKey(vehicle));
  }

  const duplicates = new Map<number, DuplicateReason>();
  rows.forEach((row, index) => {
    if (row.feed_vin && byVin.has(norm(row.feed_vin))) {
      duplicates.set(index, "feed_vin");
      return;
    }
    if (row.external_id && byExternalId.has(norm(row.external_id))) {
      duplicates.set(index, "external_id");
      return;
    }
    const fingerprint: VehicleFingerprint = {
      external_id: row.external_id ?? null,
      feed_vin: row.feed_vin ?? null,
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim ?? null,
      mileage: row.mileage ?? null,
    };
    if (byAttributes.has(attributeKey(fingerprint))) {
      duplicates.set(index, "attributes");
    }
  });
  return duplicates;
}

export type FeedSyncExistingVehicle = VehicleFingerprint & { id: string };

export type FeedSyncResolution =
  | { status: "update"; vehicleId: string; matchedBy: "feed_vin" | "external_id" }
  | { status: "create" }
  | { status: "conflict"; message: string };

/**
 * Safe, stable matching for a feed refresh. We deliberately do not use title
 * attributes here: a sync must never overwrite a similar but different unit.
 */
export function resolveFeedSync(
  rows: VehicleImportInsert[],
  existing: FeedSyncExistingVehicle[],
): Map<number, FeedSyncResolution> {
  const byVin = new Map<string, Set<string>>();
  const byExternalId = new Map<string, Set<string>>();
  for (const vehicle of existing) {
    addMatch(byVin, vehicle.feed_vin, vehicle.id);
    addMatch(byExternalId, vehicle.external_id, vehicle.id);
  }

  const resolved = new Map<number, FeedSyncResolution>();
  rows.forEach((row, index) => {
    const vinMatches = matches(byVin, row.feed_vin);
    const externalMatches = matches(byExternalId, row.external_id);
    if (!row.feed_vin && !row.external_id) {
      resolved.set(index, {
        status: "conflict",
        message: "Feed synchronization requires a VIN or stock number.",
      });
      return;
    }
    const allMatches = new Set([...vinMatches, ...externalMatches]);
    if (allMatches.size > 1) {
      resolved.set(index, {
        status: "conflict",
        message: "VIN and stock number identify different existing vehicles.",
      });
      return;
    }
    const vehicleId = [...allMatches][0];
    if (!vehicleId) {
      resolved.set(index, { status: "create" });
      return;
    }
    resolved.set(index, {
      status: "update",
      vehicleId,
      matchedBy: vinMatches.has(vehicleId) ? "feed_vin" : "external_id",
    });
  });
  return resolved;
}

function parseIntStrict(value: string | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value)) return null;
  return parseInt(value, 10);
}

/**
 * Feed exports commonly suffix numbers with a currency or distance unit
 * ("10956.00 USD", "102598 MILES"). Strip a single known trailing unit word,
 * then parse strictly — a fundamentally invalid number stays invalid (never
 * silently coerced to zero).
 */
const NUMERIC_UNIT_SUFFIX = /\s+(usd|eur|gbp|cad|aud|miles?|mi|kms?)\.?$/i;

function parseNumberStrict(value: string | undefined): number | null {
  if (!value) return null;
  const withoutUnit = value.trim().replace(NUMERIC_UNIT_SUFFIX, "");
  const cleaned = withoutUnit.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Feed `condition`/stock values → LUME stock-type convention ("New"/"Used"). */
function normalizeStockType(value: string | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "new") return "New";
  if (normalized === "used") return "Used";
  return value.trim();
}

function parseBoolean(value: string | undefined): boolean {
  return value !== undefined && ["true", "1", "yes"].includes(value.toLowerCase());
}

function parseFeedImageUrls(record: Record<string, string>): string[] {
  const candidates = [record.image_list, record.additional_image_link]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","));
  const valid = candidates.map((value) => value.trim()).filter(isSafeFeedVehicleImageUrl);
  return [...new Set(valid)].slice(0, MAX_FEED_VEHICLE_IMAGES);
}

function normalizeVin(value: string | undefined): string | null {
  const vin = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin) ? vin : null;
}

function addMatch(index: Map<string, Set<string>>, value: string | null, id: string): void {
  const key = norm(value);
  if (!key) return;
  const values = index.get(key) ?? new Set<string>();
  values.add(id);
  index.set(key, values);
}

function matches(index: Map<string, Set<string>>, value: string | null | undefined): Set<string> {
  return index.get(norm(value)) ?? new Set<string>();
}
