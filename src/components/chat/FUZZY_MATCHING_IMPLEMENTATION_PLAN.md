# Implementation Plan: Fuzzy Matching for Typo Tolerance in LUME Chatbot

## 1. Fuzzy Matching Algorithm

**Recommended: Levenshtein Distance** (edit distance) with a **relative threshold** based on string length.

### Why Levenshtein?
- Simple, well-tested, handles insertions, deletions, substitutions (most common typos).
- Lightweight for short strings (car makes, body styles, fuel types).
- Can be extended with weighted edits if needed.

### Threshold Strategy
- For short strings (< 10 characters): allow up to **2 edits** (e.g., “Ferari” → “Ferrari” requires 1 edit; “Lamborghni” → “Lamborghini” requires 1 edit).
- For longer strings (≥ 10 characters): allow up to **3 edits**.
- Alternative: use a **relative threshold** like `maxDistance = floor(target.length / 3)` (e.g., 33% of length). This adapts to different query lengths.
- **Normalized Levenshtein**? If needed, compute similarity = `1 - (distance / max(len1, len2))`, accept if similarity ≥ 0.7 (tunable).

**Implementation (TypeScript):**
```typescript
function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,    // deletion
        dp[i][j - 1] + 1,    // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return dp[a.length][b.length];
}

function isFuzzyMatch(query: string, target: string, maxDistance?: number): boolean {
  const dist = levenshteinDistance(query.toLowerCase(), target.toLowerCase());
  if (maxDistance === undefined) {
    // Default: 33% of target length, min 1, max 3
    maxDistance = Math.max(1, Math.min(3, Math.floor(target.length / 3)));
  }
  return dist <= maxDistance;
}
```

> **Note:** Case-insensitive comparison is critical. The above uses `.toLowerCase()`.

---

## 2. Integration Points in `ragService.ts`

The RAG system uses `scoreChunkByKeywords()` for keyword‑based chunk scoring. The vehicle filtering likely uses `vehicle.includes(makeAlias)` or similar constructs.

### 2.1 Modify `scoreChunkByKeywords()`
**Current behavior:** checks if any chunk keyword (or alias) `includes` the user query token.

**Change:**
- After exact-match fails, run a **fuzzy match** between the user’s token and each known keyword/alias.
- Boost the chunk score if a fuzzy match is found (e.g., add `0.5 * MAX_SCORE` instead of full score for exact match). This prevents false positives from dominating relevant chunks.

### 2.2 Vehicle Inventory Filtering
The filtering logic (e.g., in a `filterVehicles()` function) usually does:
```typescript
const alias = MAKE_ALIASES[make] || make;
return vehicles.filter(v => v.make.includes(alias));
```

**Change:**
- For each vehicle attribute (make, model, body style, etc.), first try exact alias lookup. If no alias found, perform fuzzy matching against the list of known makes and their aliases.
- Example: user types “Lamborghni” → fuzzy match against all keys in `MAKE_ALIASES` → find “Lamborghini” → use its canonical alias for filtering.

### 2.3 Query Parsing Phase
Add a **preprocessing step** that uses fuzzy matching to correct common typos in the user query before passing to downstream logic. This centralises correction and reduces complexity.

**Workflow:**
1. Tokenize user query (e.g., split by spaces and punctuation).
2. For each token, try to map to a known make/model/body style using fuzzy matching.
3. Replace the original token with the canonical form (or the matched alias).
4. Proceed with existing exact‑match logic.

> **Pro:** Keeps existing code unchanged.  
> **Con:** Must maintain a canonical “dictionary” of all vehicle terms.

---

## 3. Make Aliases Fuzzy

Extend the current `MAKE_ALIASES` map (exact key → array of aliases) with a **fuzzy lookup function**.

### Implementation
```typescript
const MAKE_ALIASES: Record<string, string[]> = {
  "Lamborghini": ["lamborghini", "lambo", "lamborghini"],
  "Ferrari": ["ferrari", "ferrari"],
  "BMW": ["bmw", "beemer", "bimmer"],
  // ...
};

function fuzzyLookupMake(query: string): string | null {
  const normalizedQuery = query.toLowerCase().trim();
  // 1. Exact match against alias lists
  for (const [canonical, aliases] of Object.entries(MAKE_ALIASES)) {
    if (aliases.includes(normalizedQuery)) return canonical;
  }
  // 2. Fuzzy match against canonical names and all aliases
  let bestDistance = Infinity;
  let bestCanonical: string | null = null;
  const candidates = Object.entries(MAKE_ALIASES).flatMap(([canonical, aliases]) => 
    [canonical.toLowerCase(), ...aliases.map(a => a.toLowerCase())].map(candidate => ({ candidate, canonical }))
  );
  for (const { candidate, canonical } of candidates) {
    const dist = levenshteinDistance(normalizedQuery, candidate);
    if (dist < bestDistance && dist <= getMaxDistance(candidate)) {
      bestDistance = dist;
      bestCanonical = canonical;
    }
  }
  return bestCanonical;
}

function getMaxDistance(target: string): number {
  return Math.max(1, Math.min(3, Math.floor(target.length / 3)));
}
```

**Usage:** `const make = fuzzyLookupMake(userQuery)`.

---

## 4. Vehicle Filtering Fuzzy

Apply the same approach to:
- **Body styles** (Sedan, SUV, Coupe, Convertible)
- **Fuel types** (Gasoline, Diesel, Electric, Hybrid)
- **Drivetrains** (FWD, RWD, AWD, 4WD)

Create analogous dictionaries:
```typescript
const BODY_STYLE_ALIASES: Record<string, string[]> = {
  "SUV": ["suv", "s.u.v.", "sport utility vehicle", "4x4", "off-road"],
  "Sedan": ["sedan", "saloon", "four-door"],
  // ...
};
```

Fuzzy match each user token against the flat list of all aliases. If matched, replace with canonical form.

**Edge case:** A token might match multiple categories (e.g., “sport” could be body style or model trim). Use **longest match** or **first match** based on context. For simplicity, prioritize the largest category (make > model > body style > fuel > drivetrain).

---

## 5. Performance Considerations

### On-Demand vs Precomputed
- **Dictionary size:** Total unique vehicle terms < 100. Levenshtein distance on strings < 20 characters is negligible (< 0.01ms per comparison).
- **Precomputation overhead unnecessary.** Compute distance at runtime.
- **Caching:** For repeated queries (same token), cache fuzzy results in a `Map<string, string>` within the session (in-memory). Since queries vary, this adds minimal benefit but is trivial to implement.

### Optimizations
- Use **early exit** in Levenshtein: if strings differ in length by more than maxDistance, return `maxDistance + 1` immediately.
- Limit fuzzy matching to **high‑confidence contexts** (e.g., only after a question about inventory, not for every word in the query). This can be done by checking if the query contains inventory‑related keywords (“inventory”, “stock”, “have”, “available”, etc.) – but often the whole query should be checked for vehicle terms.

### Scalability
- If the vehicle list grows to thousands, consider **Trie with fuzzy search** or **BK‑tree** for faster nearest‑neighbor lookup. Not needed now.

---

## 6. Implementation Steps

### Step 1: Add `fuzzyMatch.ts` utility
Create `/utils/fuzzyMatch.ts` with:
- `levenshteinDistance(a, b)`
- `isFuzzyMatch(query, target, maxDistance?)`
- `fuzzyLookup(query, dictionary)` – generic lookup returning canonical term or null.

### Step 2: Update `ragService.ts`
- Import fuzzy matching functions.
- In `scoreChunkByKeywords()`, after exact match loop, add a second pass that checks fuzzy match for any unmatched tokens. Only apply to known keywords (e.g., makes, models, body styles). It may be more efficient to build a `Set` of all known terms and test fuzzy against that.

### Step 3: Add make/mode/body style dictionaries
- Define `MAKE_ALIASES`, `BODY_STYLE_ALIASES`, `FUEL_ALIASES`, `DRIVETRAIN_ALIASES` in a config file (e.g., `vehicleAliases.ts`).

### Step 4: Modify vehicle filtering logic
- In the filter handler, use `fuzzyLookupMake()` to get the canonical make before filtering.
- Similarly for body style, fuel, drivetrain.

### Step 5: Add user query correction (optional)
- In the RAG pipeline, before keyword extraction, run a `correctUserQuery()` function that replaces fuzzy‑matched tokens with canonical forms. This improves downstream exact matching.

### Step 6: Testing and tuning threshold
- Run integration tests (see §7). If too many false positives (e.g., “car” matched to “Ferrari” because distance ≤ 2), adjust threshold down (e.g., `floor(length/4)` or use absolute max 2).

---

## 7. Test Cases

| User Query | Expected Behavior | Rationale |
|------------|-------------------|-----------|
| `"How many lambos do you have?"` | ✔ Match “lambo” → alias of Lamborghini | Already works, fuzzy not needed |
| `"Do you have any Lamborghni?"` | ✔ Fuzzy match to “Lamborghini” (1 edit) | Missing `i` → distance 1 |
| `"How many Feraris in inventory?"` | ✔ Fuzzy match to “Ferrari” (1 edit) | Missing `r` → distance 1 |
| `"Can I get a BMW X5?"` | ✔ Exact match BMW | Already works |
| `"Show me all SUVs"` | ✔ Exact match `SUV` | Unified casing handled |
| `"Show me all SUV's"` | ✔ Fuzzy match? (apostrophe) – might be handled by tokenization stripping punctuation | Depends on pre‑processing |
| `"I want a electric car"` | ✔ Fuzzy match “electric” → “Electric” (0 edits) | Exact match after normalization |
| `"I want a electrik car"` | ✔ Fuzzy match “electrik” → “Electric” (1 edit) | ‘c’→‘k’ substitution |
| `"How many Lamborghini Diablo?"` | ✔ Exact match Lamborghini; “Diablo” may be typo for model? If model not in dictionary, ignore fuzzy | Only touch known terms |
| `"List all vehickles"` | ✗ No match (no known term) | Fallback to original behavior – no false positive |
| `"Ford mustang"` | ✔ Fuzzy match “Ford” (if in make list) and “Mustang” (model) | Must have Ford in make aliases |
| `"I need a four-wheel drive"` | ✔ Fuzzy match “four-wheel drive” → “AWD” or “4WD” | Depends on alias dictionary |

**False Positive Protection:** Ensure that short queries like “a” or “car” (length < 4) are not fuzzy‑matched to any make (distance would be large, but threshold should be low for short strings). For a 1‑letter query, maxDistance = 1 (by formula `max(1, floor(1/3))` = 1). However, comparing “a” to “Audi” → distance 3 > 1, so no match. Good.

---

## 8. Fallback Behavior

When no fuzzy match is found for any known term in the user query:

1. **Keep existing logic:** The RAG system will return results based on keyword matching against chunk content (which may be empty). Vehicle filtering will return no vehicles if the make/model is unknown.
2. **Log unmatched tokens:** Record the user’s unknown terms for later dictionary expansion (e.g., “vehickles” might be added as a typo for “vehicle” if common).
3. **User feedback:** Optionally, the chatbot can say “I didn’t recognize [term]. Did you mean [suggestion]?” But this requires confidence scoring and a natural language response – may be overkill for initial implementation. Instead, just return results as before.
4. **Default response:** If after fuzzy logic the inventory query returns zero results, respond with “I couldn’t find any vehicles matching your description. Try different terms or check our available inventory.”

**Edge Cases:**
- **Multiple typos:** User types “lamborghni” and “ferrari” in same query. The fuzzy lookup will correct both independently.
- **Partial matching:** “Lamborgh” could match “Lamborghini” (distance 4) but threshold for target length (11) would be max 3. So it wouldn’t match. This is acceptable – we don’t want to match too aggressively.
- **User types “lambo” (exact alias) and “ferrari” (typo):** Works because exact alias lookup runs first, fuzzy only for remaining tokens.

---

## Summary of Code Changes

| File | Change |
|------|--------|
| `/utils/fuzzyMatch.ts` | New – Levenshtein, fuzzy checks, generic lookup |
| `/config/vehicleAliases.ts` | New – MAKES, BODIES, FUELS, DRIVETRAINS dictionaries |
| `/services/ragService.ts` | Import fuzzyMatch; modify `scoreChunkByKeywords()` to include fuzzy scores |
| `/services/inventoryService.ts` | Use `fuzzyLookupMake()` for vehicle filtering |
| `/services/deepseekService.ts` (optional) | Add query correction step before sending to RAG |

**Deployment:**
- Include these changes in a feature branch, test with the provided examples.
- Monitor chat logs for unhandled typos to refine dictionaries and thresholds.

---

**Appendix: Quick Reference – Levenshtein Implementation**

```typescript
export function levenshteinDistance(a: string, b: string): number {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,          // del
        dp[i][j - 1] + 1,          // ins
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // sub
      );
    }
  }
  return dp[n][m];
}
```

---

This plan provides a robust, maintainable path to adding typo tolerance
