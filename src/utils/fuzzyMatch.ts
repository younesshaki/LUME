/**
 * Fuzzy matching utilities for recognizing vehicle terms
 * despite minor typos, abbreviations, or variations.
 */

/**
 * Compute the Levenshtein distance between two strings.
 * Uses a classic dynamic programming approach with O(n*m) time and space.
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;

  // Fast path for identical strings
  if (a === b) return 0;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  // Initialize matrix with all zeros and seed first row/column
  const matrix: number[][] = Array.from({ length: aLen + 1 }, () =>
    new Array(bLen + 1).fill(0)
  );

  for (let i = 0; i <= aLen; i++) matrix[i][0] = i;
  for (let j = 0; j <= bLen; j++) matrix[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= aLen; i++) {
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[aLen][bLen];
}

/**
 * Determine a sensible maximum edit distance based on target length.
 *
 * - Very short terms (1-2 chars): 0 (exact match only)
 * - Short terms (3-4 chars): 1
 * - Normal terms (5-7 chars): 2
 * - Longer terms (8+ chars): 3
 */
export function getMaxDistance(target: string): number {
  const len = target.length;
  if (len <= 2) return 0;
  if (len <= 4) return 1;
  if (len <= 7) return 2;
  return 3;
}

/**
 * Check if a query string matches a target string within the allowed edit distance.
 * Comparison is case-insensitive.
 *
 * @param query   The user-supplied term (e.g. "Toiota")
 * @param target  The canonical term we're trying to match (e.g. "Toyota")
 * @param maxDistance  (Optional) Maximum allowed Levenshtein distance.
 *                     If not provided, it is derived from target.length.
 * @returns true if the normalized strings are within maxDistance, false otherwise.
 */
export function isFuzzyMatch(
  query: string,
  target: string,
  maxDistance?: number
): boolean {
  const q = query.trim().toLowerCase();
  const t = target.trim().toLowerCase();
  const dist = levenshteinDistance(q, t);
  const max = maxDistance ?? getMaxDistance(t);
  return dist <= max;
}
