Put the six product images here before upload.

Expected local filenames and R2 object keys:

- starbucks.webp -> products/starbucks.webp
- moet.webp -> products/moet.webp
- ysl-femme.webp -> products/ysl-femme.webp
- ysl-homme.webp -> products/ysl-homme.webp
- hermes.webp -> products/hermes.webp
- rolex.webp -> products/rolex.webp

Use WebP if possible. Recommended shape: 16:10 landscape, at least
1600 x 1000 px, with the product centered and enough margin for the card crop.

These files are staging assets for Cloudflare R2. The app loads them through
`mediaUrl("products/<file>.webp")`, the same CDN helper used by Red Bull.

Upload command from the repo root:

```sh
rclone copy r2-upload/products r2:lume/products --include "*.webp" --progress
```
