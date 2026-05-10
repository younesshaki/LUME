# Vehicles Page Implementation Plan

## Direction

The vehicles page should become a general vehicle marketplace browsing experience, not a luxury-only inventory page. Because the current source data masks several commercial fields, the product should be presented clearly as a concept/demo until real pricing, seller, image, VIN, and listing data are available.

Primary goals:

- Position the page as a broad vehicle marketplace concept.
- Keep the visual tone aligned with LUME without implying every vehicle is exotic or invitation-only.
- Make browsing useful: search, sort, filters, location, pagination, saved/compare actions, and shareable filter state.
- Add a vehicle detail/action flow so cards are not dead ends.
- Reduce filter height, especially on mobile.

## Current State

Relevant files:

- `src/experience/ui/VehiclesPage.tsx`
- `src/experience/ui/VehiclesPage.css`
- `src/experience/vehicles/catalog.ts`
- `src/lib/ragService.ts`
- `src/lib/knowledge/chunks.ts`
- `src/lib/sound/actions.ts`
- `public/vehicles/vehicles-with-generated-images.csv`
- `public/vehicles/vehicle-type-*.webp`
- `src/App.tsx`

Current behavior:

- Loads 1,000 vehicle rows from CSV.
- Shows 24 vehicles per page.
- Supports filters for condition, make, model, year, body style, fuel type, drivetrain, mileage, and price.
- Uses generated prices because CSV prices are masked.
- Uses 7 repeated fallback images.
- Has pagination but no sort, search, URL state, detail page, inquiry flow, favorites, compare, or location filter.

Known data constraints:

- Real `price` is unavailable in the CSV.
- `vin` is masked.
- `sellerName` is masked.
- `listingUrl` is masked.
- Images are generic repeated placeholders.

Because of this, all price and image presentation must be treated as demo data.

## Product Requirements

### Marketplace Positioning

Update the page copy from luxury/exotic positioning to general marketplace positioning.

Recommended copy:

- Eyebrow: `Marketplace Concept`
- Title: `Vehicles`
- Subtitle: `Browse a demo marketplace of new and used vehicles with search, filters, and comparison tools.`

Add a small demo notice near the results controls:

`Concept demo: prices and imagery are representative until verified listing data is connected.`

This prevents the generated prices from looking like real sale prices.

### Inventory Cards

Cards should remain scannable and dense enough for marketplace browsing.

Each card should show:

- Image
- Condition badge: New / Used
- Year, make, model
- Trim, when available
- Price with demo treatment, for example `Est. $44,000`
- Mileage
- Fuel type
- Drivetrain
- Location
- Primary action: view details
- Secondary actions: save and compare

Do not make the entire grid feel like luxury editorial content. This is a browsing interface; clarity matters more than drama.

### Vehicle Detail Flow

Add a detail view so each vehicle has a destination.

Recommended implementation:

- Add `VehicleDetailPage.tsx`
- Add `VehicleDetailPage.css`
- Add a new `AppScreen` value: `vehicleDetail`
- Add `selectedVehicleId` state in `App.tsx`
- Pass `onSelectVehicle(vehicle.id)` into `VehiclesPage`
- Load the selected vehicle from the cached catalog by ID

Detail page content:

- Large image area
- Vehicle title
- Demo price label
- Key facts: year, condition, mileage, body style, drivetrain, fuel, exterior/interior color, city/state
- Demo data notice
- Inquiry CTA
- Save CTA
- Compare CTA
- Back to results

Because seller details and listing URLs are masked, the inquiry CTA should open an in-app demo inquiry panel/modal rather than pretending to contact a real seller.

Inquiry modal fields:

- Name
- Email
- Phone, optional
- Message
- Submit button

Submission can be local-only for now. Show a success state like:

`Inquiry saved for demo review.`

#### Back Navigation and Scroll State

When the user navigates from a detail page back to the vehicles list, restore the previous scroll position and pagination state. Without this, the user is dropped back at page 1 of results, which is disorienting in a 1,000-item catalog.

Implementation:

- Persist filters, sort, and page in URL state.
- Store the vehicles page scroll position in `sessionStorage` before navigating to the detail page.
- Key the scroll value by the current vehicles URL state so different result sets do not restore to the wrong position.
- Restore scroll after the vehicles list has loaded and rendered.
- If restoration fails, fall back to scrolling to the results bar.

Do not rely on URL state alone for scroll restoration. URL state restores the result set; `sessionStorage` restores the exact viewport position.

#### Document Title

Update `document.title` when navigating to a vehicle detail page:

`2024 Tesla Model S — LUME Marketplace`

Reset to the default title when navigating back to the list.

### Search

Add a text search input above the filters/results.

Search should match:

- Make
- Model
- Trim
- Year
- Body style
- Fuel type
- Drivetrain
- City
- State

Implementation:

- Add `query: string` to `VehicleFilters`.
- Normalize values to lowercase.
- Split query into tokens.
- Require all query tokens to match the combined searchable text.

Example searches:

- `tesla`
- `ford f-150`
- `2026 awd`
- `miami suv`

### Sort

Add sort controls near the result count.

Sort options:

- Recommended
- Price: Low to High
- Price: High to Low
- Newest Year
- Oldest Year
- Mileage: Low to High
- Mileage: High to Low

Implementation:

- Add `VehicleSort` type in `catalog.ts`.
- Add `sortVehicles(vehicles, sort)` helper.
- Apply filtering first, sorting second, pagination third.
- Use current dataset order for `Recommended`. Do not invent hidden ranking logic until real marketplace signals exist.
- Treat `null` mileage as `0` for new vehicles and as last for used vehicles where appropriate.

### Location Filter

Add location filtering that works with available CSV data.

Minimum version:

- State select
- City select dependent on state

Better version:

- Location text input matching city/state
- State select

Do not implement radius search until real coordinates are available.

Implementation:

- Add `sellerState` and `sellerCity` to `VehicleFilters`.
- Add helpers:
  - `getUniqueStates(vehicles)`
  - `getCitiesForState(vehicles, state)`
- Reset city when state changes.

### Compact Filters

The current filter panel is too tall, especially on mobile. Replace it with a two-level pattern.

Desktop layout:

- Top controls row:
  - Search
  - Sort
  - Make
  - Model
  - Filters button with active count
- Advanced filters collapse/drawer:
  - Condition
  - Year range
  - Price range
  - Mileage
  - Body style
  - Fuel type
  - Drivetrain
  - State
  - City
  - Clear filters

Mobile layout:

- Sticky top controls:
  - Search
  - Sort
  - Filter button with active count
- Full-screen or bottom-sheet filter panel
- Results should start much earlier on the page after initial load.

Acceptance target:

- At 390px mobile width, the first row of vehicle results should begin above `700px` from the top when filters are closed.
- At desktop width, the first row of vehicle results should be visible in the first viewport or close to it.

#### Accessibility

The filter drawer and compare modal introduce new focus-trap and keyboard patterns that do not exist elsewhere in the codebase.

Requirements:

- Filter drawer and modals must trap focus while open.
- `Escape` must close any open drawer or modal.
- All interactive controls must have accessible labels (ARIA or visible text).
- The compare modal must announce its open/close state to screen readers via `role="dialog"` and `aria-modal="true"`.
- Save and compare toggles must reflect their state visually and via `aria-pressed`.

### URL State

Persist marketplace state in the URL so filters can be shared and restored.

Recommended URL format:

`#vehicles?query=tesla&make=Tesla&state=CA&sort=price_asc&page=2`

Implementation options:

- If the app remains hash-driven internally, parse and write query-like state after `#vehicles`.
- If route handling is refactored later, move this to real URL search params.

State to persist:

- Query
- Sort
- Page
- Condition
- Make
- Model
- Year range
- Price range
- Mileage
- Body style
- Fuel type
- Drivetrain
- State
- City

Rules:

- Only write non-default values.
- Debounce search updates.
- Reset page to `1` when filters/search/sort change.
- Restore state on page load.
- URL state restores the result set, not exact scroll. Exact scroll restoration should use `sessionStorage`.

### Save And Compare

Add lightweight local demo behavior.

Save:

- Store saved vehicle IDs in `localStorage`.
- Show saved state on cards and detail page.
- Add a saved count in the controls row.

Compare:

- Allow selecting up to 3 vehicles.
- Store compare IDs in component state or `localStorage`.
- Show a compare bar when at least 1 vehicle is selected.
- Compare view should show columns with core specs:
  - Price estimate
  - Year
  - Make/model/trim
  - Mileage
  - Body style
  - Fuel
  - Drivetrain
  - Exterior/interior color
  - Location

Compare can be a modal rather than a separate route for the first implementation.

## Technical Plan

### Phase 1: Data And Catalog Helpers

Update `src/experience/vehicles/catalog.ts`.

Add fields:

- `query`
- `sellerState`
- `sellerCity`

Add types:

- `VehicleSort`

Add helpers:

- `searchVehicles`
- `sortVehicles`
- `getUniqueStates`
- `getCitiesForState`
- `getVehicleById`
- `formatVehiclePrice` — wraps price formatting so all display sites use a single function; replaces inline `.toLocaleString()` calls in cards and detail page

Adjust `filterVehicles` to include:

- Query matching
- State matching
- City matching
- Safer mileage handling
- Safer invalid range handling

Remove `isDemoVehicleData` from the plan. It was listed in an earlier draft but is not used in any subsequent phase. A boolean predicate adds no value if all vehicle data in this build is demo data by definition. Use the `DemoNotice` component instead.

Important:

- Keep generated prices, but label them as estimated/demo everywhere in UI.
- Avoid claiming seller/listing authenticity while fields are masked.

#### Error State for CSV Load Failure

`loadVehicles()` currently has no error handling path visible in the UI. Add an error state to `VehiclesPage`:

- If the CSV fails to load, show a clearly styled error message: `Unable to load vehicle inventory. Please refresh to try again.`
- Do not render the filter panel or grid in the error state.
- Log the error to the console for debugging.

This prevents a blank, broken page if the CSV request fails.

### Phase 2: Vehicles Page UX

Update `src/experience/ui/VehiclesPage.tsx`.

Refactor controls into smaller components:

- `MarketplaceToolbar`
- `AdvancedFilters`
- `VehicleCard`
- `CompareBar`
- `CompareModal`
- `DemoNotice`

Add state:

- `sort`
- `filtersOpen`
- `savedVehicleIds`
- `compareVehicleIds`

Update card actions:

- `View details`
- Save toggle
- Compare toggle

Update empty state:

- Show active filter count.
- Offer clear filters.
- Keep search term visible.

#### Sound Actions for New Interactions

Wire new interactions to existing sound primitives. Do not create new sound assets for this phase. Reuse or add lightweight aliases in the existing action registry after checking what `src/lib/sound/actions.ts` already exposes.

Suggested aliases in `src/lib/sound/actions.ts`, adjusted to match the current registry:

```
"vehicle.save.toggle":     "approval-bell"
"vehicle.compare.toggle":  "product-filter-blip"
"vehicle.filter.open":     "click-soft"
"vehicle.filter.close":    "click-soft"
"vehicle.inquiry.open":    "click-sharp"
"vehicle.inquiry.submit":  "submit-confirm"
"vehicle.search.clear":    "click-soft"
```

Fire `vehicle.save.toggle` from the save button on both the card and the detail page. Fire `vehicle.inquiry.submit` on inquiry form submission (before showing the success state).

If a suggested primitive does not exist, map the action to the closest existing click/submit/filter sound. Sound should not block the vehicles implementation.

### Phase 3: Detail Page

Add:

- `src/experience/ui/VehicleDetailPage.tsx`
- `src/experience/ui/VehicleDetailPage.css`

Update `src/App.tsx`:

- Add `vehicleDetail` screen.
- Add lazy import.
- Add selected vehicle ID state.
- Wire card selection to detail page.
- Wire back behavior from vehicle detail to vehicles.
- Update `document.title` on detail page mount and reset it on unmount.

Detail page should not depend on network calls beyond the already loaded CSV.

### Phase 4: URL State

Add a small URL state utility, either inside `VehiclesPage.tsx` or in:

- `src/experience/vehicles/urlState.ts`

Functions:

- `readVehicleUrlState()`
- `writeVehicleUrlState(state)`
- `encodeVehicleFilters(filters, sort, page)`
- `decodeVehicleFilters(params)`

Keep this isolated so the app can move to proper routing later.

URL state serves as the result-set restoration mechanism: the vehicles page restores filters, sort, and page from URL on remount. Exact scroll restoration is handled separately through `sessionStorage`, keyed by the vehicles URL state.
Í
### Phase 5: RAG Chatbot Sync

Update `src/lib/ragService.ts` to handle the new filter fields added in Phase 1.

Required changes:

- `extractVehicleFilters` must detect location intent and extract `sellerState` and `sellerCity` from queries like "do you have any Teslas in California?" or "used trucks in Miami."
- `matchVehicles` must apply `sellerState` and `sellerCity` filters when present.
- `formatVehiclesBlock` must include city and state in the formatted vehicle rows so the LLM can confirm location in its answer.

Without this update, the chatbot and the UI will disagree on location-filtered results after Phase 1 ships, which creates a confusing user experience.

Also update `src/lib/knowledge/chunks.ts`:

- The `vehicles-overview` chunk currently describes the inventory in general terms.
- After the detail page, compare, and inquiry flows are live (Phase 3), update the chunk to describe those capabilities so the chatbot can accurately answer "can I compare vehicles?" or "how do I contact a seller?"

### Phase 6: Styling And Responsive Layout

Update `src/experience/ui/VehiclesPage.css`.

Focus areas:

- Replace large always-open filter panel with compact toolbar and advanced filter panel.
- Add mobile filter drawer/bottom sheet.
- Add card action row.
- Add demo notice styling.
- Add compare bar/modal styling.
- Preserve LUME visual language, but reduce over-editorial spacing.

Responsive targets:

- Desktop: 3-column grid.
- Tablet: 2-column grid.
- Mobile: 1-column grid.
- Mobile filter panel closed by default.
- No horizontal overflow at 390px, 768px, 1024px, or 1440px.

### Phase 7: Tests

Add or update tests for catalog behavior.

Recommended file:

- `src/experience/vehicles/catalog.test.ts`

Test cases:

- Query matches make/model/trim/location.
- Make and model filters work together.
- State and city filters work.
- Invalid year/price ranges do not crash.
- Sort by price ascending/descending.
- Sort by year newest/oldest.
- Sort by mileage.
- Active filter count includes query/location.
- `getVehicleById` returns the correct vehicle.
- `loadVehicles` error path renders the error state (integration test or mock).

UI tests can be added later, but catalog tests should be included with this implementation because filtering and sorting are core marketplace behavior.

## Acceptance Criteria

The implementation is complete when:

- Page copy positions the experience as a general marketplace concept/demo.
- Prices are visibly labeled as estimates/demo values.
- Users can search by text.
- Users can sort results.
- Users can filter by state and city.
- Filters are compact by default, especially on mobile.
- Vehicle cards have actions.
- A vehicle detail page exists.
- Navigating back from the detail page restores the previous page, filters, and scroll position.
- `document.title` updates on the detail page and resets on back navigation.
- Users can open a demo inquiry flow.
- Users can save vehicles locally.
- Users can compare up to 3 vehicles.
- Filter/search/sort/page state can be restored from the URL.
- The filter drawer and compare modal trap focus and close on `Escape`.
- New vehicle interactions (save, compare, inquiry, filter drawer) have sound actions wired.
- The chatbot correctly handles location-filtered vehicle queries.
- The `vehicles-overview` knowledge chunk reflects the current feature set after Phase 3.
- CSV load failure shows a visible error state rather than a blank page.
- Catalog tests cover search, filters, sorting, location, and active counts.
- `npm run typecheck` passes.
- Relevant tests pass.

## Suggested Implementation Order

1. Update catalog types/helpers and tests (Phase 1).
2. Add search, sort, and location filters to the existing vehicles page (Phase 2 partial).
3. Refactor filters into compact toolbar plus advanced panel (Phase 2 continued).
4. Add saved and compare state/actions, wire sound actions (Phase 2 continued).
5. Add vehicle detail page and inquiry modal; update document title and back navigation (Phase 3).
6. Add URL state persistence (Phase 4).
7. Update RAG chatbot for location filters; update knowledge chunk (Phase 5).
8. Polish responsive CSS and run browser checks (Phase 6).
9. Finalize and run catalog tests (Phase 7).

## Risks And Tradeoffs

- Generated prices are useful for layout but risky for user trust. The demo label is mandatory until real prices are available.
- Generic repeated images make the marketplace feel less real. This is acceptable for a concept/demo, but should be replaced before any production positioning.
- URL state inside a hash-based app can get messy. Keep parsing isolated so it can be replaced later.
- Compare and inquiry should stay local/demo-only until backend requirements are clear.
- The RAG chatbot and the UI filter layer are separate code paths. Any new filter field added to `catalog.ts` must also be handled in `ragService.ts` or the two surfaces will diverge.
- The filter drawer and compare modal introduce the first focus-trap patterns in the codebase. If accessibility is deferred, it will be harder to retrofit later — treat it as part of Phase 2, not a polish step.
