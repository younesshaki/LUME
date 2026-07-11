import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@lume/db";

type DbClient = SupabaseClient<Database, "public">;

export type UsageMeteringTenant = { id: string; slug: string };

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGES = 10_000;

/** Keyset pagination avoids Supabase's response cap and offset races. */
export async function loadUsageMeteringTenants(
  client: DbClient,
  options: { pageSize?: number; maxPages?: number } = {},
): Promise<UsageMeteringTenant[] | null> {
  const pageSize = boundedInteger(options.pageSize, DEFAULT_PAGE_SIZE, 1, 1_000);
  const maxPages = boundedInteger(options.maxPages, MAX_PAGES, 1, MAX_PAGES);
  const tenants: UsageMeteringTenant[] = [];
  let cursor: string | null = null;

  try {
    for (let page = 0; page < maxPages; page += 1) {
      let query = client
        .from("tenants")
        .select("id, slug")
        .order("id", { ascending: true })
        .limit(pageSize);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) return null;
      const rows = data ?? [];
      tenants.push(...rows);
      if (rows.length < pageSize) return tenants;
      const nextCursor = rows.at(-1)?.id ?? null;
      if (!nextCursor || nextCursor === cursor) return null;
      cursor = nextCursor;
    }
    return null;
  } catch {
    return null;
  }
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Number.isSafeInteger(value) && value !== undefined
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}
