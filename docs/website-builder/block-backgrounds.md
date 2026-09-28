# Block backgrounds

Any page-builder block can carry a background colour and/or image, set in the
page editor under **Properties → Background**.

## Model

`PageBlock.appearance` (`packages/types/src/page.ts`) sits beside `props`, so no
block schema owns it. It is validated by `blockAppearanceSchema`
(`packages/blocks/src/appearance.ts`) inside `validateBlock`, on write (editor)
and on render (invalid blocks are skipped, as before):

- `backgroundColor`: `{ token: "page" | "panel" | "accent" | "ink" }` (follows the
  site's light/dark mode) or `{ custom: { light, dark } }` (six-digit hex each).
- `backgroundImage`: `{ url (https or root-relative), position, size,
  overlayColor, overlayOpacity 0–80 }`, picked from the tenant media library.
- `fullWidth`: paint across the window, not just the block's column.

No migration: it is part of the revision's JSON. The editor copilot's
`update_block` spreads the existing block, so it keeps a block's appearance.

## Rendering

`BlockAppearanceFrame` wraps every block in `PageBlocksView` (live site and
editor preview). A block without an appearance renders with no extra element.
`resolveBlockAppearance` (`src/lib/pageBuilder/blockAppearance.ts`) picks the
text tone: when a background is dark in light mode (or the reverse), the block
runs with the other mode's full palette — text, cards and panels switch
together — using the tenant's own variables for that mode. Image overlays set
the tone. Full width uses a box-shadow (colour) and a stretched photo layer
clipped by `.pageBuilderMain`, so the page never scrolls sideways.

The editor warns below 4.5:1 text contrast for custom colours and below 30%
overlay for photos. Hero photo designs (split/search/full-bleed) already fill
their section, so the image option is hidden for them.

Tests: `packages/blocks/src/appearance.test.ts`,
`src/lib/pageBuilder/blockAppearance.test.ts`,
`e2e/layout/block-backgrounds.spec.ts` (both templates, both modes).
