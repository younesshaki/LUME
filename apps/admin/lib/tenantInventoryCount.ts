/**
 * Tenant-wide live vehicle count, cached briefly.
 *
 * `SystemPromptOptions.totalInventory` drives one line in the assembled
 * prompt — "Total vehicles in full inventory: N" — and the route never set it,
 * so the line was always omitted. With a filter active the model could only
 * see TOTAL MATCHING, which made "how many cars do you have?" answerable only
 * as "how many match your current filters". That is the reported failure in
 * its most direct form.
 *
 * Why a cache rather than the facets RPC: vehicle_facets_v2 returns no count,
 * and adding one changes its `returns table` signature, which Postgres cannot
 * do with CREATE OR REPLACE — it needs a DROP and re-GRANT. Not worth a
 * migration for one integer. A head-only count is cheap and this makes it at
 * most one per tenant per minute.
 *
 * Deliberately in-memory, matching lib/rateLimit.ts: with Fluid Compute reusing
 * instances this collapses nearly all the traffic, and a stale-by-a-minute
 * catalogue size has no correctness consequence — it is context for prose, not
 * a number any decision is made from.
 */

const TTL_MS = 60_000;

/** Bound the map so a spray of tenant ids cannot grow memory without limit. */
const MAX_TRACKED_TENANTS = 1_000;

type Entry = { value: number | undefined; expiresAt: number };

const cache = new Map<string, Entry>();

export type InventoryCountReader = (tenantId: string) => Promise<number | undefined>;

export async function tenantLiveVehicleCount(
  tenantId: string,
  read: InventoryCountReader,
  nowMs: number = Date.now(),
): Promise<number | undefined> {
  const cached = cache.get(tenantId);
  if (cached && cached.expiresAt > nowMs) return cached.value;

  let value: number | undefined;
  try {
    value = await read(tenantId);
  } catch {
    // The count is decoration on the prompt. A failure here must never fail
    // the turn — the prompt simply omits the line, exactly as it did before.
    value = undefined;
  }

  if (cache.size >= MAX_TRACKED_TENANTS) {
    for (const [key, entry] of cache) if (entry.expiresAt <= nowMs) cache.delete(key);
  }
  cache.set(tenantId, { value, expiresAt: nowMs + TTL_MS });
  return value;
}

/** Test hook. */
export function clearTenantInventoryCountCache(): void {
  cache.clear();
}
