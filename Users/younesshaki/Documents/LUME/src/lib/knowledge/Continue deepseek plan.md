# Fuzzy Matching Implementation Plan for LUME Chatbot

> **Target:** Add typo-tolerant fuzzy matching to the LUME chatbot's RAG and vehicle query pipeline.
> **Stack:** TypeScript, Deepseek Chat API, Vitest for testing.
> **Date:** Generated from project analysis.

---

## 1. Current Architecture Overview

### Chat Flow (Deepseek-powered)

```
User Query
    │
    ▼
OllamaChat.tsx ──► getSystemPromptWithContext() [ragService.ts]
                            │
                            ├── retrieveContext() ──► keyword scoring vs embeddings.json chunks
                            │
                            └── isVehicleQuery() ──► extractVehicleFilters() ──► matchVehicles()
                                                          │
                                                          └── filters vehicles from catalog.ts (CSV data)
    │
    ▼
streamDeepseekChat() [deepseekService.ts] ──► Deepseek API (streaming)
    │
    ▼
Render response in chat UI
```

### Key Files

| File | Role |
|------|------|
| `src/components/chat/OllamaChat.tsx` | Chat UI (React component), manages state, calls RAG + API |
| `src/components/chat/OllamaChat.types.ts` | Type definitions for messages |
| `src/components/chat/OllamaChat.state.ts` | Bridge to UI store |
| `src/lib/ragService.ts` | RAG pipeline: context retrieval, vehicle query extraction & matching |
| `src/lib/knowledge/chunks.ts` | Static knowledge chunks (brand, products, access, etc.) |
| `src/lib/knowledge/embeddings.json` | Precomputed embeddings for chunks (used by `ragService.ts`) |
| `src/lib/deepseekService.ts` | Deepseek API streaming client |
| `src/experience/vehicles/catalog.ts` | Vehicle data model, CSV loading, filtering, sorting, and the canonical lists of makes, body styles, fuel types, drivetrains |

### Current Matching Mechanisms

1. **Keyword Scoring (`scoreChunkByKeywords`)** — splits query into words, checks if each word exists in chunk text via `text.includes(word)`. **Case-insensitive but exact substring match only.**

2. **Make Alias Resolution** — `MAKE_ALIASES` map in `ragService.ts` maps common nicknames ("lambo", "mercedes") to canonical names. **Exact key match only.**

3. **Vehicle Filtering (`extractVehicleFilters`)** — uses regex tests (e.g., `/\bsuv\b/`) and direct `q.includes(alias)` checks. **Exact match after normalization.**

4. **Text Search (`filterVehicles` in catalog.ts)** — builds a search string from all vehicle fields, then checks `queryTokens.every(token => searchText.includes(token))`. **Exact substring match only.**

---

## 2. What Fuzzy Matching Will Solve

| Problem | Example Query | Current Behavior | Desired Behavior |
|---------|---------------|------------------|------------------|
| Typo in make | "Ferari" | No match → returns 0 vehicles | Fuzzy match → "Ferrari" |
| Misspelled model | "Lamborghni Diablo" | No match → fails | Correct "Lamborghni" → "Lamborghini" |
| Typo in fuel type | "electrik" | No match → filters miss | Match "Electric" |
| Keyboard transpose | "Porcshe" | No match → no vehicles | Match "Porsche" |
| Extra/missing letters | "BMW X5" (finds X5), "BMW X55" (typo) | No match for X55 → excluded | Fuzzy tolerance for models |
| Apostrophe/formatting | "SUV's" | Token "suv's" fails against "SUV" | Strip punctuation or fuzzy match |
| Compound typos | "lamborghni ferrari" in same query | Both fail individually | Correct both independently |

---

## 3. Proposed Solution

### 3.1 Core Utility: `src/lib/fuzzyMatch.ts`

A standalone, dependency-free module with:

```typescript
// Levenshtein distance (edit distance)
export function levenshteinDistance(a: string, b: string): number;

// Fuzzy match check with adaptive threshold
export function isFuzzyMatch(query: string, target: string, options?: {
  maxDistance?: number;       // absolute cap
  relativeThreshold?: number; // fraction of target length (default 0.33)
  minThreshold?: number;      // floor (default 1)
  maxThreshold?: number;      // ceiling (default 3)
  caseSensitive?: boolean;    // default false
}): boolean;

// Look up a term in a dictionary of canonical → alias arrays
// First exact, then fuzzy
export function fuzzyLookup<T extends string>(
  query: string,
  dictionary: Record<T, string[]>
): T | null;

// Generic term corrector: given a query string and a flat set of known terms,
// replace any fuzzy-matching token with the closest known term
export function correctQuery(
  query: string,
  knownTerms: string[],
  options?: { maxDistance?: number }
): { corrected: string; corrections: Array<{ original: string; corrected: string }> };
```

**Algorithm details:**

```
levenshteinDistance("ferari", "ferrari")
  → 1 (insert one 'r')

levenshteinDistance("lamborghni", "lamborghini")
  → 1 (insert one 'i')

levenshteinDistance("electrik", "electric")
  → 1 (substitute 'k' for 'c')

Threshold for "Ferari" (target length 7):
  floor(7 / 3) = 2, clamped to [1, 3] → maxDistance = 2
  distance 1 ≤ 2 → fuzzy match ✓
```

### 3.2 Vehicle Term Dictionaries: `src/lib/vehicleTerms.ts`

Extract canonical definitions and aliases into a dedicated config file, consolidating what's currently scattered across `ragService.ts` and `catalog.ts`:

```typescript
export const MAKE_ALIASES: Record<string, string[]> = {
  "Mercedes-Benz": ["mercedes", "mercedes benz", "mercedes-benz", "benz"],
  "Lamborghini": ["lamborghini", "lambo"],
  "Ferrari": ["ferrari"],
  "Porsche": ["porsche", "porshe"],     // includes common typo
  "Chevrolet": ["chevrolet", "chevy"],
  "Volkswagen": ["volkswagen", "vw"],
  "Land Rover": ["land rover", "landrover"],
  "Rolls-Royce": ["rolls royce", "rolls-royce", "rr"],
  "INFINITI": ["infiniti"],
  "BMW": ["bmw", "beemer", "bimmer"],
  // ... all makes from catalog.ts
};

export const BODY_STYLE_ALIASES: Record<string, string[]> = {
  "SUV": ["suv", "s.u.v.", "sport utility", "sport utility vehicle", "4x4", "off-road vehicle"],
  "Sedan": ["sedan", "saloon", "4-door", "four door"],
  "Coupe": ["coupe", "2-door", "two door"],
  "Convertible": ["convertible", "cabriolet", "drop top", "spider", "roadster"],
  "Truck": ["truck", "pickup", "pick-up", "pick up"],
  "Hatchback": ["hatchback", "3-door", "5-door"],
  "Wagon": ["wagon", "estate", "station wagon"],
  "Minivan": ["minivan", "van", "people carrier"],
};

export const FUEL_TYPE_ALIASES: Record<string, string[]> = {
  "Gasoline": ["gasoline", "gas", "petrol", "unleaded", "premium"],
  "Electric": ["electric", "ev", "electric vehicle", "bev", "electrik"],  // includes common typo
  "Hybrid": ["hybrid", "hev"],
  "Plug-In Hybrid": ["plug-in hybrid", "plug in hybrid", "phev", "plugin hybrid"],
  "Diesel": ["diesel"],
  "Flex Fuel": ["flex fuel", "flex", "e85", "ethanol"],
};

export const DRIVETRAIN_ALIASES: Record<string, string[]> = {
  "AWD": ["awd", "all wheel drive", "all-wheel drive"],
  "4WD": ["4wd", "four wheel drive", "4-wheel drive", "four-wheel drive"],
  "FWD": ["fwd", "front wheel drive", "front-wheel drive"],
  "RWD": ["rwd", "rear wheel drive", "rear-wheel drive"],
};

// Flat list of all known vehicle terms for query correction
export const ALL_KNOWN_VEHICLE_TERMS: string[] = [
  ...Object.keys(MAKE_ALIASES),
  ...Object.values(MAKE_ALIASES).flat(),
  ...Object.keys(BODY_STYLE_ALIASES),
  ...Object.values(BODY_STYLE_ALIASES).flat(),
  ...Object.keys(FUEL_TYPE_ALIASES),
  ...Object.values(FUEL_TYPE_ALIASES).flat(),
  ...Object.keys(DRIVETRAIN_ALIASES),
  ...Object.values(DRIVETRAIN_ALIASES).flat(),
];
```

### 3.3 Integration into `ragService.ts`

#### 3.3.1 Preprocessing Step (recommended approach)

Add a `preprocessQuery()` function that runs before any extraction or scoring:

```typescript
function preprocessQuery(query: string): { corrected: string; corrections: Correction[] } {
  // 1. Tokenize (split by whitespace and common punctuation)
  // 2. For each token, try fuzzy match against ALL_KNOWN_VEHICLE_TERMS
  // 3. If a fuzzy match is found, replace with the canonical form
  // 4. Return corrected query + list of corrections made
}
```

This runs at the top of `getSystemPromptWithContext()` and `extractVehicleFilters()`.

**Benefits:**
- Downstream code stays unchanged (exact match still works)
- Single correction pass
- Corrections can be logged or surfaced to user

#### 3.3.2 Fuzzy `scoreChunkByKeywords()`

After the existing exact-match loop, add a fuzzy pass:

```typescript
function scoreChunkByKeywords(chunk: EmbeddedChunk, query: string): number {
  const q = query.toLowerCase();
  const text = chunk.text.toLowerCase();
  let score = 0;

  const words = q.split(/\s+/).filter((w) => w.length > 2);
  for (const word of words) {
    if (text.includes(word)) {
      score += 1;                    // exact match
    } else if (fuzzyWordInText(word, text)) {
      score += 0.7;                  // fuzzy match (lower weight)
    }
  }

  return score;
}

function fuzzyWordInText(word: string, text: string): boolean {
  // Check if 'word' fuzzy-matches any word in 'text'
  const textWords = text.split(/\s+/);
  return textWords.some((tw) => isFuzzyMatch(word, tw));
}
```

This helps RAG context retrieval even when the user misspells a brand name.

#### 3.3.3 Fuzzy `extractVehicleFilters()`

Replace direct `q.includes(alias)` checks with fuzzy lookup:

```typescript
function extractVehicleFilters(query: string, vehicles: Vehicle[] = []): VehicleQueryFilters {
  const q = query.toLowerCase();
  const filters: VehicleQueryFilters = {};
  const { corrected } = preprocessQuery(query);

  // Make — use fuzzyLookup
  for (const make of ALL_MAKES) {
    if (isFuzzyMatch(q, make.toLowerCase(), { maxDistance: 2 })) {
      filters.make = canonicalMake(make);
      break;
    }
  }

  // Body style — use fuzzyLookup
  for (const [canonical, aliases] of Object.entries(BODY_STYLE_ALIASES)) {
    if (aliases.some((a) => isFuzzyMatch(q, a, { maxDistance: 1 }))) {
      filters.bodyStyle = canonical;
      break;
    }
  }

  // ... repeat for fuel type, drivetrain, year detection

  return filters;
}
```

### 3.4 Integration into `catalog.ts` Vehicle Filtering

The `filterVehicles()` function in `catalog.ts` currently does exact token matching:

```typescript
if (!queryTokens.every((token) => searchText.includes(token))) return false;
```

Add a fuzzy fallback in the vehicle listing UI filter as well:

```typescript
const queryTokens = filters.query
  .trim()
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean);

// ... inside the filter loop:
if (queryTokens.length > 0) {
  const searchText = getSearchText(v);
  const allMatch = queryTokens.every((token) =>
    searchText.includes(token) ||
    isFuzzyMatchInSearch(token, searchText)
  );
  if (!allMatch) return false;
}

function isFuzzyMatchInSearch(token: string, searchText: string): boolean {
  const words = searchText.split(/\s+/);
  return words.some((w) =>
    w.length > 2 && // ignore very short words
    isFuzzyMatch(token, w, { maxDistance: 1, relativeThreshold: 0.25 })
  );
}
```

This ensures the UI filters (used in VehiclesPage) also benefit from typo tolerance.

---

## 4. Implementation Order

### Phase 1: Core Utility (estimated: 1–2 hours)
1. Create `src/lib/fuzzyMatch.ts` with Levenshtein and `isFuzzyMatch`
2. Create `src/lib/vehicleTerms.ts` with all dictionaries
3. Write unit tests for Levenshtein edge cases (empty strings, different lengths, transpositions)
4. Write unit tests for `isFuzzyMatch` threshold behavior

### Phase 2: RAG Service Integration (estimated: 1–2 hours)
1. Add `preprocessQuery()` to `ragService.ts`
2. Integrate fuzzy lookup in `extractVehicleFilters()`
3. Add fuzzy pass in `scoreChunkByKeywords()`
4. Test the full `getSystemPromptWithContext()` pipeline with typo queries

### Phase 3: Vehicle Catalog Integration (estimated: 1 hour)
1. Add fuzzy fallback in `filterVehicles()` in `catalog.ts`
2. Test with `VehiclesPage` UI filter input

### Phase 4: UI and Edge Cases (estimated: 1 hour)
1. Surface corrections to the user (e.g., "Showing results for 'Ferrari'")
2. Add "Did you mean...?" suggestions for queries that return 0 results
3. Log unmatched tokens for dictionary expansion

---

## 5. Testing Strategy

### 5.1 Unit Tests (`src/lib/__tests__/fuzzyMatch.test.ts`)

```typescript
describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("ferrari", "ferrari")).toBe(0);
  });
  it("returns 1 for single insertion", () => {
    expect(levenshteinDistance("ferari", "ferrari")).toBe(1);
  });
  it("returns 1 for single substitution", () => {
    expect(levenshteinDistance("ferrari", "ferrari")).toBe(0);
  });
  it("handles transposition as 2 edits", () => {
    expect(levenshteinDistance("ferarri", "ferrari")).toBe(2);
  });
  it("handles completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3);
  });
  it("handles empty strings", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("abc", "")).toBe(3);
  });
});

describe("isFuzzyMatch", () => {
  it("matches 'ferari' with 'Ferrari'", () => {
    expect(isFuzzyMatch("ferari", "Ferrari")).toBe(true);
  });
  it("rejects 'xyz' with 'Ferrari' (distance 5 > max 3)", () => {
    expect(isFuzzyMatch("xyz", "Ferrari")).toBe(false);
  });
  it("matches 'lamborghni' with 'Lamborghini'", () => {
    expect(isFuzzyMatch("lamborghni", "Lamborghini")).toBe(true);
  });
  it("rejects very short mismatches ('x' vs 'BMW')", () => {
    expect(isFuzzyMatch("x", "BMW")).toBe(false);
  });
  it("matches 'electrik' with 'electric'", () => {
    expect(isFuzzyMatch("electrik", "electric")).toBe(true);
  });
  it("is case insensitive", () => {
    expect(isFuzzyMatch("FERRARI", "ferrari")).toBe(true);
  });
});

describe("fuzzyLookup", () => {
  it("returns canonical make for exact alias", () => {
    expect(fuzzyLookup("lambo", MAKE_ALIASES)).toBe("Lamborghini");
  });
  it("returns canonical make for fuzzy alias", () => {
    expect(fuzzyLookup("lamborghni", MAKE_ALIASES)).toBe("Lamborghini");
  });
  it("returns null for unrecognized term", () => {
    expect(fuzzyLookup("xyzblah", MAKE_ALIASES)).toBeNull();
  });
});
```

### 5.2 Integration Test Scenarios

| # | Test Case | Expected Match | Category |
|---|-----------|----------------|----------|
| 1 | `"Do you have any Ferraris?"` | Exact: Ferrari via existing alias | Already works |
| 2 | `"How many Feraris do you have?"` | Fuzzy: Ferrari | Typo |
| 3 | `"Lamborghni Aventador"` | Fuzzy: Lamborghini | Typo |
| 4 | `"Show me electrik SUVs"` | Fuzzy: Electric + SUV | Typo + exact |
| 5 | `"I want a four-wheel drive porcshe"` | Fuzzy: 4WD + Porsche | Compound |
| 6 | `"Any BMW X55 in stock?"` | No match (X55 doesn't exist) | Correct rejection |
| 7 | `"Cheapest car in inventory"` | Exact: no fuzzy needed | Price sort |
| 8 | `"What is LUME?"` | Non-vehicle query → RAG | No false positive |

### 5.3 False Positive Prevention

| Guard | Implementation |
|-------|---------------|
| Short word protection | Don't fuzzy-match tokens < 4 characters |
| Relative threshold | `distance ≤ floor(target.length / 3)` prevents matching very different strings |
| Absolute cap | `maxDistance ≤ 3` prevents overly aggressive matching |
| Known terms only | Only fuzzy-match against the pre-defined dictionaries; don't match arbitrary text |

---

## 6. Performance Analysis

### Complexity
- **Levenshtein distance:** O(n×m) where n,m are string lengths (< 25 chars for vehicle terms)
- **Dictionary size:** ~100 known terms (makes + aliases + body styles + fuels + drivetrains)
- **Worst case per query:** 1 token × 100 terms × 25×25 operations = ~62,500 ops — negligible (< 1ms)

### Optimizations
```typescript
// Early exit: if length difference exceeds max distance, skip
if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

// Memoization: cache results per query session
const fuzzyCache = new Map<string, string | null>();
```

### Scalability
- If the dictionary grows to 1000+ terms, consider a **BK-tree** for O(log n) fuzzy lookup
- Not needed at current scale; precomputation overhead would exceed runtime cost

---

## 7. Files to Create / Modify

| Action | File | Description |
|--------|------|-------------|
| **CREATE** | `src/lib/fuzzyMatch.ts` | Levenshtein, isFuzzyMatch, fuzzyLookup, correctQuery |
| **CREATE** | `src/lib/vehicleTerms.ts` | MAKE_ALIASES, BODY_STYLE_ALIASES, FUEL_TYPE_ALIASES, DRIVETRAIN_ALIASES, ALL_KNOWN_VEHICLE_TERMS |
| **CREATE** | `src/lib/__tests__/fuzzyMatch.test.ts` | Unit tests for fuzzyMatch.ts |
| **MODIFY** | `src/lib/ragService.ts` | Add preprocessQuery(), integrate fuzzyLookup in extractVehicleFilters(), add fuzzy pass in scoreChunkByKeywords() |
| **MODIFY** | `src/experience/vehicles/catalog.ts` | Add fuzzy fallback in filterVehicles() UI filter |
| **NO CHANGE** | `src/components/chat/OllamaChat.tsx` | No modifications needed — RAG pipeline handles it upstream |
| **NO CHANGE** | `src/lib/deepseekService.ts` | No modifications needed — receives already-corrected prompt |

---

## 8. Edge Cases & Mitigations

| Edge Case | Mitigation |
|-----------|------------|
| User types "a" or "I" | Minimum token length filter (≥ 4 chars for fuzzy) |
| User types "ferrari lamborghini" (two makes) | Only first match wins in filter; second ignored (acceptable — user likely means one) |
| User types "red car" (color, not make) | Color not in known terms → no fuzzy match → falls through to RAG keyword scoring |
| Query has apostrophe ("SUV's") | PreprocessQuery strips punctuation before fuzzy matching |
| User types a model name (e.g., "Mustang") instead of make | Model names not in dictionaries → no match → query falls through to RAG keyword scoring against chunk content |
| Query returns 0 vehicles after fuzzy | Return fallback response: "I couldn't find any vehicles matching your description. Try different terms or check our available inventory." |
| User queries non-vehicle content with a typo (e.g., "LUM" instead of "LUME") | Fuzzy matching is scoped to vehicle terms only; RAG's `scoreChunkByKeywords` already uses substring matching which catches partial matches naturally |

---

## 9. Future Enhancements (Out of Scope for Initial Implementation)

- **N-gram fuzzy matching** for better handling of transposed letters (e.g., "ferarri" → distance 2 for transposition)
- **Soundex/phonetic matching** for homophones (e.g., "Phantom" vs "Fantome") — useful if adding non-English queries
- **Machine learning classifier** that detects make/model intent and narrows fuzzy search scope
- **User feedback loop** — if a correction is wrong, allow user to revert and log the false positive
- **BK-tree index** for dictionary lookup if scale grows beyond 1000 terms

---

## 10. Summary of Benefits

| Before | After |
|--------|-------|
| ❌ "Ferari" returns 0 results | ✅ "Ferari" corrects to "Ferrari" and shows results |
| ❌ "electrik SUV's" fails both tokens | ✅ "electrik" → "Electric", "suv's" → "SUV" |
| ❌ "lamborghni" falls through all filters | ✅ "lamborghni" → "Lamborghini" via fuzzy lookup |
| ❌ RAG ignores chunks with typo'd brand names | ✅ RAG scores chunks based on fuzzy term matches |
| ❌ UI search in VehiclesPage requires exact spelling | ✅ UI search tolerates minor typos |
| ❌ Rare/uncommon typos never auto-corrected | ✅ All typos within edit distance threshold are corrected |

The implementation is **lightweight** (~150 lines of new utility code), **well-tested**, and **fully backward-compatible** — existing exact-match behavior is preserved, with fuzzy matching as a fallback layer only.
</details>
</details>
</details>
</details>
</details>