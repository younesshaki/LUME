/**
 * CSV → vehicle rows for the admin bulk import (onboarding-backlog item 2).
 *
 * Column contract (header names case-insensitive; snake_case or camelCase):
 *   required: year, make, model, price
 *   optional: trim, mileage, body_style, exterior_color, interior_color,
 *             drivetrain, fuel_type, image_src, seller_city, seller_state,
 *             stock_type, external_id, is_special, special_image_src
 *
 * Feed-style aliases (native LUME headers always win when both exist):
 *   brand → make · image_link → image_src · id → external_id ·
 *   color → exterior_color · condition → stock_type
 * plus `additional_image_link`: a quoted, comma-separated URL list used for
 * the import preview (parsed/validated/deduped, never persisted to
 * vehicle_images — that table is managed R2 objects only).
 *
 * Only standard comma-separated CSV is supported. Tab-delimited exports are
 * rejected with a clear message — never silently reinterpreted.
 *
 * Unknown columns are ignored. Rows failing validation are reported with
 * their line number and skipped — a partially valid file imports the valid
 * rows (the UI shows the error list before committing). Invalid image URLs
 * demote to row *warnings*: the vehicle still imports, just without that
 * image.
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

/** Per-imported-row photo summary for the preview UI. Parallel to `rows`. */
export type VehicleImportRowImages = {
  /** Resolved primary external image URL (persisted via vehicles.image_src). */
  primary: string | null;
  /** Valid additional URLs after dedupe, with the primary removed. */
  additionalCount: number;
  /** Image URLs rejected by the HTTPS-only safety policy. */
  rejectedCount: number;
};

export type VehicleImportResult = {
  rows: VehicleImportInsert[];
  /** Parallel to `rows`. */
  rowImages: VehicleImportRowImages[];
  errors: VehicleImportRowError[];
  /** Non-blocking problems (e.g. an invalid image URL on a valid row). */
  warnings: VehicleImportRowError[];
  /** Headers that matched the contract, in file order (canonical names). */
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

/** Canonical column key ← accepted NATIVE header spellings (lowercased). */
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

/**
 * Feed-style aliases (Google vehicle feed and similar exports). A feed alias
 * only applies when the file does NOT also contain the native header for the
 * same canonical key — native always wins.
 */
const FEED_HEADER_ALIASES: Record<string, string> = {
  brand: "make",
  image_link: "image_src",
  imagelink: "image_src",
  id: "external_id",
  color: "exterior_color",
  condition: "stock_type",
  additional_image_link: "additional_image_link",
  additionalimagelink: "additional_image_link",
};

const REQUIRED_COLUMNS = ["year", "make", "model", "price"] as const;

/**
 * HTTPS-only external image URL policy. Rejects javascript:, data:, blob:,
 * http:, filesystem paths, malformed URLs, and embedded credentials.
 */
export function isSafeExternalImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && Boolean(url.hostname);
}

/**
 * Parse a feed `additional_image_link` value (already CSV-decoded) into
 * validated, deduplicated URLs with the primary removed.
 */
export function parseAdditionalImageUrls(
  value: string,
  primary: string | null,
): { urls: string[]; rejected: number } {
  const seen = new Set<string>();
  const urls: string[] = [];
  let rejected = 0;
  for (const entry of value.split(",")) {
    const candidate = entry.trim();
    if (!candidate) continue;
    if (!isSafeExternalImageUrl(candidate)) {
      rejected++;
      continue;
    }
    if (seen.has(candidate) || candidate === primary) continue;
    seen.add(candidate);
    urls.push(candidate);
  }
  return { urls, rejected };
}

type ColumnBinding = { key: string; native: boolean } | null;

export function parseVehicleCsv(text: string): VehicleImportResult {
  const empty = (errors: VehicleImportRowError[]): VehicleImportResult => ({
    rows: [],
    rowImages: [],
    errors,
    warnings: [],
    recognizedHeaders: [],
  });

  // UTF-8 BOM from spreadsheet exports.
  const cleanText = text.replace(/^\uFEFF/, "");
  const table = parseCsv(cleanText);
  if (table.length === 0) {
    return empty([{ line: 1, message: "File is empty." }]);
  }

  // Tab-delimited exports parse as one giant comma-less column. Refuse them
  // clearly instead of silently importing garbage.
  if (table[0].length === 1 && table[0][0].includes("\t")) {
    return empty([
      {
        line: 1,
        message:
          "This file looks tab-separated. LUME imports require a standard comma-separated CSV — re-export the file as CSV (comma delimited) and try again.",
      },
    ]);
  }

  const headerCells = table[0].map((h) => h.trim().toLowerCase());
  const nativeKeys = new Set(
    headerCells.map((h) => HEADER_ALIASES[h]).filter((k): k is string => Boolean(k)),
  );
  const columns: ColumnBinding[] = headerCells.map((h) => {
    const native = HEADER_ALIASES[h];
    if (native) return { key: native, native: true };
    const alias = FEED_HEADER_ALIASES[h];
    // Native header wins: ignore the alias column entirely when both exist.
    if (alias && !nativeKeys.has(alias)) return { key: alias, native: false };
    return null;
  });
  const recognizedHeaders = columns
    .filter((c): c is NonNullable<ColumnBinding> => c !== null)
    .map((c) => c.key);

  const missing = REQUIRED_COLUMNS.filter((c) => !recognizedHeaders.includes(c));
  if (missing.length > 0) {
    return {
      ...empty([{ line: 1, message: `Missing required column(s): ${missing.join(", ")}.` }]),
      recognizedHeaders,
    };
  }

  // Whether stock_type arrives via the feed `condition` alias (normalized
  // to LUME's New/Used convention); native stock_type passes through as-is.
  const stockTypeFromCondition =
    !nativeKeys.has("stock_type") && headerCells.includes("condition");

  const dataRows = table.slice(1);
  const errors: VehicleImportRowError[] = [];
  const warnings: VehicleImportRowError[] = [];
  if (dataRows.length > MAX_IMPORT_ROWS) {
    errors.push({
      line: 1,
      message: `File has ${dataRows.length} rows; only the first ${MAX_IMPORT_ROWS} will be imported.`,
    });
  }

  const rows: VehicleImportInsert[] = [];
  const rowImages: VehicleImportRowImages[] = [];
  dataRows.slice(0, MAX_IMPORT_ROWS).forEach((cells, index) => {
    const line = index + 2;
    const record: Record<string, string> = {};
    columns.forEach((column, i) => {
      if (column) record[column.key] = (cells[i] ?? "").trim();
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

    // ── Photos: primary from image_src (native wins over image_link via the
    // header binding above), else first valid additional URL. Invalid URLs
    // are row warnings, never row failures.
    let rejected = 0;
    let primary: string | null = null;
    if (record.image_src) {
      if (isSafeExternalImageUrl(record.image_src)) primary = record.image_src;
      else rejected++;
    }
    const additional = record.additional_image_link
      ? parseAdditionalImageUrls(record.additional_image_link, primary)
      : { urls: [], rejected: 0 };
    rejected += additional.rejected;
    let additionalUrls = additional.urls;
    if (!primary && additionalUrls.length > 0) {
      primary = additionalUrls[0];
      additionalUrls = additionalUrls.slice(1);
    }
    if (rejected > 0) {
      warnings.push({
        line,
        message: `${rejected} image URL${rejected === 1 ? "" : "s"} rejected (only well-formed https:// URLs are accepted); the vehicle still imports.`,
      });
    }

    const stockType = record.stock_type
      ? stockTypeFromCondition
        ? normalizeFeedCondition(record.stock_type)
        : record.stock_type
      : null;

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
      image_src: primary ?? "",
      seller_city: record.seller_city ?? "",
      seller_state: record.seller_state ?? "",
      stock_type: stockType,
      external_id: record.external_id || null,
      is_special: parseBoolean(record.is_special),
      special_image_src: record.special_image_src || null,
    });
    rowImages.push({
      primary,
      additionalCount: additionalUrls.length,
      rejectedCount: rejected,
    });
  });

  return { rows, rowImages, errors, warnings, recognizedHeaders };
}

/** Feed `condition` values → LUME stock-type convention ("New"/"Used"). */
function normalizeFeedCondition(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "new") return "New";
  if (normalized === "used") return "Used";
  return value.trim();
}

/**
 * Duplicate detection for re-uploads (the import is otherwise append-only
 * and doubles inventory). A CSV row duplicates an existing vehicle when:
 *   - both have an external_id and they match (case-insensitive), else
 *   - year + make + model + trim + mileage all match (strings normalized).
 */
export type VehicleFingerprint = {
  external_id: string | null;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  mileage: number | null;
};

export type DuplicateReason = "external_id" | "attributes";

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
  const byAttributes = new Set<string>();
  for (const vehicle of existing) {
    if (vehicle.external_id) byExternalId.add(norm(vehicle.external_id));
    byAttributes.add(attributeKey(vehicle));
  }

  const duplicates = new Map<number, DuplicateReason>();
  rows.forEach((row, index) => {
    if (row.external_id && byExternalId.has(norm(row.external_id))) {
      duplicates.set(index, "external_id");
      return;
    }
    const fingerprint: VehicleFingerprint = {
      external_id: row.external_id ?? null,
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

function parseIntStrict(value: string | undefined): number | null {
  if (!value || !/^-?\d+$/.test(value)) return null;
  return parseInt(value, 10);
}

/**
 * Feed exports commonly suffix numbers with a currency or distance unit
 * ("10956.00 USD", "102598 MILES"). Strip a single known trailing unit word,
 * then parse strictly — a fundamentally invalid number stays invalid.
 */
const NUMERIC_UNIT_SUFFIX = /\s+(usd|eur|gbp|cad|aud|miles?|mi|kms?)\.?$/i;

function parseNumberStrict(value: string | undefined): number | null {
  if (!value) return null;
  const withoutUnit = value.trim().replace(NUMERIC_UNIT_SUFFIX, "");
  const cleaned = withoutUnit.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

function parseBoolean(value: string | undefined): boolean {
  return value !== undefined && ["true", "1", "yes"].includes(value.toLowerCase());
}
