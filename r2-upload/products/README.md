Put product images here before upload.

Preferred local filenames and R2 object keys:

- red-bull.webp -> products/red-bull.webp
- starbucks.webp -> products/starbucks.webp
- moet.webp -> products/moet.webp
- ysl-femme.webp -> products/ysl-femme.webp
- ysl-homme.webp -> products/ysl-homme.webp
- hermes.webp -> products/hermes.webp
- rolex.webp -> products/rolex.webp

Use WebP if possible. Recommended shape: 16:10 landscape, at least
1600 x 1000 px, with the product centered and enough margin for the card crop.

These files are staging assets for Cloudflare R2. The app loads them through
`mediaUrl()`, the same CDN helper used by Red Bull.

Current uploaded product image keys are still mixed because early assets were
uploaded at the R2 bucket root:

- `blackredbullcycles.png`
- `starbucksLUME.png`
- `YSLfemmeLUME.png`
- `YSLmenLUME.png`

Those current keys and the preferred future keys are tracked in
`src/experience/products/catalog.json`. After the normalized `products/*.webp`
keys are uploaded, update `imageKey` in that catalog.

Upload command from the repo root:

```sh
rclone copy r2-upload/products r2:lume/products --include "*.webp" --progress
```

Verify current required product assets:

```sh
npm run check:assets
```

Verify the full launch asset list:

```sh
npm run check:assets:strict
```
