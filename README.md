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
```

Media currently loads from Cloudflare R2 first with Supabase storage as the
fallback path. Replace the placeholder CDN URLs with the new LUME R2 bucket and
Supabase project before production launch.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```
