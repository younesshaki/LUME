/**
 * Pure aggregations behind /admin/[tenant]/analytics. The page fetches
 * tenant-scoped rows; everything here is deterministic data-shaping so it
 * can be unit-tested without a database.
 */

export type DayCount = { date: string; label: string; count: number };
export type NameCount = { name: string; count: number };
export type PriceBucket = { label: string; count: number };

/** YYYY-MM-DD in UTC — leads timestamps are timestamptz. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shortLabel(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Daily lead counts over the trailing `days` window (inclusive of today),
 * with zero-filled gaps so the time axis is continuous.
 */
export function leadsPerDay(
  createdAts: string[],
  days: number,
  today: Date = new Date()
): DayCount[] {
  const counts = new Map<string, number>();
  for (const value of createdAts) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) continue;
    const key = dayKey(parsed);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: DayCount[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = new Date(today.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = dayKey(day);
    series.push({ date: key, label: shortLabel(day), count: counts.get(key) ?? 0 });
  }
  return series;
}

/**
 * Count rows per value (case-preserving on first occurrence, grouping
 * case-insensitively), sorted desc, keeping the top `limit` and folding the
 * rest into "Other". Blank/null values group under `blankLabel`.
 */
export function countByValue(
  values: Array<string | null | undefined>,
  limit: number,
  blankLabel = "Unknown"
): NameCount[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const raw of values) {
    const trimmed = (raw ?? "").trim();
    const name = trimmed || blankLabel;
    const key = name.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { name, count: 1 });
  }

  const sorted = [...counts.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name)
  );
  if (sorted.length <= limit) return sorted;

  const kept = sorted.slice(0, limit);
  const otherCount = sorted.slice(limit).reduce((sum, item) => sum + item.count, 0);
  kept.push({ name: "Other", count: otherCount });
  return kept;
}

/** Round a raw bucket width up to a friendly step (1/2/2.5/5 × 10^n). */
export function niceBucketSize(rawSize: number): number {
  if (rawSize <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rawSize));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (rawSize <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Stable across Node/ICU builds used locally, in CI, and on Vercel. */
function compactUsd(value: number): string {
  const magnitude = Math.abs(value);
  const [divisor, suffix] = magnitude >= 1_000_000_000
    ? [1_000_000_000, "B"]
    : magnitude >= 1_000_000
      ? [1_000_000, "M"]
      : magnitude >= 1_000
        ? [1_000, "K"]
        : [1, ""];
  const scaled = value / divisor;
  const label = Number.isInteger(scaled)
    ? String(scaled)
    : scaled.toFixed(1).replace(/\.0$/, "");
  return `$${label}${suffix}`;
}

/**
 * Fixed lower edges (USD) for the asking-price buckets. Each bucket runs
 * [edge, nextEdge); the final edge is open-ended ($100K+). Ranges are
 * intentionally non-uniform to match how used-car inventory actually clusters.
 */
const PRICE_BUCKET_EDGES = [0, 15_000, 25_000, 40_000, 60_000, 100_000] as const;

/**
 * Histogram of prices across the fixed business buckets:
 * $0–$15K, $15K–$25K, $25K–$40K, $40K–$60K, $60K–$100K, $100K+.
 * All buckets are kept (zero-filled) so the shape reads honestly; an empty
 * input returns no bars at all.
 */
export function priceHistogram(prices: number[]): PriceBucket[] {
  const valid = prices.filter((price) => Number.isFinite(price) && price >= 0);
  if (valid.length === 0) return [];

  const buckets: PriceBucket[] = PRICE_BUCKET_EDGES.map((from, index) => {
    const to = PRICE_BUCKET_EDGES[index + 1];
    return {
      label: to === undefined ? `${compactUsd(from)}+` : `${compactUsd(from)}–${compactUsd(to)}`,
      count: 0,
    };
  });

  for (const price of valid) {
    let index = PRICE_BUCKET_EDGES.length - 1;
    for (let i = 0; i < PRICE_BUCKET_EDGES.length - 1; i++) {
      if (price < PRICE_BUCKET_EDGES[i + 1]) {
        index = i;
        break;
      }
    }
    buckets[index].count += 1;
  }
  return buckets;
}
