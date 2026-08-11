/**
 * Paged collection of the vehicle ids that own a managed image row.
 *
 * Extracted from the concierge's photo-gap inspection so the error policy can
 * be tested without a Supabase client. The policy is the whole point of this
 * module, and it is narrower than it looks:
 *
 * - `42P01` (undefined_table) means the managed-image table does not exist on
 *   this deployment yet. Managed images are optional; legacy `image_src` and
 *   `special_image_src` still count, so an empty set is a truthful answer.
 * - Any other error means the read was *truncated*, not absent. Returning the
 *   pages gathered so far would undercount coverage and report vehicles as
 *   photoless purely because their row sat on a page that never loaded.
 *
 * Callers must treat `ok: false` as a failed request. A wrong coverage
 * percentage is worse than no percentage: it tells a dealer their stock is
 * invisible to shoppers when it is not.
 */

export type ManagedImagePage = {
  data: Array<{ vehicle_id: string }> | null;
  error: { code?: string } | null;
};

export type ManagedImageScan =
  | { ok: true; vehicleIds: Set<string> }
  | { ok: false };

export const MANAGED_IMAGE_PAGE_SIZE = 1000;

/** Postgres undefined_table — the one error that degrades instead of failing. */
const UNDEFINED_TABLE = "42P01";

export async function collectManagedImageVehicleIds(
  fetchPage: (from: number, to: number) => Promise<ManagedImagePage>,
  pageSize: number = MANAGED_IMAGE_PAGE_SIZE,
): Promise<ManagedImageScan> {
  const vehicleIds = new Set<string>();
  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      // Absent table: no managed images anywhere, which an empty set states
      // correctly. Anything else means we read part of the table.
      if (error.code === UNDEFINED_TABLE) return { ok: true, vehicleIds };
      return { ok: false };
    }
    for (const image of data ?? []) vehicleIds.add(image.vehicle_id);
    if (!data || data.length < pageSize) break;
  }
  return { ok: true, vehicleIds };
}
