# Vehicles — Specials Category & New Images Plan

**Status:** Planned  
**Last updated:** 2026-05-11  
**Depends on:** existing `catalog.ts`, `VehiclesPage.tsx`, R2 `vehicle images/` folder

---

## Context

The R2 `vehicle images/` folder currently holds 9 images:

| File | Type | Status |
|---|---|---|
| `vehicle-type-1.webp` → `vehicle-type-7.webp` | Fallback images (7 total) | Already wired into `catalog.ts` |
| `ChatGPT Image May 11, 2026, 01_17_03 AM.png` | New special image A | Needs rename + integration |
| `ChatGPT Image May 11, 2026, 01_24_36 AM.png` | New special image B | Needs rename + integration |

The two new images are 2 MB PNGs with raw ChatGPT filenames. Both need to be renamed to clean keys before integration.

---

## Part 1 — R2 Image Cleanup

### 1a. Rename the two new images

The current filenames contain spaces, timestamps, and are not URL-friendly. Rename via R2 copy+delete to:

```
vehicle images/vehicle-special-1.webp
vehicle images/vehicle-special-2.webp
```

Note: R2 has no native rename. The operation is: copy object to new key → delete old key. The existing `scripts/r2-set-cache.ts` pattern (using `@aws-sdk/client-s3` with `CopyObjectCommand`) can be extended for this.

### 1b. Set Cache-Control on the two new images

Same as the existing 7 — run the `r2-set-cache.ts` script against each new key to apply `Cache-Control: public, max-age=86400`.

### 1c. Final R2 state after cleanup

```
vehicle images/vehicle-type-1.webp       ← fallback rotation (7 images)
vehicle images/vehicle-type-2.webp
vehicle images/vehicle-type-3.webp
vehicle images/vehicle-type-4.webp
vehicle images/vehicle-type-5.webp
vehicle images/vehicle-type-6.webp
vehicle images/vehicle-type-7.webp
vehicle images/vehicle-special-1.webp   ← specials-only images (2 images)
vehicle images/vehicle-special-2.webp
```

---

## Part 2 — Specials Category Design

### What a "Special" vehicle is

A vehicle tagged as a Special:
- Is promoted to the top of the grid before any other sort is applied
- Retains its "Specials" position even when other sort options are active (price, year, mileage) — specials sort among themselves at the top, then the rest sort below
- If a filter excludes a special vehicle, it disappears from the grid entirely (filters always win over promotion)
- Displays a visible "Special" badge on its card alongside the existing New/Used badge
- Uses one of the two dedicated special images as its `imageSrc` (or its own real image if it has one from the CSV)

### Priority rule (precise)

```
Final grid order =
  [specials that pass filters, sorted by active sort]
  ++
  [non-specials that pass filters, sorted by active sort]
```

This means:
- Filter active, special passes → special stays at top
- Filter active, special excluded → special not shown at all
- Sort changes → specials re-sort among themselves, non-specials re-sort among themselves
- "Recommended" sort → specials first in insertion order, then non-specials in original CSV order

---

## Part 3 — Data Model

### 3a. Add `isSpecial` and `specialImageSrc` to the `Vehicle` type

**File:** `src/experience/vehicles/catalog.ts`

```ts
export type Vehicle = {
  // ...existing fields...
  isSpecial: boolean;
  specialImageSrc?: string; // overrides imageSrc when set, used for special display
};
```

`specialImageSrc` is optional — a special vehicle can use its existing `imageSrc` from the CSV if it has a real photo. The special images are used as a dedicated visual for vehicles that are promoted but only have fallback images.

### 3b. Specials registry (current implementation — no backend yet)

Since there is no backend yet, the list of special vehicle IDs is stored as a static registry in `catalog.ts`. This is designed so that when the backend admin UI is built, the only change needed is replacing this static list with a Supabase query.

**File:** `src/experience/vehicles/catalog.ts`

```ts
// Temporary static registry — replace with Supabase query when backend is ready.
// Key: vehicle _primaryKey from CSV. Value: which special image to use (1 or 2).
export const SPECIALS_REGISTRY: Record<string, { specialImage: 1 | 2 }> = {
  // Example — populate with real _primaryKey values from the CSV:
  // "VIN_ABC123": { specialImage: 1 },
  // "VIN_DEF456": { specialImage: 2 },
};
```

### 3c. Special images constant

```ts
export const SPECIAL_IMAGES = [
  mediaUrl("vehicle%20images/vehicle-special-1.webp"),
  mediaUrl("vehicle%20images/vehicle-special-2.webp"),
];
```

### 3d. Apply specials during CSV parse

In `loadVehicles()`, after parsing each row, check if the vehicle's `_primaryKey` is in `SPECIALS_REGISTRY`. If yes, set `isSpecial: true` and `specialImageSrc` to the corresponding special image.

```ts
const specialEntry = SPECIALS_REGISTRY[row["_primaryKey"]];
vehicle.isSpecial = !!specialEntry;
vehicle.specialImageSrc = specialEntry
  ? SPECIAL_IMAGES[specialEntry.specialImage - 1]
  : undefined;
```

---

## Part 4 — Sort Logic Update

**File:** `src/experience/vehicles/catalog.ts` → `sortVehicles()`

Current logic applies a single sort to the entire array. New logic: partition first, sort each partition, then concatenate.

```ts
export function sortVehicles(vehicles: Vehicle[], sort: VehicleSort): Vehicle[] {
  const specials = vehicles.filter(v => v.isSpecial);
  const regular  = vehicles.filter(v => !v.isSpecial);

  const sortFn = (a: Vehicle, b: Vehicle): number => {
    if (sort === "recommended") return 0; // preserve insertion order
    if (sort === "price_asc")   return a.price - b.price;
    if (sort === "price_desc")  return b.price - a.price;
    if (sort === "year_desc")   return b.year - a.year;
    if (sort === "year_asc")    return a.year - b.year;
    if (sort === "mileage_asc") return getMileageSortValue(a, "asc") - getMileageSortValue(b, "asc");
    if (sort === "mileage_desc")return getMileageSortValue(b, "desc") - getMileageSortValue(a, "desc");
    return 0;
  };

  const sortedSpecials = sort === "recommended" ? specials : [...specials].sort(sortFn);
  const sortedRegular  = sort === "recommended" ? regular  : [...regular].sort(sortFn);

  return [...sortedSpecials, ...sortedRegular];
}
```

`filterVehicles()` requires no changes — it already filters without awareness of specials, which is the correct behavior (filters always win).

---

## Part 5 — UI Changes

### 5a. Special badge on vehicle cards

**File:** `src/experience/ui/VehiclesPage.tsx`

Add a "Special" badge alongside the existing New/Used badge on the card image overlay. The two badges stack or sit side by side.

```tsx
<span className={`vehiclesPage__badge vehiclesPage__badge--${vehicle.stockType.toLowerCase()}`}>
  {vehicle.stockType}
</span>
{vehicle.isSpecial && (
  <span className="vehiclesPage__badge vehiclesPage__badge--special">
    Special
  </span>
)}
```

### 5b. Special image display

In the card image render, use `specialImageSrc` when available:

```tsx
<img
  src={vehicle.specialImageSrc ?? vehicle.imageSrc}
  alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
/>
```

### 5c. Specials filter tab (optional — can be deferred)

A "Specials" quick-filter tab above the grid that filters to `isSpecial === true` only. This is a one-line filter addition and a tab button in the UI. Mark as optional since the grid already promotes specials to the top — the tab is a convenience for browsing only specials.

### 5d. Visual separator (optional)

A subtle divider or section label ("Featured Specials") between the specials group and the regular vehicles in the grid. Only visible when both groups have results. Deferred — the badge alone communicates the distinction clearly enough for now.

### 5e. Special badge CSS

**File:** `src/experience/ui/VehiclesPage.css`

```css
.vehiclesPage__badge--special {
  background: linear-gradient(135deg, #C9A84C, #E9C31B);
  color: #1a120a;
  font-weight: 600;
  letter-spacing: 0.05em;
  /* positions below the New/Used badge if both present */
}
```

---

## Part 6 — Backend Readiness (Future Admin UI)

The static `SPECIALS_REGISTRY` in `catalog.ts` is intentionally designed to be swapped out with zero refactoring.

When the backend is built, the migration is:

1. Add `is_special boolean default false` and `special_image_index int` columns to the `vehicles` Supabase table (or a separate `vehicle_specials` join table keyed by `_primaryKey`).
2. Replace the static `SPECIALS_REGISTRY` object with a Supabase query in `loadVehicles()`.
3. Admin UI exposes a searchable vehicle list with a toggle to mark any vehicle as Special and pick which special image (1 or 2) to assign.
4. Change reflects on the site on next page load — no deploy required.

The `Vehicle` type, `sortVehicles()`, and all UI rendering code remain unchanged. Only the data source for `isSpecial` changes.

---

## Part 7 — Implementation Checklist

### R2 tasks (manual — requires R2 credentials)
- [ ] Rename `ChatGPT Image May 11, 2026, 01_17_03 AM.png` → `vehicle-special-1.webp`
- [ ] Rename `ChatGPT Image May 11, 2026, 01_24_36 AM.png` → `vehicle-special-2.webp`
- [ ] Set `Cache-Control: public, max-age=86400` on both new keys

### Code tasks (agents / implementation)
- [ ] Add `isSpecial` and `specialImageSrc` fields to `Vehicle` type in `catalog.ts`
- [ ] Add `SPECIAL_IMAGES` constant pointing to the two R2 keys
- [ ] Add `SPECIALS_REGISTRY` static map (empty initially, to be populated with real vehicle IDs)
- [ ] Update CSV parser to apply specials data from registry
- [ ] Update `sortVehicles()` to partition specials to top
- [ ] Add special badge render to `VehiclesPage.tsx` vehicle card
- [ ] Update card image render to prefer `specialImageSrc`
- [ ] Add `.vehiclesPage__badge--special` CSS in `VehiclesPage.css`
- [ ] Populate `SPECIALS_REGISTRY` with at least 2–3 real vehicle `_primaryKey` values for testing
- [ ] Verify: specials appear at top of grid on load
- [ ] Verify: active filter that excludes a special removes it from grid entirely
- [ ] Verify: sort changes re-sort specials among themselves, not mixed with regular
- [ ] Commit + push → auto-deploy via GitHub → Vercel

---

## Open Questions

1. **Which vehicles should be in Specials initially?** Need to identify 2–5 `_primaryKey` values from the CSV to populate `SPECIALS_REGISTRY` for launch. Can be done by inspecting the CSV or by picking by make/model.
2. **Do special vehicles always use a special image, or only when they have no real CSV image?** Current plan: `specialImageSrc` overrides `imageSrc` only when explicitly set in the registry. Could alternatively only use special images as fallback for specials that have no real image.
3. **Should the two special images rotate across all special vehicles, or be assigned per-vehicle?** Current plan: assigned per-vehicle in the registry (each special gets image 1 or image 2). Could also be a simple alternating pattern.
