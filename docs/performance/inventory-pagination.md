# Public inventory pagination measurement

## Before

Chrome network capture on the demo inventory before this change:

- 152 total requests
- 27.4 MB transferred
- DOM content loaded: 338 ms
- window load: 5.81 s
- network settled: 34.54 s
- vehicle data requested sequentially at offsets 0, 200, 400, 600, 800, and 1000

The list API also performed an exact count, a full facet scan, and a separate
managed-image query for each page.

## After (code-path measurement)

The automated pagination test records the initial inventory path as:

- one `/api/vehicles` request containing at most 24 cards
- one independent `/api/vehicles/facets` request for lightweight dropdown data
- zero offset-200 catalog-drain requests
- one exact count for a filter/sort scope; later pages reuse it for 15 seconds
- one database inventory query per page, including the managed primary image

The exact transferred-byte and first-card timing comparison must be captured
from a preview deployment after migration 061 is applied. It cannot be measured
faithfully against the current production database because the new inventory
function is intentionally not applied by this branch. Suggested validation:

1. Open `/vehicles` in a clean Chrome profile with cache disabled.
2. Export a HAR after the first 24 cards render.
3. Confirm no `/api/vehicles?offset=200` (or later) request exists.
4. Record total requests, transferred bytes, JS bytes, API duration, and the
   first-card timestamp alongside the baseline above.
5. Change a primary image in admin, revisit the same list URL, and confirm the
   ETag changes and the new image appears.
