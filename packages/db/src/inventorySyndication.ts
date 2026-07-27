/**
 * Pure inventory syndication primitives.
 *
 * This module deliberately has no database, credential, queue, or network
 * concerns. Callers are responsible for fetching tenant-scoped vehicles and
 * delivering the resulting payload. Keeping mapping and serialization here
 * gives every future delivery mechanism the same deterministic output and
 * semantic no-op detection.
 *
 * Mapping is declarative by design: a profile can select from a small,
 * allow-listed set of vehicle fields or supply a scalar literal. It cannot
 * evaluate expressions, traverse arbitrary object paths, or execute tenant
 * supplied code.
 */
import type { Vehicle } from "@lume/types";

export const INVENTORY_SYNDICATION_MAX_FIELDS = 64;
export const INVENTORY_SYNDICATION_MAX_RECORDS = 10_000;
export const INVENTORY_SYNDICATION_MAX_TEXT_LENGTH = 4_096;
// Managed R2 galleries cap at 20 and supplier galleries at 50. A distinct
// legacy image_src can still appear, so the deterministic export bound must
// accommodate the complete supported LUME gallery (20 + 50 + 1).
export const INVENTORY_SYNDICATION_MAX_IMAGE_URLS = 71;
export const INVENTORY_SYNDICATION_MAX_OUTPUT_BYTES = 25 * 1024 * 1024;

const OUTPUT_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const XML_ELEMENT_NAME = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const FORBIDDEN_OBJECT_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const CSV_FORMULA_PREFIXES = new Set(["=", "+", "-", "@", "\t", "\r"]);
const TEXT_ENCODER = new TextEncoder();
const SENSITIVE_OUTPUT_FIELD_NAME = /(?:authorization|secret|token|password|api[_-]?key)/i;

/**
 * The only vehicle values a tenant-controlled syndication profile may expose.
 * Tenant IDs, internal timestamps, and any unbounded/free-form fields are
 * intentionally not included.
 */
export const INVENTORY_SYNDICATION_SOURCE_FIELDS = [
  "vehicleId",
  "stockNumber",
  "vin",
  "stockType",
  "year",
  "make",
  "model",
  "trim",
  "price",
  "mileage",
  "bodyStyle",
  "exteriorColor",
  "interiorColor",
  "drivetrain",
  "fuelType",
  "primaryImageUrl",
  "imageUrls",
  "sellerCity",
  "sellerState",
  "isSpecial",
  "status",
  "soldAt",
  "soldPrice",
] as const;

export type InventorySyndicationSourceField =
  (typeof INVENTORY_SYNDICATION_SOURCE_FIELDS)[number];

export type InventorySyndicationScalar = string | number | boolean | null;
export type InventorySyndicationValue =
  InventorySyndicationScalar | readonly string[];
export type InventorySyndicationRecord = Readonly<
  Record<string, InventorySyndicationValue>
>;

export type InventorySyndicationField =
  | {
      /** Output field name. It is also the CSV header and XML child element. */
      name: string;
      source: InventorySyndicationSourceField;
    }
  | {
      /** Output field name. It is also the CSV header and XML child element. */
      name: string;
      value: InventorySyndicationScalar;
    };

export type InventorySyndicationFormat = "csv" | "json" | "xml";

/**
 * A persisted tenant profile should be validated with
 * `validateInventorySyndicationProfile` before it is saved. The runtime
 * functions validate it again because stored JSON is an untrusted boundary.
 */
export type InventorySyndicationProfile = {
  format: InventorySyndicationFormat;
  fields: readonly InventorySyndicationField[];
  /** Optional JSON wrapper, e.g. `{ "vehicles": [...] }`. */
  jsonRoot?: string;
  /** XML root element; defaults to `vehicles`. */
  xmlRoot?: string;
  /** XML record element; defaults to `vehicle`. */
  xmlRecord?: string;
};

export type InventorySyndicationValidationIssue = {
  code:
    | "profile.invalid"
    | "profile.unknown_key"
    | "profile.format"
    | "profile.field_count"
    | "profile.field"
    | "profile.field_name"
    | "profile.sensitive_field"
    | "profile.duplicate_field_name"
    | "profile.source"
    | "profile.literal"
    | "profile.root"
    | "vehicles.too_many"
    | "vehicle.invalid"
    | "vehicle.duplicate_id"
    | "vehicle.value_too_large"
    | "vehicle.images_too_many"
    | "output.too_large"
    | "xml.invalid_character";
  path: string;
  message: string;
};

export class InventorySyndicationValidationError extends Error {
  readonly issues: readonly InventorySyndicationValidationIssue[];

  constructor(issues: readonly InventorySyndicationValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "));
    this.name = "InventorySyndicationValidationError";
    this.issues = issues;
  }
}

export type InventorySyndicationOutput = {
  records: readonly InventorySyndicationRecord[];
  content: string;
  /** SHA-256 of the canonical output semantics, not a delivery timestamp. */
  semanticHash: string;
};

const SOURCE_FIELD_SET = new Set<string>(INVENTORY_SYNDICATION_SOURCE_FIELDS);
const PROFILE_KEYS = new Set([
  "format",
  "fields",
  "jsonRoot",
  "xmlRoot",
  "xmlRecord",
]);
const FIELD_KEYS = new Set(["name", "source", "value"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isScalar(value: unknown): value is InventorySyndicationScalar {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isSafeOutputFieldName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    OUTPUT_FIELD_NAME.test(value) &&
    !FORBIDDEN_OBJECT_KEYS.has(value.toLowerCase())
  );
}

function isSafeXmlElementName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    XML_ELEMENT_NAME.test(value) &&
    !FORBIDDEN_OBJECT_KEYS.has(value.toLowerCase()) &&
    value.toLowerCase() !== "xml" &&
    value.toLowerCase() !== "xmlns"
  );
}

function textIsBounded(value: string): boolean {
  return value.length <= INVENTORY_SYNDICATION_MAX_TEXT_LENGTH;
}

/**
 * Validate a profile supplied by an admin form or read from JSON storage.
 * It returns all actionable issues instead of throwing so the admin UI can
 * present them together. Runtime functions throw the same issues.
 */
export function validateInventorySyndicationProfile(
  profile: unknown,
): readonly InventorySyndicationValidationIssue[] {
  const issues: InventorySyndicationValidationIssue[] = [];

  if (!isRecord(profile)) {
    return [
      {
        code: "profile.invalid",
        path: "profile",
        message: "Profile must be an object.",
      },
    ];
  }

  for (const key of Object.keys(profile)) {
    if (!PROFILE_KEYS.has(key)) {
      issues.push({
        code: "profile.unknown_key",
        path: `profile.${key}`,
        message: "Unknown profile option is not allowed.",
      });
    }
  }

  if (
    profile.format !== "csv" &&
    profile.format !== "json" &&
    profile.format !== "xml"
  ) {
    issues.push({
      code: "profile.format",
      path: "profile.format",
      message: "Format must be csv, json, or xml.",
    });
  }

  if (!Array.isArray(profile.fields)) {
    issues.push({
      code: "profile.field_count",
      path: "profile.fields",
      message: "Fields must be an array.",
    });
  } else {
    if (
      profile.fields.length === 0 ||
      profile.fields.length > INVENTORY_SYNDICATION_MAX_FIELDS
    ) {
      issues.push({
        code: "profile.field_count",
        path: "profile.fields",
        message: `Use between 1 and ${INVENTORY_SYNDICATION_MAX_FIELDS} fields.`,
      });
    }

    const fieldNames = new Set<string>();
    for (const [index, field] of profile.fields.entries()) {
      const path = `profile.fields[${index}]`;
      if (!isRecord(field)) {
        issues.push({
          code: "profile.field",
          path,
          message: "Field must be an object.",
        });
        continue;
      }

      for (const key of Object.keys(field)) {
        if (!FIELD_KEYS.has(key)) {
          issues.push({
            code: "profile.field",
            path: `${path}.${key}`,
            message: "Unknown field option is not allowed.",
          });
        }
      }

      if (!isSafeOutputFieldName(field.name)) {
        issues.push({
          code: "profile.field_name",
          path: `${path}.name`,
          message: "Use a safe field name up to 64 characters long.",
        });
      } else if (fieldNames.has(field.name)) {
        issues.push({
          code: "profile.duplicate_field_name",
          path: `${path}.name`,
          message: "Output field names must be unique.",
        });
      } else {
        fieldNames.add(field.name);
      }
      if (typeof field.name === "string" && SENSITIVE_OUTPUT_FIELD_NAME.test(field.name)) {
        issues.push({
          code: "profile.sensitive_field",
          path: `${path}.name`,
          message: "Credential-like output fields are not allowed. Use the encrypted authentication settings instead.",
        });
      }

      const hasSource = hasOwn(field, "source");
      const hasValue = hasOwn(field, "value");
      if (hasSource === hasValue) {
        issues.push({
          code: "profile.field",
          path,
          message: "Specify exactly one of source or value.",
        });
        continue;
      }

      if (
        hasSource &&
        (typeof field.source !== "string" ||
          !SOURCE_FIELD_SET.has(field.source))
      ) {
        issues.push({
          code: "profile.source",
          path: `${path}.source`,
          message: "Source is not an allow-listed vehicle field.",
        });
      }

      if (hasValue) {
        if (!isScalar(field.value)) {
          issues.push({
            code: "profile.literal",
            path: `${path}.value`,
            message:
              "Literal values must be a string, finite number, boolean, or null.",
          });
        } else if (
          typeof field.value === "string" &&
          !textIsBounded(field.value)
        ) {
          issues.push({
            code: "profile.literal",
            path: `${path}.value`,
            message: `Literal strings cannot exceed ${INVENTORY_SYNDICATION_MAX_TEXT_LENGTH} characters.`,
          });
        }
      }
    }
  }

  if (profile.jsonRoot !== undefined) {
    if (profile.format !== "json" || !isSafeOutputFieldName(profile.jsonRoot)) {
      issues.push({
        code: "profile.root",
        path: "profile.jsonRoot",
        message: "jsonRoot is only allowed for JSON and must be a safe name.",
      });
    }
  }

  for (const key of ["xmlRoot", "xmlRecord"] as const) {
    const value = profile[key];
    if (
      value !== undefined &&
      (profile.format !== "xml" || !isSafeXmlElementName(value))
    ) {
      issues.push({
        code: "profile.root",
        path: `profile.${key}`,
        message: `${key} is only allowed for XML and must be a safe XML element name.`,
      });
    }
  }

  return issues;
}

/** Throws a structured error when a persisted/admin profile is not safe to use. */
export function assertValidInventorySyndicationProfile(
  profile: unknown,
): asserts profile is InventorySyndicationProfile {
  const issues = validateInventorySyndicationProfile(profile);
  if (issues.length > 0) throw new InventorySyndicationValidationError(issues);
}

/**
 * Validate the bounded subset of vehicle data this core can serialize. This
 * is deliberately not business validation: a vehicle's price or trim may be
 * legitimately blank/zero according to a tenant's feed. It only prevents a
 * malformed row from creating unbounded or non-deterministic output.
 */
export function validateInventorySyndicationVehicles(
  vehicles: readonly Vehicle[],
): readonly InventorySyndicationValidationIssue[] {
  const issues: InventorySyndicationValidationIssue[] = [];
  if (vehicles.length > INVENTORY_SYNDICATION_MAX_RECORDS) {
    issues.push({
      code: "vehicles.too_many",
      path: "vehicles",
      message: `A single export cannot contain more than ${INVENTORY_SYNDICATION_MAX_RECORDS} vehicles.`,
    });
    return issues;
  }

  const ids = new Set<string>();
  const textKeys: ReadonlyArray<keyof Vehicle> = [
    "id",
    "externalId",
    "feedVin",
    "stockType",
    "make",
    "model",
    "trim",
    "bodyStyle",
    "exteriorColor",
    "interiorColor",
    "drivetrain",
    "fuelType",
    "imageSrc",
    "primaryImageSrc",
    "sellerCity",
    "sellerState",
    "status",
    "soldAt",
  ];

  for (const [index, vehicle] of vehicles.entries()) {
    const path = `vehicles[${index}]`;
    if (!vehicle || typeof vehicle.id !== "string" || vehicle.id.length === 0) {
      issues.push({
        code: "vehicle.invalid",
        path: `${path}.id`,
        message: "Vehicle id must be a non-empty string.",
      });
      continue;
    }
    if (ids.has(vehicle.id)) {
      issues.push({
        code: "vehicle.duplicate_id",
        path: `${path}.id`,
        message: "Vehicles in one export must have unique IDs.",
      });
    }
    ids.add(vehicle.id);

    for (const key of textKeys) {
      const value = vehicle[key];
      if (typeof value === "string" && !textIsBounded(value)) {
        issues.push({
          code: "vehicle.value_too_large",
          path: `${path}.${String(key)}`,
          message: `Text values cannot exceed ${INVENTORY_SYNDICATION_MAX_TEXT_LENGTH} characters.`,
        });
      }
    }

    for (const key of ["year", "price", "mileage", "soldPrice"] as const) {
      const value = vehicle[key];
      if (value !== null && !Number.isFinite(value)) {
        issues.push({
          code: "vehicle.invalid",
          path: `${path}.${key}`,
          message: "Numeric values must be finite when present.",
        });
      }
    }

    for (const [fieldName, imageUrls] of [
      ["managedImageUrls", vehicle.managedImageUrls],
      ["feedImageUrls", vehicle.feedImageUrls],
    ] as const) {
      if (imageUrls === undefined) continue;
      if (imageUrls.length > INVENTORY_SYNDICATION_MAX_IMAGE_URLS) {
        issues.push({
          code: "vehicle.images_too_many",
          path: `${path}.${fieldName}`,
          message: `A vehicle cannot expose more than ${INVENTORY_SYNDICATION_MAX_IMAGE_URLS} images.`,
        });
      }
      for (const [imageIndex, imageUrl] of imageUrls.entries()) {
        if (typeof imageUrl !== "string" || !textIsBounded(imageUrl)) {
          issues.push({
            code: "vehicle.value_too_large",
            path: `${path}.${fieldName}[${imageIndex}]`,
            message: `Image URLs must be strings up to ${INVENTORY_SYNDICATION_MAX_TEXT_LENGTH} characters.`,
          });
        }
      }
    }
    if (orderedImageUrls(vehicle).length > INVENTORY_SYNDICATION_MAX_IMAGE_URLS) {
      issues.push({
        code: "vehicle.images_too_many",
        path: `${path}.imageUrls`,
        message: `A vehicle cannot expose more than ${INVENTORY_SYNDICATION_MAX_IMAGE_URLS} images.`,
      });
    }
  }

  return issues;
}

function assertValidInventorySyndicationVehicles(
  vehicles: readonly Vehicle[],
): void {
  const issues = validateInventorySyndicationVehicles(vehicles);
  if (issues.length > 0) throw new InventorySyndicationValidationError(issues);
}

function nonEmpty(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function orderedImageUrls(vehicle: Vehicle): readonly string[] {
  const values = [
    vehicle.primaryImageSrc,
    ...(vehicle.managedImageUrls ?? []),
    ...(vehicle.feedImageUrls ?? []),
    vehicle.imageSrc,
  ];
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    urls.push(value);
  }
  return Object.freeze(urls);
}

function sourceValue(
  vehicle: Vehicle,
  source: InventorySyndicationSourceField,
): InventorySyndicationValue {
  switch (source) {
    case "vehicleId":
      return vehicle.id;
    case "stockNumber":
      return nonEmpty(vehicle.externalId);
    case "vin":
      return nonEmpty(vehicle.feedVin);
    case "stockType":
      return nonEmpty(vehicle.stockType);
    case "year":
      return vehicle.year;
    case "make":
      return nonEmpty(vehicle.make);
    case "model":
      return nonEmpty(vehicle.model);
    case "trim":
      return nonEmpty(vehicle.trim);
    case "price":
      return vehicle.price;
    case "mileage":
      return vehicle.mileage;
    case "bodyStyle":
      return nonEmpty(vehicle.bodyStyle);
    case "exteriorColor":
      return nonEmpty(vehicle.exteriorColor);
    case "interiorColor":
      return nonEmpty(vehicle.interiorColor);
    case "drivetrain":
      return nonEmpty(vehicle.drivetrain);
    case "fuelType":
      return nonEmpty(vehicle.fuelType);
    case "primaryImageUrl":
      return (
        nonEmpty(vehicle.primaryImageSrc) ??
        orderedImageUrls(vehicle)[0] ??
        null
      );
    case "imageUrls":
      return orderedImageUrls(vehicle);
    case "sellerCity":
      return nonEmpty(vehicle.sellerCity);
    case "sellerState":
      return nonEmpty(vehicle.sellerState);
    case "isSpecial":
      return vehicle.isSpecial;
    case "status":
      return vehicle.status;
    case "soldAt":
      return vehicle.soldAt;
    case "soldPrice":
      return vehicle.soldPrice;
  }
}

function stableVehicleOrder(a: Vehicle, b: Vehicle): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Deterministically map tenant-scoped domain vehicles into explicit output
 * records. Input arrays are never mutated; records always sort by vehicle ID
 * so a database's incidental row order cannot trigger a redundant delivery.
 */
export function mapVehiclesForInventorySyndication(
  vehicles: readonly Vehicle[],
  profile: InventorySyndicationProfile,
): readonly InventorySyndicationRecord[] {
  assertValidInventorySyndicationProfile(profile);
  assertValidInventorySyndicationVehicles(vehicles);

  return [...vehicles].sort(stableVehicleOrder).map((vehicle) => {
    const record: Record<string, InventorySyndicationValue> = Object.create(
      null,
    ) as Record<string, InventorySyndicationValue>;
    for (const field of profile.fields) {
      record[field.name] =
        "source" in field ? sourceValue(vehicle, field.source) : field.value;
    }
    return Object.freeze(record);
  });
}

function displayValue(value: InventorySyndicationValue): string {
  if (value === null) return "";
  if (Array.isArray(value)) return value.join("|");
  return String(value);
}

function isOutputValue(value: unknown): value is InventorySyndicationValue {
  return (
    isScalar(value) ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function neutralizeCsvFormula(value: string): string {
  return CSV_FORMULA_PREFIXES.has(value[0] ?? "") ? `'${value}` : value;
}

function encodeCsvValue(value: InventorySyndicationValue): string {
  const raw = neutralizeCsvFormula(displayValue(value));
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function xmlText(value: InventorySyndicationValue, path: string): string {
  const raw = displayValue(value);
  // XML 1.0 excludes control characters other than tab, LF, and CR. Escape
  // alone is not sufficient: emit a clear validation failure instead of an
  // invalid marketplace feed.
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(raw)) {
    throw new InventorySyndicationValidationError([
      {
        code: "xml.invalid_character",
        path,
        message: "XML output cannot contain control characters.",
      },
    ]);
  }
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function assertOutputWithinBounds(
  records: readonly InventorySyndicationRecord[],
  profile: InventorySyndicationProfile,
): void {
  if (records.length > INVENTORY_SYNDICATION_MAX_RECORDS) {
    throw new InventorySyndicationValidationError([
      {
        code: "vehicles.too_many",
        path: "records",
        message: `A single export cannot contain more than ${INVENTORY_SYNDICATION_MAX_RECORDS} records.`,
      },
    ]);
  }

  let estimatedBytes = 0;
  for (const [recordIndex, record] of records.entries()) {
    for (const field of profile.fields) {
      const value = record[field.name];
      if (!isOutputValue(value)) {
        throw new InventorySyndicationValidationError([
          {
            code: "vehicle.invalid",
            path: `records[${recordIndex}].${field.name}`,
            message:
              "Record values must be strings, finite numbers, booleans, null, or string arrays.",
          },
        ]);
      }
      if (
        (typeof value === "string" && !textIsBounded(value)) ||
        (Array.isArray(value) &&
          (value.length > INVENTORY_SYNDICATION_MAX_IMAGE_URLS ||
            value.some((item) => !textIsBounded(item))))
      ) {
        throw new InventorySyndicationValidationError([
          {
            code: "vehicle.value_too_large",
            path: `records[${recordIndex}].${field.name}`,
            message: `Record text values cannot exceed ${INVENTORY_SYNDICATION_MAX_TEXT_LENGTH} characters.`,
          },
        ]);
      }
      const text = displayValue(value);
      estimatedBytes +=
        TEXT_ENCODER.encode(text).byteLength + field.name.length + 8;
      if (estimatedBytes > INVENTORY_SYNDICATION_MAX_OUTPUT_BYTES) {
        throw new InventorySyndicationValidationError([
          {
            code: "output.too_large",
            path: "records",
            message: `Output cannot exceed ${INVENTORY_SYNDICATION_MAX_OUTPUT_BYTES} bytes.`,
          },
        ]);
      }
    }
  }
}

function assertSerializedOutputBound(content: string): void {
  if (
    TEXT_ENCODER.encode(content).byteLength <=
    INVENTORY_SYNDICATION_MAX_OUTPUT_BYTES
  )
    return;
  throw new InventorySyndicationValidationError([
    {
      code: "output.too_large",
      path: "output",
      message: `Output cannot exceed ${INVENTORY_SYNDICATION_MAX_OUTPUT_BYTES} bytes.`,
    },
  ]);
}

/** Serialize records in profile field order, with RFC 4180 CSV and safe XML escaping. */
export function serializeInventorySyndication(
  records: readonly InventorySyndicationRecord[],
  profile: InventorySyndicationProfile,
): string {
  assertValidInventorySyndicationProfile(profile);
  assertOutputWithinBounds(records, profile);

  const fieldNames = profile.fields.map((field) => field.name);
  if (profile.format === "csv") {
    const rows = [fieldNames.map((name) => encodeCsvValue(name)).join(",")];
    for (const record of records) {
      rows.push(
        fieldNames
          .map((name) => encodeCsvValue(record[name] ?? null))
          .join(","),
      );
    }
    const content = rows.join("\r\n");
    assertSerializedOutputBound(content);
    return content;
  }

  if (profile.format === "json") {
    const mappedRecords = records.map((record) => {
      const output: Record<string, InventorySyndicationValue> = Object.create(
        null,
      ) as Record<string, InventorySyndicationValue>;
      for (const name of fieldNames) output[name] = record[name] ?? null;
      return output;
    });
    const content = profile.jsonRoot
      ? JSON.stringify({ [profile.jsonRoot]: mappedRecords })
      : JSON.stringify(mappedRecords);
    assertSerializedOutputBound(content);
    return content;
  }

  const root = profile.xmlRoot ?? "vehicles";
  const recordName = profile.xmlRecord ?? "vehicle";
  const body = records
    .map((record, recordIndex) => {
      const fields = fieldNames
        .map(
          (name) =>
            `<${name}>${xmlText(record[name] ?? null, `records[${recordIndex}].${name}`)}</${name}>`,
        )
        .join("");
      return `<${recordName}>${fields}</${recordName}>`;
    })
    .join("");
  const content = `<?xml version="1.0" encoding="UTF-8"?><${root}>${body}</${root}>`;
  assertSerializedOutputBound(content);
  return content;
}

function canonicalValue(
  value: InventorySyndicationValue,
): InventorySyndicationValue {
  return Array.isArray(value) ? [...value] : value;
}

function canonicalOutput(
  records: readonly InventorySyndicationRecord[],
  profile: InventorySyndicationProfile,
): string {
  const profileSemantics = {
    format: profile.format,
    ...(profile.format === "json" && profile.jsonRoot
      ? { jsonRoot: profile.jsonRoot }
      : {}),
    ...(profile.format === "xml"
      ? {
          xmlRoot: profile.xmlRoot ?? "vehicles",
          xmlRecord: profile.xmlRecord ?? "vehicle",
        }
      : {}),
  };
  const fields = profile.fields.map((field) => field.name);
  const rows = records.map((record) =>
    fields.map((name) => [name, canonicalValue(record[name] ?? null)]),
  );
  return JSON.stringify({
    version: 1,
    profile: profileSemantics,
    fields,
    rows,
  });
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto SHA-256 is unavailable in this runtime.");
  }
  const digest = await subtle.digest("SHA-256", TEXT_ENCODER.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Hash canonical output semantics with SHA-256. Delivery code can persist the
 * hash and skip a new delivery only when it equals the prior successful hash.
 */
export async function hashInventorySyndicationOutput(
  records: readonly InventorySyndicationRecord[],
  profile: InventorySyndicationProfile,
): Promise<string> {
  assertValidInventorySyndicationProfile(profile);
  assertOutputWithinBounds(records, profile);
  return sha256Hex(canonicalOutput(records, profile));
}

/** Build records, serialize them, and calculate the hash used for no-op delivery suppression. */
export async function createInventorySyndicationOutput(
  vehicles: readonly Vehicle[],
  profile: InventorySyndicationProfile,
): Promise<InventorySyndicationOutput> {
  const records = mapVehiclesForInventorySyndication(vehicles, profile);
  const content = serializeInventorySyndication(records, profile);
  const semanticHash = await hashInventorySyndicationOutput(records, profile);
  return { records, content, semanticHash };
}

/** True only when a previously successful delivery has identical output semantics. */
export function isInventorySyndicationUnchanged(
  previousSuccessfulHash: string | null | undefined,
  output: Pick<InventorySyndicationOutput, "semanticHash">,
): boolean {
  return previousSuccessfulHash !== null && previousSuccessfulHash !== undefined
    ? previousSuccessfulHash === output.semanticHash
    : false;
}
