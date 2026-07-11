import { describe, expect, it } from "vitest";
import {
  mergeCsvImportErrors,
  resolveCsvImportProgress,
  type CsvImportCounts,
} from "./csvImports";

const counts = (overrides: Partial<CsvImportCounts> = {}): CsvImportCounts => ({
  totalRows: 10,
  succeededRows: 0,
  failedRows: 0,
  skippedRows: 0,
  ...overrides,
});

describe("CSV import progress", () => {
  it("preserves pending and running lifecycle states", () => {
    expect(resolveCsvImportProgress(counts(), "pending")).toMatchObject({
      status: "pending",
      processedRows: 0,
    });
    expect(resolveCsvImportProgress(counts({ succeededRows: 4 }), "running")).toMatchObject({
      status: "running",
      processedRows: 4,
    });
  });

  it("distinguishes successful, partial, and failed terminal outcomes", () => {
    expect(resolveCsvImportProgress(counts({ succeededRows: 8, skippedRows: 2 }), "completed"))
      .toMatchObject({ status: "succeeded", processedRows: 10 });
    expect(resolveCsvImportProgress(
      counts({ succeededRows: 7, failedRows: 2, skippedRows: 1 }),
      "completed",
    )).toMatchObject({ status: "partial", processedRows: 10 });
    expect(resolveCsvImportProgress(counts({ failedRows: 10 }), "completed"))
      .toMatchObject({ status: "failed", processedRows: 10 });
  });

  it("marks interrupted work partial only after at least one success", () => {
    expect(resolveCsvImportProgress(counts({ succeededRows: 2 }), "failed").status)
      .toBe("partial");
    expect(resolveCsvImportProgress(counts(), "failed").status).toBe("failed");
  });

  it("rejects impossible or unsafe counters", () => {
    expect(() => resolveCsvImportProgress(counts({ succeededRows: 11 }), "running"))
      .toThrow(/exceed/i);
    expect(() => resolveCsvImportProgress(counts({ totalRows: 1.5 }), "running"))
      .toThrow(/safe integer/i);
    expect(() => resolveCsvImportProgress(counts({ succeededRows: 9 }), "completed"))
      .toThrow(/every row/i);
  });

  it("bounds retained row diagnostics", () => {
    const first = [{ line: 2, message: "bad year" }];
    const second = [
      { line: 3, message: "missing make" },
      { line: null, message: "batch failed" },
    ];
    expect(mergeCsvImportErrors(first, second, 2)).toEqual([
      first[0],
      second[0],
    ]);
    expect(() => mergeCsvImportErrors([], [], -1)).toThrow(/limit/i);
  });
});
