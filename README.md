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
npm run embed
npm run build
npm run preview
```

`npm run check:assets` verifies the required Cloudflare R2 media keys used by
the current product cards and Red Bull showcase. Optional future product assets
are reported as warnings without failing the command.

`npm run embed` regenerates the local chatbot knowledge embeddings after edits
to `src/lib/knowledge/chunks.ts`.
