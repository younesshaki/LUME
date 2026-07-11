export type CsvImportStatus = "pending" | "running" | "succeeded" | "failed" | "partial";
export type CsvImportPhase = "pending" | "running" | "completed" | "failed";

export type CsvImportCounts = {
  totalRows: number;
  succeededRows: number;
  failedRows: number;
  skippedRows: number;
};

export type CsvImportProgress = CsvImportCounts & {
  processedRows: number;
  status: CsvImportStatus;
};

export type CsvImportError = {
  line: number | null;
  message: string;
};

export const CSV_IMPORT_ERROR_LIMIT = 100;

/**
 * Derive persisted counters and status from a lifecycle phase. Keeping this
 * pure makes browser, route-handler, and future worker implementations agree.
 */
export function resolveCsvImportProgress(
  counts: CsvImportCounts,
  phase: CsvImportPhase,
): CsvImportProgress {
  const entries = Object.entries(counts);
  for (const [name, value] of entries) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer.`);
    }
  }

  const processedRows = counts.succeededRows + counts.failedRows + counts.skippedRows;
  if (processedRows > counts.totalRows) {
    throw new RangeError("Processed CSV row counts cannot exceed totalRows.");
  }
  if (phase === "completed" && processedRows !== counts.totalRows) {
    throw new RangeError("A completed CSV import must account for every row.");
  }

  let status: CsvImportStatus;
  if (phase === "pending") {
    status = "pending";
  } else if (phase === "running") {
    status = "running";
  } else if (phase === "failed") {
    status = counts.succeededRows > 0 ? "partial" : "failed";
  } else if (counts.failedRows > 0) {
    status = counts.succeededRows > 0 ? "partial" : "failed";
  } else {
    status = "succeeded";
  }

  return { ...counts, processedRows, status };
}

/** Retain a bounded, stable diagnostic sample instead of growing JSON forever. */
export function mergeCsvImportErrors(
  existing: readonly CsvImportError[],
  incoming: readonly CsvImportError[],
  limit = CSV_IMPORT_ERROR_LIMIT,
): CsvImportError[] {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError("CSV import error limit must be a non-negative safe integer.");
  }
  return [...existing, ...incoming].slice(0, limit);
}
