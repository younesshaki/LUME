import type { ManagedFeedParseResult } from "./managedFeed";

/** Pure no-op policy for a managed supplier source. */
export function shouldSkipUnchangedManagedFeed(
  lastSuccessfulSourceHash: string | null,
  sourceHash: string,
  currentConfigVersion: number,
  snapshotConfigVersion: number,
): boolean {
  return Boolean(
    lastSuccessfulSourceHash &&
    lastSuccessfulSourceHash === sourceHash &&
    currentConfigVersion === snapshotConfigVersion,
  );
}

export function normalizedManagedFeedIdentity(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

/** Historical sold/archived records are never repurposed by a new feed row. */
export function protectedVehicleHistoryMessage(
  feedVin: string | null | undefined,
  externalId: string | null | undefined,
  protectedByVin: ReadonlyMap<string, string>,
  protectedByExternalId: ReadonlyMap<string, string>,
): string | null {
  const vin = normalizedManagedFeedIdentity(feedVin);
  const stock = normalizedManagedFeedIdentity(externalId);
  if (vin && protectedByVin.has(vin)) {
    return "VIN belongs to a sold or archived vehicle; this feed row was skipped to preserve vehicle history.";
  }
  if (stock && protectedByExternalId.has(stock)) {
    return "Stock number belongs to a sold or archived vehicle; this feed row was skipped to preserve vehicle history.";
  }
  return null;
}

/**
 * Raw malformed rows are intentionally not materialized as sync candidates.
 * Count them separately so run history never reports a clean one-row run when
 * the physical source actually contained an invalid sibling.
 */
export function countUnmappedManagedFeedInvalidRecords(
  parsed: Pick<ManagedFeedParseResult, "records" | "issues">,
): number {
  const materializedIndexes = new Set(parsed.records.map((record) => record.index));
  const rawInvalidIndexes = new Set<number>();
  for (const issue of parsed.issues) {
    if (issue.code !== "invalid_record" || issue.recordIndex === undefined) continue;
    if (!materializedIndexes.has(issue.recordIndex)) rawInvalidIndexes.add(issue.recordIndex);
  }
  return rawInvalidIndexes.size;
}
