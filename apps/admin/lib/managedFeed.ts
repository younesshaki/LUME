/**
 * Pure managed-inventory-feed primitives.
 *
 * This module intentionally accepts a deliberately small profile language:
 * source paths and join delimiters only. It does not evaluate JSONata,
 * JavaScript, templates, or tenant-provided code. Route/job code can persist a
 * validated profile and use these functions without giving a feed provider a
 * way to execute code in the LUME process.
 *
 * `hybrid` and `mirror` match the useful semantics from LUME's predecessor
 * inbound tooling, but make field presence explicit:
 *
 * - hybrid: an empty/missing source value is omitted from `fields`, so an
 *   existing LUME value is left untouched during an update.
 * - mirror: an empty/missing value for an explicitly mapped field appears as
 *   `null`, so a sync can intentionally clear that field.
 *
 * Unmapped fields are never included in either mode. Consumers must use the
 * `presentFields`/`fields` result for updates; creating a new vehicle should
 * use `materializeManagedFeedCreate`, which composes the established CSV
 * normalizer in vehicleImport.ts.
 */
import { parseVehicleCsv, type VehicleImportInsert } from "./vehicleImport";
import { isSafeFeedVehicleImageUrl } from "./feedVehicleImages";

// Source transport is bounded at 25 MiB. UTF-8 text cannot contain more
// JavaScript code units than bytes in that envelope, so this parser boundary
// must not reject a valid 20–25 MiB ASCII supplier feed after download.
export const MAX_MANAGED_FEED_SOURCE_CHARS = 25 * 1024 * 1024;
export const MAX_MANAGED_FEED_RECORDS = 10_000;
export const MAX_MANAGED_FEED_COLUMNS = 200;
export const MAX_MANAGED_FEED_PATH_LENGTH = 240;
export const MAX_MANAGED_FEED_PATH_SEGMENTS = 12;
export const MAX_MANAGED_FEED_FIELD_VALUE_CHARS = 10_000;
export const MAX_MANAGED_FEED_XML_DEPTH = 32;
export const MAX_MANAGED_FEED_XML_ATTRIBUTES = 64;
export const MAX_MANAGED_FEED_XML_NODES = 50_000;

export const MANAGED_FEED_FIELDS = [
  "feed_vin",
  "external_id",
  "year",
  "make",
  "model",
  "trim",
  "price",
  "mileage",
  "body_style",
  "exterior_color",
  "interior_color",
  "drivetrain",
  "fuel_type",
  "image_src",
  "image_list",
  "additional_image_link",
  "seller_city",
  "seller_state",
  "stock_type",
  "is_special",
  "special_image_src",
] as const;

export const MAX_MANAGED_FEED_MAPPINGS = MANAGED_FEED_FIELDS.length;

export type ManagedFeedField = (typeof MANAGED_FEED_FIELDS)[number];
export type ManagedFeedFormat = "csv" | "json" | "xml";
export type ManagedFeedMode = "hybrid" | "mirror";

/** A single literal source path. `join` only applies when the path yields an array. */
export type ManagedFeedFieldMapping = {
  path: string;
  join?: string;
};

/**
 * The serializable profile stored for a managed feed source. CSV mapping paths
 * are literal header labels; JSON/XML mapping paths are safe dotted paths
 * relative to each record selected by dataPath.
 */
export type ManagedFeedProfile = {
  format: ManagedFeedFormat;
  delimiter?: string;
  dataPath?: string;
  mode: ManagedFeedMode;
  mappings: Partial<Record<ManagedFeedField, ManagedFeedFieldMapping>>;
};

export type ManagedFeedProfileIssue = {
  path: string;
  message: string;
};

export type ManagedFeedProfileValidation = {
  profile: ManagedFeedProfile | null;
  issues: ManagedFeedProfileIssue[];
};

export type ManagedFeedParseIssueCode =
  | "invalid_profile"
  | "invalid_source"
  | "source_too_large"
  | "data_path_not_found"
  | "record_limit_exceeded"
  | "invalid_record"
  | "invalid_mapping_value";

export type ManagedFeedParseIssue = {
  code: ManagedFeedParseIssueCode;
  message: string;
  /** Zero-based source-record index, when the issue is record-specific. */
  recordIndex?: number;
  /** CSV physical line number, or a one-based JSON/XML record ordinal. */
  sourceLine?: number;
  field?: ManagedFeedField;
};

/**
 * Fields are present only when the profile's mode says they should be applied.
 * Values are strings from the source or null for a mirror-mode clear.
 */
export type ManagedFeedMappedRecord = {
  index: number;
  sourceLine: number;
  fields: Partial<Record<ManagedFeedField, string | null>>;
  presentFields: ManagedFeedField[];
};

export type ManagedFeedParseResult = {
  profile: ManagedFeedProfile | null;
  records: ManagedFeedMappedRecord[];
  issues: ManagedFeedParseIssue[];
};

export type ManagedFeedIdentityIssueCode =
  | "missing_identity"
  | "invalid_vin"
  | "duplicate_vin"
  | "duplicate_external_id"
  | "identity_conflict";

export type ManagedFeedIdentityIssue = {
  code: ManagedFeedIdentityIssueCode;
  message: string;
  recordIndex: number;
  sourceLine: number;
  relatedRecordIndex?: number;
  relatedSourceLine?: number;
};

export type ManagedFeedIdentityPreflight = {
  issues: ManagedFeedIdentityIssue[];
  validRecordIndexes: number[];
};

export type ManagedFeedCreateMaterialization = {
  row: VehicleImportInsert | null;
  errors: string[];
};

type ManagedFeedDirectUpdateField = Exclude<
  ManagedFeedField,
  "image_src" | "image_list" | "additional_image_link"
>;

type ManagedFeedNullableDirectUpdateField = Exclude<
  ManagedFeedNullableUpdateField,
  "feed_gallery"
>;

export type ManagedFeedVehicleUpdate = Partial<Pick<
  VehicleImportInsert,
  | "feed_vin"
  | "external_id"
  | "year"
  | "make"
  | "model"
  | "trim"
  | "price"
  | "mileage"
  | "body_style"
  | "exterior_color"
  | "interior_color"
  | "drivetrain"
  | "fuel_type"
  | "image_src"
  | "feed_image_urls"
  | "seller_city"
  | "seller_state"
  | "stock_type"
  | "is_special"
  | "special_image_src"
>>;

export type ManagedFeedNullableUpdateField =
  | "mileage"
  | "stock_type"
  | "special_image_src"
  | "feed_gallery";

export type ManagedFeedUpdateOptions = {
  /**
   * False by default. Mirror-mode nulls are reported in `nullClears`, but
   * callers must opt in before a tenant's existing nullable data is cleared.
   */
  applyNullClears?: boolean;
};

export type ManagedFeedUpdateMaterialization = {
  update: ManagedFeedVehicleUpdate;
  nullClears: ManagedFeedNullableUpdateField[];
  errors: string[];
};

type RawSourceRecord = {
  /** Stable source index; it is never renumbered after a malformed sibling. */
  index: number;
  record: Record<string, unknown>;
  sourceLine: number;
};

type DelimitedRow = {
  cells: string[];
  line: number;
};

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string[];
};

const MANAGED_FEED_FIELD_SET = new Set<string>(MANAGED_FEED_FIELDS);
const PROFILE_KEYS = new Set(["format", "delimiter", "dataPath", "mode", "mappings"]);
const MAPPING_KEYS = new Set(["path", "join"]);
const DANGEROUS_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const SAFE_PATH_SEGMENT = /^(?:@?[A-Za-z_][A-Za-z0-9_:-]{0,63}|#text)$/;
const SAFE_XML_NAME = /^[A-Za-z_][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CSV_HEADER = /^[^\u0000\r\n]{1,128}$/;
const SAFE_JOIN = /^[^\u0000\r\n]{0,8}$/;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{11,17}$/;
const MANAGED_FEED_GALLERY_INPUT_FIELDS = [
  "image_src",
  "image_list",
  "additional_image_link",
] as const;
const MANAGED_FEED_DIRECT_UPDATE_FIELDS = [
  "feed_vin",
  "external_id",
  "year",
  "make",
  "model",
  "trim",
  "price",
  "mileage",
  "body_style",
  "exterior_color",
  "interior_color",
  "drivetrain",
  "fuel_type",
  "seller_city",
  "seller_state",
  "stock_type",
  "is_special",
  "special_image_src",
] as const satisfies readonly ManagedFeedDirectUpdateField[];
const NULLABLE_DIRECT_UPDATE_FIELDS = new Set<ManagedFeedNullableDirectUpdateField>([
  "mileage",
  "stock_type",
  "special_image_src",
]);
const UPDATE_REQUIRED_PLACEHOLDERS = {
  year: "2000",
  make: "LUME placeholder",
  model: "LUME placeholder",
  price: "0",
} as const;

/**
 * Validates, bounds, and normalizes an untrusted persisted profile before it
 * is ever used to parse a feed. Unknown properties are rejected so profile
 * behavior cannot be changed by adding a future, unreviewed option.
 */
export function validateManagedFeedProfile(value: unknown): ManagedFeedProfileValidation {
  const issues: ManagedFeedProfileIssue[] = [];
  if (!isPlainRecord(value)) {
    return { profile: null, issues: [{ path: "profile", message: "Profile must be an object." }] };
  }

  for (const key of Object.keys(value)) {
    if (!PROFILE_KEYS.has(key)) {
      issues.push({ path: key, message: "Unknown profile property." });
    }
  }

  const format = value.format;
  if (format !== "csv" && format !== "json" && format !== "xml") {
    issues.push({ path: "format", message: "Format must be csv, json, or xml." });
  }

  const validFormat: ManagedFeedFormat | null =
    format === "csv" || format === "json" || format === "xml" ? format : null;

  const rawMode = value.mode;
  const mode: ManagedFeedMode = rawMode === undefined ? "hybrid" : rawMode === "mirror" ? "mirror" : "hybrid";
  if (rawMode !== undefined && rawMode !== "hybrid" && rawMode !== "mirror") {
    issues.push({ path: "mode", message: "Mode must be hybrid or mirror." });
  }

  const delimiter = parseDelimiter(value.delimiter, validFormat, issues);
  const dataPath = parseDataPath(value.dataPath, validFormat, issues);
  const mappings = parseMappings(value.mappings, validFormat, issues);

  if (issues.length > 0 || !validFormat || !mappings) {
    return { profile: null, issues };
  }

  return {
    profile: {
      format: validFormat,
      ...(delimiter ? { delimiter } : {}),
      ...(dataPath ? { dataPath } : {}),
      mode,
      mappings,
    },
    issues,
  };
}

/**
 * Parses a source and maps it through a validated, constrained profile. The
 * result keeps per-field presence separate from values so job code can apply
 * hybrid/mirror updates without guessing what a blank source cell meant.
 */
export function parseManagedFeed(profileInput: unknown, sourceText: unknown): ManagedFeedParseResult {
  const validation = validateManagedFeedProfile(profileInput);
  if (!validation.profile) {
    return {
      profile: null,
      records: [],
      issues: validation.issues.map((issue) => ({
        code: "invalid_profile" as const,
        message: `${issue.path}: ${issue.message}`,
      })),
    };
  }

  if (typeof sourceText !== "string") {
    return {
      profile: validation.profile,
      records: [],
      issues: [{ code: "invalid_source", message: "Feed source must be text." }],
    };
  }
  if (sourceText.length > MAX_MANAGED_FEED_SOURCE_CHARS) {
    return {
      profile: validation.profile,
      records: [],
      issues: [{
        code: "source_too_large",
        message: `Feed source exceeds the ${MAX_MANAGED_FEED_SOURCE_CHARS}-character limit.`,
      }],
    };
  }

  const rawResult = parseRawSource(validation.profile, sourceText);
  if (rawResult.issues.length > 0 && rawResult.records.length === 0) {
    return { profile: validation.profile, records: [], issues: rawResult.issues };
  }

  const issues = [...rawResult.issues];
  const records = rawResult.records.map((raw) =>
    mapSourceRecord(validation.profile!, raw, raw.index, issues),
  );
  return { profile: validation.profile, records, issues };
}

/**
 * Checks whether two rows from the same source would ambiguously address the
 * same LUME vehicle. It deliberately uses only stable identities, never
 * display attributes, just like resolveFeedSync in vehicleImport.ts.
 */
export function preflightManagedFeedIdentities(
  records: readonly ManagedFeedMappedRecord[],
): ManagedFeedIdentityPreflight {
  const issues: ManagedFeedIdentityIssue[] = [];
  const seenVins = new Map<string, IdentityReference>();
  const seenExternalIds = new Map<string, IdentityReference>();
  const validRecordIndexes: number[] = [];

  for (const record of records) {
    const vinValue = record.fields.feed_vin;
    const externalIdValue = record.fields.external_id;
    const vin = normalizeVin(vinValue);
    const externalId = normalizeExternalId(externalIdValue);

    if (vinValue !== undefined && vinValue !== null && !vin) {
      issues.push({
        code: "invalid_vin",
        message: "VIN must contain 11–17 valid VIN characters.",
        recordIndex: record.index,
        sourceLine: record.sourceLine,
      });
      continue;
    }
    if (!vin && !externalId) {
      issues.push({
        code: "missing_identity",
        message: "Managed feed records require a VIN or external ID.",
        recordIndex: record.index,
        sourceLine: record.sourceLine,
      });
      continue;
    }

    const priorVin = vin ? seenVins.get(vin) : undefined;
    const priorExternalId = externalId ? seenExternalIds.get(externalId) : undefined;
    const conflictingVin = Boolean(
      priorVin && externalId && priorVin.externalId && priorVin.externalId !== externalId,
    );
    const conflictingExternalId = Boolean(
      priorExternalId && vin && priorExternalId.vin && priorExternalId.vin !== vin,
    );

    if (conflictingVin || conflictingExternalId) {
      const related = priorVin ?? priorExternalId;
      issues.push({
        code: "identity_conflict",
        message: "VIN and external ID point to conflicting records in this feed.",
        recordIndex: record.index,
        sourceLine: record.sourceLine,
        relatedRecordIndex: related?.recordIndex,
        relatedSourceLine: related?.sourceLine,
      });
      continue;
    }
    if (priorVin) {
      issues.push({
        code: "duplicate_vin",
        message: "Duplicate VIN in this feed source.",
        recordIndex: record.index,
        sourceLine: record.sourceLine,
        relatedRecordIndex: priorVin.recordIndex,
        relatedSourceLine: priorVin.sourceLine,
      });
      continue;
    }
    if (priorExternalId) {
      issues.push({
        code: "duplicate_external_id",
        message: "Duplicate external ID in this feed source.",
        recordIndex: record.index,
        sourceLine: record.sourceLine,
        relatedRecordIndex: priorExternalId.recordIndex,
        relatedSourceLine: priorExternalId.sourceLine,
      });
      continue;
    }

    const reference: IdentityReference = {
      recordIndex: record.index,
      sourceLine: record.sourceLine,
      vin,
      externalId,
    };
    if (vin) seenVins.set(vin, reference);
    if (externalId) seenExternalIds.set(externalId, reference);
    validRecordIndexes.push(record.index);
  }

  return { issues, validRecordIndexes };
}

/**
 * Converts a complete mapped record into LUME's existing normalized import
 * shape for a new vehicle. It intentionally does not manufacture hybrid
 * update values: callers updating an existing vehicle must use `fields` and
 * `presentFields` from the mapped record instead.
 */
export function materializeManagedFeedCreate(
  record: ManagedFeedMappedRecord,
): ManagedFeedCreateMaterialization {
  const headers: string[] = [];
  const values: string[] = [];
  for (const field of MANAGED_FEED_FIELDS) {
    const value = record.fields[field];
    if (value === undefined) continue;
    headers.push(importHeaderFor(field));
    values.push(value ?? "");
  }

  const parsed = parseVehicleCsv(`${headers.join(",")}\n${values.map(escapeCsv).join(",")}`);
  return {
    row: parsed.rows[0] ?? null,
    errors: parsed.errors.map((error) => error.message),
  };
}

/**
 * Normalizes a partial source record through the established vehicle CSV
 * parser, then returns a patch containing only fields that were explicitly
 * present in the managed-feed mapping. Required placeholder values only make
 * the parser usable for partial updates; they are never returned to callers.
 *
 * Mirror-mode nulls are deliberately opt-in. They are exposed in `nullClears`
 * even when `applyNullClears` is false, so a worker can report or require an
 * editor decision instead of clearing tenant data implicitly.
 */
export function materializeManagedFeedUpdate(
  record: ManagedFeedMappedRecord,
  options: ManagedFeedUpdateOptions = {},
): ManagedFeedUpdateMaterialization {
  const errors = validatePresentUpdateFields(record);
  if (errors.length > 0) return { update: {}, nullClears: [], errors };

  const parsed = parseVehicleCsv(buildManagedFeedUpdateCsv(record));
  if (parsed.errors.length > 0 || !parsed.rows[0]) {
    return {
      update: {},
      nullClears: [],
      errors: parsed.errors.map((error) => error.message),
    };
  }

  const normalized = parsed.rows[0];
  const update: ManagedFeedVehicleUpdate = {};
  const nullClears: ManagedFeedNullableUpdateField[] = [];
  const applyNullClears = options.applyNullClears === true;

  for (const field of MANAGED_FEED_DIRECT_UPDATE_FIELDS) {
    if (!record.presentFields.includes(field)) continue;
    const sourceValue = record.fields[field];
    if (sourceValue === null) {
      if (!isNullableDirectUpdateField(field)) {
        return {
          update: {},
          nullClears: [],
          errors: [`${field} cannot be cleared because LUME requires a value.`],
        };
      }
      nullClears.push(field);
      if (applyNullClears) setManagedFeedUpdateField(update, field, null);
      continue;
    }
    setManagedFeedUpdateField(update, field, normalized[field]);
  }

  const galleryIsPresent = MANAGED_FEED_GALLERY_INPUT_FIELDS.some((field) =>
    record.presentFields.includes(field),
  );
  if (galleryIsPresent) {
    const hasGalleryValue = MANAGED_FEED_GALLERY_INPUT_FIELDS.some((field) => {
      const value = record.fields[field];
      return typeof value === "string" && value.trim() !== "";
    });
    if (!hasGalleryValue) {
      nullClears.push("feed_gallery");
      if (applyNullClears) {
        update.image_src = "";
        update.feed_image_urls = [];
      }
    } else {
      update.image_src = normalized.image_src;
      update.feed_image_urls = normalized.feed_image_urls;
    }
  }

  return { update, nullClears, errors: [] };
}

function validatePresentUpdateFields(record: ManagedFeedMappedRecord): string[] {
  const errors: string[] = [];
  for (const field of MANAGED_FEED_DIRECT_UPDATE_FIELDS) {
    if (!record.presentFields.includes(field)) continue;
    const value = record.fields[field];
    if (value === undefined) {
      errors.push(`${field} was marked present but has no source value.`);
      continue;
    }
    if (value === null) {
      if (!isNullableDirectUpdateField(field)) {
        errors.push(`${field} cannot be cleared because LUME requires a value.`);
      }
      continue;
    }
    if (field === "feed_vin" && !normalizeVin(value)) {
      errors.push("feed_vin must contain 11–17 valid VIN characters.");
    }
    if (
      field === "is_special" &&
      !["true", "false", "1", "0", "yes", "no"].includes(value.trim().toLowerCase())
    ) {
      errors.push("is_special must be true, false, 1, 0, yes, or no.");
    }
  }

  for (const field of MANAGED_FEED_GALLERY_INPUT_FIELDS) {
    if (!record.presentFields.includes(field)) continue;
    const value = record.fields[field];
    if (value === undefined) {
      errors.push(`${field} was marked present but has no source value.`);
      continue;
    }
    if (value === null || !value.trim()) continue;
    const candidates = field === "image_src" ? [value] : value.split(",");
    if (candidates.some((candidate) => !isSafeFeedVehicleImageUrl(candidate))) {
      errors.push(`${field} contains an unsafe or invalid image URL.`);
    }
  }
  return errors;
}

function buildManagedFeedUpdateCsv(record: ManagedFeedMappedRecord): string {
  const headers: string[] = [];
  const values: string[] = [];
  const galleryIsPresent = MANAGED_FEED_GALLERY_INPUT_FIELDS.some((field) =>
    record.presentFields.includes(field),
  );
  for (const field of MANAGED_FEED_FIELDS) {
    const isRequired = Object.hasOwn(UPDATE_REQUIRED_PLACEHOLDERS, field);
    const isGalleryField = MANAGED_FEED_GALLERY_INPUT_FIELDS.includes(
      field as (typeof MANAGED_FEED_GALLERY_INPUT_FIELDS)[number],
    );
    const isPresent = record.presentFields.includes(field);
    if (!isRequired && !isPresent && !(galleryIsPresent && isGalleryField)) continue;

    const sourceValue = record.fields[field];
    const placeholder = isRequired
      ? UPDATE_REQUIRED_PLACEHOLDERS[field as keyof typeof UPDATE_REQUIRED_PLACEHOLDERS]
      : undefined;
    const value = sourceValue === undefined || sourceValue === null ? placeholder ?? "" : sourceValue;
    headers.push(importHeaderFor(field));
    values.push(escapeCsv(value));
  }
  return `${headers.join(",")}\n${values.join(",")}`;
}

function setManagedFeedUpdateField(
  update: ManagedFeedVehicleUpdate,
  field: ManagedFeedDirectUpdateField,
  value: VehicleImportInsert[ManagedFeedDirectUpdateField] | null,
): void {
  Object.assign(update, { [field]: value });
}

function isNullableDirectUpdateField(
  field: ManagedFeedDirectUpdateField,
): field is ManagedFeedNullableDirectUpdateField {
  return NULLABLE_DIRECT_UPDATE_FIELDS.has(field as ManagedFeedNullableDirectUpdateField);
}

function parseDelimiter(
  value: unknown,
  format: ManagedFeedFormat | null,
  issues: ManagedFeedProfileIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (format !== "csv") {
    issues.push({ path: "delimiter", message: "Delimiter is only supported for CSV feeds." });
    return undefined;
  }
  if (
    typeof value !== "string" ||
    value.length !== 1 ||
    value === '"' ||
    value === "\r" ||
    value === "\n" ||
    value.charCodeAt(0) < 0x09 ||
    value.charCodeAt(0) > 0x7e
  ) {
    issues.push({
      path: "delimiter",
      message: "Delimiter must be one printable ASCII character other than a quote.",
    });
    return undefined;
  }
  return value;
}

function parseDataPath(
  value: unknown,
  format: ManagedFeedFormat | null,
  issues: ManagedFeedProfileIssue[],
): string | undefined {
  if (value === undefined) return undefined;
  if (format === "csv") {
    issues.push({ path: "dataPath", message: "dataPath is only supported for JSON and XML feeds." });
    return undefined;
  }
  if (typeof value !== "string" || !parseSafePath(value)) {
    issues.push({
      path: "dataPath",
      message: "dataPath must be a bounded dotted path with safe property names.",
    });
    return undefined;
  }
  return value;
}

function parseMappings(
  value: unknown,
  format: ManagedFeedFormat | null,
  issues: ManagedFeedProfileIssue[],
): Partial<Record<ManagedFeedField, ManagedFeedFieldMapping>> | null {
  if (!isPlainRecord(value)) {
    issues.push({ path: "mappings", message: "Mappings must be an object." });
    return null;
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    issues.push({ path: "mappings", message: "At least one identity mapping is required." });
  }
  if (entries.length > MAX_MANAGED_FEED_MAPPINGS) {
    issues.push({
      path: "mappings",
      message: `Mappings may contain at most ${MAX_MANAGED_FEED_MAPPINGS} fields.`,
    });
  }

  const mappings: Partial<Record<ManagedFeedField, ManagedFeedFieldMapping>> = {};
  for (const [field, mappingValue] of entries) {
    if (!MANAGED_FEED_FIELD_SET.has(field)) {
      issues.push({ path: `mappings.${field}`, message: "Unknown LUME vehicle field." });
      continue;
    }
    if (!isPlainRecord(mappingValue)) {
      issues.push({ path: `mappings.${field}`, message: "Mapping must be an object." });
      continue;
    }
    for (const key of Object.keys(mappingValue)) {
      if (!MAPPING_KEYS.has(key)) {
        issues.push({ path: `mappings.${field}.${key}`, message: "Unknown mapping property." });
      }
    }
    const sourcePath = mappingValue.path;
    const normalizedSourcePath = typeof sourcePath === "string" ? sourcePath.trim() : "";
    const join = mappingValue.join;
    const validPath =
      typeof sourcePath === "string" &&
      (format === "csv"
        ? SAFE_CSV_HEADER.test(normalizedSourcePath)
        : Boolean(parseSafePath(normalizedSourcePath)));
    if (!validPath) {
      issues.push({
        path: `mappings.${field}.path`,
        message: format === "csv"
          ? "CSV mapping paths must be bounded literal header labels."
          : "JSON/XML mapping paths must be bounded dotted paths with safe property names.",
      });
      continue;
    }
    if (join !== undefined && (typeof join !== "string" || !SAFE_JOIN.test(join))) {
      issues.push({
        path: `mappings.${field}.join`,
        message: "join must be a short string without line breaks.",
      });
      continue;
    }
    if (
      MANAGED_FEED_GALLERY_INPUT_FIELDS.includes(
        field as (typeof MANAGED_FEED_GALLERY_INPUT_FIELDS)[number],
      ) && join !== undefined && join !== ","
    ) {
      issues.push({
        path: `mappings.${field}.join`,
        message: "Image gallery mappings must use a comma join so every URL is normalized safely.",
      });
      continue;
    }
    mappings[field as ManagedFeedField] = {
      path: normalizedSourcePath,
      ...(join === undefined ? {} : { join }),
    };
  }

  if (!mappings.feed_vin && !mappings.external_id) {
    issues.push({
      path: "mappings",
      message: "Map feed_vin or external_id for stable vehicle identity synchronization.",
    });
  }
  return mappings;
}

function parseRawSource(
  profile: ManagedFeedProfile,
  sourceText: string,
): { records: RawSourceRecord[]; issues: ManagedFeedParseIssue[] } {
  try {
    if (profile.format === "csv") return parseCsvSource(profile, sourceText);
    if (profile.format === "json") return parseJsonSource(profile, sourceText);
    return parseXmlSource(profile, sourceText);
  } catch (error) {
    return {
      records: [],
      issues: [{
        code: "invalid_source",
        message: error instanceof Error ? error.message : "Unable to parse feed source.",
      }],
    };
  }
}

function parseCsvSource(
  profile: ManagedFeedProfile,
  sourceText: string,
): { records: RawSourceRecord[]; issues: ManagedFeedParseIssue[] } {
  const parsed = parseDelimitedRows(sourceText.replace(/^\uFEFF/, ""), profile.delimiter ?? ",");
  if (parsed.length === 0) {
    return { records: [], issues: [{ code: "invalid_source", message: "CSV feed is empty." }] };
  }
  const header = parsed[0]!;
  if (header.cells.length === 0 || header.cells.length > MAX_MANAGED_FEED_COLUMNS) {
    return {
      records: [],
      issues: [{ code: "invalid_source", message: "CSV has an invalid number of columns." }],
    };
  }

  const headers = header.cells.map((cell) => cell.trim());
  const seenHeaders = new Set<string>();
  for (const cell of headers) {
    const normalized = cell.toLowerCase();
    if (!SAFE_CSV_HEADER.test(cell)) {
      return {
        records: [],
        issues: [{ code: "invalid_source", message: "CSV contains an invalid header label." }],
      };
    }
    if (seenHeaders.has(normalized)) {
      return {
        records: [],
        issues: [{ code: "invalid_source", message: `CSV contains duplicate header "${cell}".` }],
      };
    }
    seenHeaders.add(normalized);
  }

  const records: RawSourceRecord[] = [];
  const issues: ManagedFeedParseIssue[] = [];
  for (const [sourceIndex, row] of parsed.slice(1).entries()) {
    if (row.cells.every((cell) => cell.trim() === "")) continue;
    if (sourceIndex >= MAX_MANAGED_FEED_RECORDS) {
      issues.push({
        code: "record_limit_exceeded",
        message: `Feed contains more than ${MAX_MANAGED_FEED_RECORDS} records.`,
      });
      break;
    }
    if (row.cells.length > headers.length) {
      issues.push({
        code: "invalid_record",
        message: "CSV record has more cells than the header row.",
        recordIndex: sourceIndex,
        sourceLine: row.line,
      });
      continue;
    }
    const record = Object.create(null) as Record<string, unknown>;
    headers.forEach((headerName, columnIndex) => {
      record[headerName] = row.cells[columnIndex] ?? "";
    });
    records.push({ index: sourceIndex, record, sourceLine: row.line });
  }
  return { records, issues };
}

function parseJsonSource(
  profile: ManagedFeedProfile,
  sourceText: string,
): { records: RawSourceRecord[]; issues: ManagedFeedParseIssue[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(sourceText.replace(/^\uFEFF/, ""));
  } catch {
    return { records: [], issues: [{ code: "invalid_source", message: "JSON feed is invalid." }] };
  }
  return selectStructuredRecords(parsed, profile.dataPath);
}

function parseXmlSource(
  profile: ManagedFeedProfile,
  sourceText: string,
): { records: RawSourceRecord[]; issues: ManagedFeedParseIssue[] } {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseXmlDocument(sourceText.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      records: [],
      issues: [{
        code: "invalid_source",
        message: error instanceof Error ? error.message : "XML feed is invalid.",
      }],
    };
  }
  return selectStructuredRecords(parsed, profile.dataPath);
}

function selectStructuredRecords(
  source: unknown,
  dataPath: string | undefined,
): { records: RawSourceRecord[]; issues: ManagedFeedParseIssue[] } {
  const selected = dataPath ? readPath(source, parseSafePath(dataPath)!) : source;
  if (selected === undefined) {
    return {
      records: [],
      issues: [{ code: "data_path_not_found", message: "dataPath did not resolve to any source records." }],
    };
  }
  const values = Array.isArray(selected) ? selected : [selected];
  const records: RawSourceRecord[] = [];
  const issues: ManagedFeedParseIssue[] = [];
  for (const [sourceIndex, value] of values.entries()) {
    if (sourceIndex >= MAX_MANAGED_FEED_RECORDS) {
      issues.push({
        code: "record_limit_exceeded",
        message: `Feed contains more than ${MAX_MANAGED_FEED_RECORDS} records.`,
      });
      break;
    }
    if (!isRecord(value)) {
      issues.push({
        code: "invalid_record",
        message: "Selected JSON/XML feed records must be objects.",
        recordIndex: sourceIndex,
        sourceLine: sourceIndex + 1,
      });
      continue;
    }
    records.push({ index: sourceIndex, record: value, sourceLine: sourceIndex + 1 });
  }
  return { records, issues };
}

function mapSourceRecord(
  profile: ManagedFeedProfile,
  raw: RawSourceRecord,
  index: number,
  issues: ManagedFeedParseIssue[],
): ManagedFeedMappedRecord {
  const fields: Partial<Record<ManagedFeedField, string | null>> = {};
  const presentFields: ManagedFeedField[] = [];
  for (const field of MANAGED_FEED_FIELDS) {
    const mapping = profile.mappings[field];
    if (!mapping) continue;
    const value = profile.format === "csv"
      ? raw.record[mapping.path]
      : readPath(raw.record, parseSafePath(mapping.path)!);
    const text = scalarSourceValue(value, mapping.join);
    if (text.error) {
      issues.push({
        code: "invalid_mapping_value",
        message: text.error,
        recordIndex: index,
        sourceLine: raw.sourceLine,
        field,
      });
      continue;
    }
    if (text.value === undefined) {
      if (profile.mode === "mirror") {
        fields[field] = null;
        presentFields.push(field);
      }
      continue;
    }
    fields[field] = field === "feed_vin" ? normalizeVin(text.value) ?? text.value : text.value;
    presentFields.push(field);
  }
  return { index, sourceLine: raw.sourceLine, fields, presentFields };
}

function scalarSourceValue(
  value: unknown,
  join: string | undefined,
): { value: string | undefined; error?: string } {
  if (value === undefined || value === null) return { value: undefined };
  const values = Array.isArray(value) ? flattenArray(value) : [value];
  if (!values) {
    return { value: undefined, error: "Mapped source value contains a nested object or array." };
  }
  const strings: string[] = [];
  for (const item of values) {
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
      return { value: undefined, error: "Mapped source value must be a scalar or an array of scalars." };
    }
    const text = String(item).trim();
    if (text) strings.push(text);
  }
  if (strings.length === 0) return { value: undefined };
  const text = strings.join(join ?? ",");
  if (text.length > MAX_MANAGED_FEED_FIELD_VALUE_CHARS) {
    return {
      value: undefined,
      error: `Mapped source value exceeds the ${MAX_MANAGED_FEED_FIELD_VALUE_CHARS}-character limit.`,
    };
  }
  return { value: text };
}

function flattenArray(value: unknown[]): Array<string | number | boolean> | null {
  const flattened: Array<string | number | boolean> = [];
  const stack = [...value];
  while (stack.length > 0) {
    const item = stack.shift();
    if (Array.isArray(item)) {
      stack.unshift(...item);
      continue;
    }
    if (item === null || item === undefined) continue;
    if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") return null;
    flattened.push(item);
  }
  return flattened;
}

function parseDelimitedRows(source: string, delimiter: string): DelimitedRow[] {
  const rows: DelimitedRow[] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let quoteClosed = false;
  let line = 1;
  let rowLine = 1;

  const pushRow = () => {
    row.push(field);
    field = "";
    rows.push({ cells: row, line: rowLine });
    if (rows.length > MAX_MANAGED_FEED_RECORDS + 1) {
      throw new Error(`Feed contains more than ${MAX_MANAGED_FEED_RECORDS} records.`);
    }
    row = [];
    rowLine = line + 1;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
        if (character === "\n" || (character === "\r" && source[index + 1] !== "\n")) {
          line += 1;
        }
      }
      continue;
    }
    if (character === '"') {
      if (field.length > 0 || quoteClosed) {
        throw new Error("CSV quote must begin at the start of a field.");
      }
      inQuotes = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
      quoteClosed = false;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      pushRow();
      line += 1;
      quoteClosed = false;
    } else {
      if (quoteClosed) throw new Error("CSV has text after a closing quote.");
      field += character;
    }
  }
  if (inQuotes) throw new Error("CSV contains an unterminated quoted field.");
  if (field.length > 0 || row.length > 0) pushRow();
  return rows;
}

/** A small, non-validating XML reader for bounded feed documents. */
function parseXmlDocument(source: string): Record<string, unknown> {
  if (!source.trim()) throw new Error("XML feed is empty.");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("XML feeds may not contain DTD or entity declarations.");
  }

  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  let index = 0;
  let nodeCount = 0;
  while (index < source.length) {
    const nextTag = source.indexOf("<", index);
    if (nextTag < 0) {
      appendXmlText(stack, source.slice(index));
      break;
    }
    appendXmlText(stack, source.slice(index, nextTag));
    if (source.startsWith("<!--", nextTag)) {
      const end = source.indexOf("-->", nextTag + 4);
      if (end < 0) throw new Error("XML comment is not closed.");
      index = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", nextTag)) {
      const end = source.indexOf("]]>", nextTag + 9);
      if (end < 0) throw new Error("XML CDATA section is not closed.");
      if (stack.length === 0) throw new Error("XML text must be inside the root element.");
      stack[stack.length - 1]!.text.push(source.slice(nextTag + 9, end));
      index = end + 3;
      continue;
    }
    if (source.startsWith("<?", nextTag)) {
      const end = source.indexOf("?>", nextTag + 2);
      if (end < 0) throw new Error("XML processing instruction is not closed.");
      index = end + 2;
      continue;
    }
    if (source.startsWith("<!", nextTag)) throw new Error("Unsupported XML declaration.");

    const end = findXmlTagEnd(source, nextTag + 1);
    if (end < 0) throw new Error("XML tag is not closed.");
    const token = source.slice(nextTag + 1, end);
    if (token.startsWith("/")) {
      const name = token.slice(1).trim();
      if (!SAFE_XML_NAME.test(name) || DANGEROUS_PATH_SEGMENTS.has(name)) {
        throw new Error("XML contains an invalid closing tag name.");
      }
      const node = stack.pop();
      if (!node || node.name !== name) throw new Error("XML closing tag does not match its opening tag.");
    } else {
      const node = parseXmlOpenTag(token);
      nodeCount += 1;
      if (nodeCount > MAX_MANAGED_FEED_XML_NODES) {
        throw new Error(`XML exceeds the ${MAX_MANAGED_FEED_XML_NODES}-element limit.`);
      }
      if (stack.length >= MAX_MANAGED_FEED_XML_DEPTH) {
        throw new Error(`XML exceeds the ${MAX_MANAGED_FEED_XML_DEPTH}-level nesting limit.`);
      }
      if (stack.length === 0) {
        if (root) throw new Error("XML contains more than one root element.");
        root = node;
      } else {
        stack[stack.length - 1]!.children.push(node);
      }
      if (!token.trimEnd().endsWith("/")) stack.push(node);
    }
    index = end + 1;
  }
  if (stack.length > 0) throw new Error("XML element is not closed.");
  if (!root) throw new Error("XML feed has no root element.");
  return { [root.name]: xmlNodeToValue(root) };
}

function appendXmlText(stack: XmlNode[], text: string): void {
  if (!text) return;
  if (stack.length === 0) {
    if (text.trim()) throw new Error("XML text must be inside the root element.");
    return;
  }
  stack[stack.length - 1]!.text.push(decodeXml(text));
}

function findXmlTagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === ">") {
      return index;
    }
  }
  return -1;
}

function parseXmlOpenTag(token: string): XmlNode {
  const body = token.trim();
  const content = body.endsWith("/") ? body.slice(0, -1).trimEnd() : body;
  const nameMatch = /^([^\s/>]+)/.exec(content);
  const name = nameMatch?.[1] ?? "";
  if (!SAFE_XML_NAME.test(name) || DANGEROUS_PATH_SEGMENTS.has(name)) {
    throw new Error("XML contains an invalid element name.");
  }

  const attributes = Object.create(null) as Record<string, string>;
  let position = name.length;
  let count = 0;
  while (position < content.length) {
    while (position < content.length && /\s/.test(content[position]!)) position += 1;
    if (position >= content.length) break;
    const attributeMatch = /^([^\s=/>]+)/.exec(content.slice(position));
    const attributeName = attributeMatch?.[1] ?? "";
    if (!SAFE_XML_NAME.test(attributeName) || DANGEROUS_PATH_SEGMENTS.has(attributeName)) {
      throw new Error("XML contains an invalid attribute name.");
    }
    position += attributeName.length;
    while (position < content.length && /\s/.test(content[position]!)) position += 1;
    if (content[position] !== "=") throw new Error("XML attributes must have quoted values.");
    position += 1;
    while (position < content.length && /\s/.test(content[position]!)) position += 1;
    const quote = content[position];
    if (quote !== '"' && quote !== "'") throw new Error("XML attributes must have quoted values.");
    position += 1;
    const valueStart = position;
    while (position < content.length && content[position] !== quote) position += 1;
    if (position >= content.length) throw new Error("XML attribute value is not closed.");
    if (Object.hasOwn(attributes, attributeName)) throw new Error("XML contains a duplicate attribute.");
    attributes[attributeName] = decodeXml(content.slice(valueStart, position));
    position += 1;
    count += 1;
    if (count > MAX_MANAGED_FEED_XML_ATTRIBUTES) {
      throw new Error(`XML element exceeds the ${MAX_MANAGED_FEED_XML_ATTRIBUTES}-attribute limit.`);
    }
  }
  return { name, attributes, children: [], text: [] };
}

function xmlNodeToValue(node: XmlNode): unknown {
  const text = node.text.join("").trim();
  if (node.children.length === 0 && Object.keys(node.attributes).length === 0) return text;

  const value = Object.create(null) as Record<string, unknown>;
  for (const [attribute, attributeValue] of Object.entries(node.attributes)) {
    value[`@${attribute}`] = attributeValue;
  }
  for (const child of node.children) {
    const childValue = xmlNodeToValue(child);
    const existing = value[child.name];
    if (existing === undefined) value[child.name] = childValue;
    else if (Array.isArray(existing)) existing.push(childValue);
    else value[child.name] = [existing, childValue];
  }
  if (text) value["#text"] = text;
  return value;
}

function decodeXml(value: string): string {
  let decoded = "";
  let cursor = 0;
  while (cursor < value.length) {
    const ampersand = value.indexOf("&", cursor);
    if (ampersand < 0) return decoded + value.slice(cursor);
    decoded += value.slice(cursor, ampersand);
    const semicolon = value.indexOf(";", ampersand + 1);
    if (semicolon < 0 || semicolon - ampersand > 16) {
      throw new Error("XML contains an unsupported entity.");
    }
    const entity = value.slice(ampersand + 1, semicolon);
    if (entity === "amp") decoded += "&";
    else if (entity === "lt") decoded += "<";
    else if (entity === "gt") decoded += ">";
    else if (entity === "quot") decoded += '"';
    else if (entity === "apos") decoded += "'";
    else if (/^#x[0-9a-fA-F]+$/.test(entity) || /^#\d+$/.test(entity)) {
      const numeric = entity.startsWith("#x")
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff) {
        throw new Error("XML contains an invalid numeric entity.");
      }
      decoded += String.fromCodePoint(numeric);
    } else {
      throw new Error("XML contains an unsupported entity.");
    }
    cursor = semicolon + 1;
  }
  return decoded;
}

function parseSafePath(value: string): string[] | null {
  const path = value.trim();
  if (!path || path.length > MAX_MANAGED_FEED_PATH_LENGTH) return null;
  const segments = path.split(".");
  if (segments.length > MAX_MANAGED_FEED_PATH_SEGMENTS) return null;
  if (segments.some((segment) => !SAFE_PATH_SEGMENT.test(segment) || DANGEROUS_PATH_SEGMENTS.has(segment))) {
    return null;
  }
  return segments;
}

function readPath(value: unknown, segments: readonly string[]): unknown | undefined {
  let candidates: unknown[] = [value];
  for (const segment of segments) {
    const next: unknown[] = [];
    for (const candidate of candidates) {
      const values = Array.isArray(candidate) ? candidate : [candidate];
      for (const item of values) {
        if (!isRecord(item) || !Object.hasOwn(item, segment)) continue;
        next.push(item[segment]);
      }
    }
    if (next.length === 0) return undefined;
    candidates = next;
  }
  return candidates.length === 1 ? candidates[0] : candidates;
}

function normalizeVin(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
  return VIN_PATTERN.test(normalized) ? normalized : null;
}

function normalizeExternalId(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized ? normalized : null;
}

function importHeaderFor(field: ManagedFeedField): string {
  return field === "feed_vin" ? "vin" : field;
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type IdentityReference = {
  recordIndex: number;
  sourceLine: number;
  vin: string | null;
  externalId: string | null;
};
