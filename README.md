# LUME

A cinematic product-showcase website built with Vite, React, Three.js/R3F,
GSAP, Cloudflare R2 media hosting, and Supabase-backed auth/event tracking.

## Environment

Create a local `.env.local` with the new LUME project values:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ACCESS_PASSWORD=
VITE_R2_PUBLIC_BASE_URL=
VITE_SUPABASE_STORAGE_URL=
VITE_USE_BACKEND=false
VITE_ENABLE_LOCAL_CHAT=false
VITE_OLLAMA_HOST=http://127.0.0.1:11434
VITE_OLLAMA_CHAT_URL=/ollama/api/chat
VITE_OLLAMA_MODEL=llama3.1:8b
VITE_OLLAMA_EMBED_MODEL=nomic-embed-text
```

Media currently loads from Cloudflare R2 first with Supabase storage as the
fallback path. Replace the placeholder CDN URLs with the new LUME R2 bucket and
Supabase project before production launch.

`VITE_ACCESS_PASSWORD` is client-visible because this is a Vite app. Treat it
as a UX gate, not as a secret security boundary. Supabase auth and RLS remain
the real access controls for user data and admin views.

The local Ollama chat widget is disabled unless `VITE_ENABLE_LOCAL_CHAT=true`.
Only enable it when `VITE_OLLAMA_HOST` points to a reachable local or backend
Ollama endpoint.

## Scripts

```bash
npm run dev
npm run typecheck
npm run check:assets
npm run check:assets:strict
npm test
npm run embed
npm run build
npm run preview
```

This project uses npm as the source of truth. Use `npm install --legacy-peer-deps`
locally to match CI/Vercel dependency resolution.

`npm run check:assets` verifies currently required Cloudflare R2 media keys used
by the shell, uploaded product cards, and current Red Bull entry video. Optional
future product/showcase assets are reported as warnings. `npm run
check:assets:strict` treats the full launch media list as required and should
pass before a public launch.

`npm run embed` regenerates the local chatbot knowledge embeddings after edits
to `src/lib/knowledge/chunks.ts`.

## Product Catalog

Product metadata lives in `src/experience/products/catalog.json` and is exposed
through `src/experience/products/catalog.ts`. Product cards, product detail
pages, homepage showcase previews, the showcase page, and R2 asset checks all
read from that catalog.

Current uploaded image keys:

- `blackredbullcycles.png`
- `starbucksLUME.png`
- `YSLfemmeLUME.png`
- `YSLmenLUME.png`

The preferred future convention is `products/<product-id>.webp`; the catalog
stores those preferred keys so the app can migrate cleanly after the R2 uploads
exist.

## Planning Docs

- `codex max analysis.md` tracks the stabilization roadmap and implementation progress.
- `docs/deployment-checklist.md` lists production launch checks.
- `docs/new-showcase-template.md` defines the workflow for adding the next product showcase.
