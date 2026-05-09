# New Showcase Template

Use this checklist before turning a coming-soon product into a live LUME showcase.

## Product Catalog

- Add or update the product in `src/experience/products/catalog.json`.
- Set `status` to `live` only when the showcase route, media, and copy are ready.
- Add the current uploaded `imageKey`.
- Add the future normalized `preferredImageKey` under `products/<product-id>.webp`.
- Add `showcase.partIndex`, `showcase.chapterIndex`, `showcase.chapterId`, and CTA `label`.

## Story Definition

- Add or update the chapter in `src/experience/story/manifest.ts`.
- Add the showcase chapter config in `src/experience/scenes/showcase/data.ts`.
- Confirm the chapter title used on the homepage/showcase page.

## Scene Plan

- Define 6 or 12 scene beats.
- For each scene, provide:
  - scene id
  - scene title
  - primary visual
  - narrative lines
  - expected video segment
  - audio cue
  - analytics id if different from scene id

## Media Keys

Upload media to R2 and record the keys:

```text
products/<product-id>.webp
video/<product-id>-scene-1-normal.mp4
video/<product-id>-scene-1-high.mp4
audio/<product-id>-track-1.mp3
models/<product-id>-hero.glb
```

Run:

```sh
npm run check:assets:strict
```

## Verification

- `npm run typecheck`
- `npm test`
- `npm run build`
- Open the local app and verify:
  - product card
  - product detail page
  - showcase page card
  - title card
  - preloader
  - scene progression
  - final CTA
  - back button behavior
  - mobile layout
