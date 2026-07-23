/**
 * Fuzzy matching utilities with Levenshtein distance algorithm.
 * Production-grade with performance optimizations (early exit, caching).
 */

/** Cache for Levenshtein distance computations within a query session. */
const distanceCache = new Map<string, number>();

/**
 * Compute the Levenshtein (edit) distance between two strings.
 * Uses dynamic programming with O(n*m) complexity.
 *
 * Includes optimizations:
 * - Early exit if length difference exceeds max distance
 * - Caching for repeated comparisons
 */
export function levenshteinDistance(a: string, b: string, maxDistance?: number): number {
  const aLen = a.length;
  const bLen = b.length;

  // Fast path: identical strings
  if (a === b) return 0;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Optimization: if length difference alone exceeds max, skip computation
  const lenDiff = Math.abs(aLen - bLen);
  if (maxDistance !== undefined && lenDiff > maxDistance) {
    return maxDistance + 1;
  }

  // Check cache
  const cacheKey = `${a}|${b}`;
  if (distanceCache.has(cacheKey)) {
    return distanceCache.get(cacheKey)!;
  }

  // Initialize matrix
  const matrix: number[][] = Array.from({ length: aLen + 1 }, () =>
    new Array(bLen + 1).fill(0)
  );

  for (let i = 0; i <= aLen; i++) matrix[i][0] = i;
  for (let j = 0; j <= bLen; j++) matrix[0][j] = j;

  // Fill matrix
  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );

      // Early exit: if current cell exceeds max, no point continuing
      if (maxDistance !== undefined && matrix[i][j] > maxDistance) {
        continue;
      }
    }
  }

  const result = matrix[aLen][bLen];
  distanceCache.set(cacheKey, result);
  return result;
}

/**
 * Determine adaptive maximum edit distance based on target string length.
 * - Length 1-2: 0 (exact match only)
 * - Length 3-4: 1
 * - Length 5-7: 2
 * - Length 8+: 3
 */
export function getMaxDistance(target: string): number {
  const len = target.length;
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

/**
 * Check if a query string fuzzy-matches a target within allowed distance.
 * Case-insensitive by default.
 *
 * @param query The user-supplied term (e.g., "Ferari")
 * @param target The canonical term to match (e.g., "Ferrari")
 * @param maxDistance Optional explicit max distance. If not provided, derived from target length.
 * @returns true if distance ≤ maxDistance
 */
export function isFuzzyMatch(query: string, target: string, maxDistance?: number): boolean {
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();

  if (q === t) return true; // exact match
  if (!q || !t) return false; // empty strings don't match

  const max = maxDistance ?? getMaxDistance(t);
  const dist = levenshteinDistance(q, t, max);
  return dist <= max;
}

/**
 * Look up a query term in a dictionary of canonical → aliases.
 * Returns the canonical form if found (via exact alias or fuzzy match).
 *
 * @param query The user-supplied term
 * @param dictionary The aliases dictionary (canonical → string[])
 * @returns Canonical term (lowercase) or null
 */
export function fuzzyLookup<T extends string>(
  query: string,
  dictionary: Record<T, string[]>
): T | null {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return null;

  // Step 1: Exact alias match
  for (const [canonical, aliases] of Object.entries(dictionary) as Array<[T, string[]]>) {
    if (aliases.some((a: string) => a.toLowerCase() === trimmed)) {
      return canonical as T;
    }
  }

  // Step 2: Fuzzy match against canonicals
  let bestDistance = Infinity;
  let bestMatch: T | null = null;

  for (const canonical of Object.keys(dictionary) as T[]) {
    const maxDist = getMaxDistance(canonical);
    const dist = levenshteinDistance(trimmed, canonical.toLowerCase(), maxDist);

    if (dist <= maxDist && dist < bestDistance) {
      bestDistance = dist;
      bestMatch = canonical;
    }
  }

  return bestMatch;
}

/**
 * Correction record: original token → corrected token.
 */
export type Correction = {
  original: string;
  corrected: string;
};

/**
 * Correct typos in a query by matching tokens against known terms.
 * Splits query, fuzzy-matches each token, replaces with canonical form.
 *
 * @param query The user's raw query (e.g., "ferari lamborghni")
 * @param knownTerms Set of all known vehicle terms (canonicals + aliases)
 * @param maxDistance Optional max edit distance
 * @param neverCorrect Ordinary words that must never be rewritten into a
 *   vehicle term — live-reproduced 2026-07-23: "compare the first two" had
 *   "compare" corrected into the catalog model "compass", producing
 *   "Nothing matches 2026 Compass" for a comparison request.
 * @returns Object with corrected query string and list of corrections applied
 */
export function correctQuery(
  query: string,
  knownTerms: Set<string>,
  maxDistance?: number,
  neverCorrect?: ReadonlySet<string>,
): { corrected: string; corrections: Correction[] } {
  const tokens = query
    .toLowerCase()
    .split(/[\s\-_.,!?;:'"()]+/) // tokenize on whitespace and punctuation
    .filter((t) => t.length > 0);

  const corrections: Correction[] = [];
  const correctedTokens = tokens.map((token) => {
    // Try exact match first
    if (knownTerms.has(token)) {
      return token;
    }

    // Ordinary vocabulary stays as the visitor wrote it — only real typos of
    // real vehicle terms may be rewritten.
    if (neverCorrect?.has(token)) {
      return token;
    }

    // Try fuzzy match against known terms
    let bestDistance = Infinity;
    let bestMatch: string | null = null;

    for (const known of knownTerms) {
      const max = maxDistance ?? getMaxDistance(known);
      const dist = levenshteinDistance(token, known, max);

      if (dist <= max && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = known;
      }
    }

    if (bestMatch && bestMatch !== token) {
      corrections.push({ original: token, corrected: bestMatch });
      return bestMatch;
    }

    return token;
  });

  return {
    corrected: correctedTokens.join(" "),
    corrections,
  };
}

/**
 * Clear the distance cache (useful for testing or memory management).
 */
export function clearCache(): void {
  distanceCache.clear();
}
