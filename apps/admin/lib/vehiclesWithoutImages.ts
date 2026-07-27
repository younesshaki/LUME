import type { VehicleStatus } from "@lume/types";

/**
 * Bulk photo-hygiene: finding every vehicle in a tenant with no photo at all.
 *
 * "Has a photo" matches the inventory grid's filter exactly — a managed R2
 * image, a special image source, or a legacy feed URL. Miss any one of those
 * and we would archive vehicles that visibly do show a picture.
 */

/** Statuses that bulk photo-archiving is allowed to touch. */
export const ARCHIVABLE_STATUSES: readonly VehicleStatus[] = ["draft", "live"];

/** PostgREST caps a select at 1000 rows by default, so reads are paged. */
export const READ_PAGE_SIZE = 1000;

/** Keeps each UPDATE's `in` list to a sane size. */
export const WRITE_CHUNK_SIZE = 200;

export type VehicleImageSourceRow = {
  id: string;
  image_src: string | null;
  special_image_src: string | null;
};

/**
 * Vehicles with no photo from any source.
 *
 * Deliberately excludes `sold` and `archived` — callers only ever pass
 * draft/live rows. Archiving a sold vehicle is a permitted transition, but it
 * overwrites the `sold` status and would quietly corrupt sales reporting, so
 * bulk hygiene must never do it.
 */
export function selectVehicleIdsWithoutImages(
  rows: readonly VehicleImageSourceRow[],
  managedVehicleIds: ReadonlySet<string>,
): string[] {
  return rows
    .filter(
      (row) =>
        !row.image_src?.trim() &&
        !row.special_image_src?.trim() &&
        !managedVehicleIds.has(row.id),
    )
    .map((row) => row.id);
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size < 1) return [[...items]];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
