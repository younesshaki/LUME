# Backend Architecture: Securing Deepseek/RAG (Next.js Considered)

## Overview

This document covers the path to a proper backend for LUME. The original framing was "introduce Next.js" — after review, that's premature. The real goal is **securing Deepseek and moving RAG server-side**, and the repo already has a backend foothold for that.

**Status**: Planning Phase
**Recommended Path**: Extend existing Vercel Functions, defer Next.js decision
**Estimated Effort**: 6-10 hours (down from 11-17h in the previous revision)

## Current Backend State (Not a Greenfield)

The repo already has:

- **`api/deepseek-proxy.ts`** — a working Vercel Function that proxies Deepseek with streaming support. Production uses `/api/deepseek-proxy`; dev uses Vite proxy to `https://api.deepseek.com/v1/chat/completions` directly.
- **`vercel.json`** — Vercel deployment is configured.
- **`package-lock.json`** — npm, not pnpm.
- **Vite frontend** with extensive Three.js / client-side state. Not a candidate for casual migration.

Any backend plan must start here, not from scratch.

## Real Problems to Solve (Restated)

1. `VITE_DEEPSEEK_API_KEY` ships to browser. → **Partially solved**: `deepseek-proxy.ts` already keeps the key server-side in production. But `deepseekService.ts` still reads `import.meta.env.VITE_DEEPSEEK_API_KEY` to add `Authorization` headers client-side, which is wrong if the proxy is meant to attach auth.
2. `src/lib/knowledge/embeddings.json` and the entire RAG flow run in the browser. → **Unsolved**. System prompts, vehicle filtering, and knowledge base are all client-side.
3. Vehicle catalog is fully fetched client-side. → **Unsolved**. Doesn't scale.

## Recommended Path: Extend Vercel Functions First

Instead of jumping to Next.js, expand what's already working.

### Phase 1: Fix the Proxy Properly (1-2 hours)

The current proxy passes through the request body unchanged. The client still constructs the system prompt with RAG context and sends it. That's the leak.

**Audit & fix**:
- `deepseekService.ts` currently sends `Authorization: Bearer ${apiKey}` from the client. In production, the proxy already adds auth — remove the client-side Authorization header. Confirm proxy receives the bearer token from the env, not the body.
- Rename `VITE_DEEPSEEK_API_KEY` → `DEEPSEEK_API_KEY` on the Vercel side. The fallback in `deepseek-proxy.ts:11` already handles both.
- In dev, the Vite proxy points directly at Deepseek (`/deepseek-api/v1/chat/completions`) — this bypasses our proxy in dev mode and exposes the key. Either route dev through the Vercel Function locally (via `vercel dev`), or accept this as a dev-only behavior and document it.

### Phase 2: Move RAG Server-Side (3-5 hours)

This is the main work and the original goal.

**Create `api/chat.ts`** that replaces direct Deepseek calls:

```typescript
// api/chat.ts (Vercel Function — same shape as deepseek-proxy.ts)
import { VercelRequest, VercelResponse } from '@vercel/node';
import { getSystemPromptWithContext } from './lib/ragService';
import { loadVehiclesServer } from './lib/vehicles-server';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Validate { messages: [...] } from body
  // 2. Extract latest user message
  // 3. Load vehicles (server-side, cached)
  // 4. Build system prompt with RAG context — never returned to client
  // 5. Stream Deepseek response back as SSE
}
```

**Module relocation** (the unglamorous but necessary work):

| Module | Current location | New location | Refactor needed |
|--------|------------------|--------------|-----------------|
| `fuzzyMatch.ts` | `src/lib/` | `api/lib/` | None (pure functions) |
| `vehicleTerms.ts` | `src/lib/` | `api/lib/` | None |
| `ragService.ts` | `src/lib/` | `api/lib/` | Remove `import.meta.env`, replace `@/` aliases, swap browser fetch for server fetch |
| `embeddings.json` | `src/lib/knowledge/` | `api/lib/knowledge/` | Verify Vercel bundles JSON imports (usually fine) |
| Vehicle loading | `src/experience/vehicles/catalog.ts` | Split: keep types in `src/`, add `api/lib/vehicles-server.ts` for server-side load | New server module that fetches R2 CSV with Node `fetch` |

**Critical**: The system prompt and RAG context never leave the server. Only the model's streamed response and source categories come back.

### Phase 3: Filtered Vehicles Endpoint (1-2 hours)

```
GET /api/vehicles?make=BMW&bodyStyle=SUV&priceMax=100000&limit=50

Response: { vehicles: Vehicle[], totalCount: number, hasMore: boolean }
```

Server filters the catalog and returns only what matches. Client doesn't get the full 111-vehicle list when it asks for 5 BMWs.

This is the second-most-impactful change after `/api/chat`.

### Phase 4: Frontend Updates (1-2 hours)

- `OllamaChat.tsx` calls `POST /api/chat` and parses SSE stream
- Remove imports of `ragService`, `getSystemPromptWithContext`, `streamDeepseekChat` from React components
- Vehicle browsing page can keep loading the catalog client-side for now (Phase 5 candidate)
- Vite proxy: add `/api/*` → Vercel dev server in development

### Phase 5 (Later, Optional): Reconsider Next.js

After Phases 1-4 ship, the question becomes: do we actually need Next.js?

Reasons to migrate:
- We want SSR/SSG for SEO on marketing pages
- We want App Router + Server Components for content
- We want one framework for everything (cleaner DX)

Reasons to stay on Vite + Vercel Functions:
- The Three.js experience is heavily client-side; SSR adds little
- Vercel Functions already handle the backend cleanly
- A Vite → Next.js migration touches a lot of surface area for unclear benefit

**Recommendation**: don't decide now. Phases 1-4 solve the actual problems. Defer Next.js until there's a concrete frontend reason to migrate.

## Revised Time Estimate

| Phase | Time | Notes |
|-------|------|-------|
| Phase 1: Fix proxy + env vars | 1-2 hours | Stop client-side auth, rename env var |
| Phase 2: Move RAG server-side | 3-5 hours | The main work |
| Phase 3: Filtered vehicles endpoint | 1-2 hours | Query params + server filtering |
| Phase 4: Frontend updates | 1-2 hours | SSE parsing, remove client imports |
| **Total** | **6-11 hours** | ~1 day of focused work |

Faster than the Next.js monorepo path because we skip the framework setup, monorepo restructure, and `apps/` directory move.

## Why Not Next.js (For Now)

The previous revision of this doc recommended a monorepo with `apps/api/` (Next.js) and `apps/web/` (Vite). After review, that's too much for the actual problem:

- **Monorepo restructure** touches Vercel config, TS paths, `vercel.json`, asset references, dev scripts. Real days of work for no functional gain over Vercel Functions.
- **Next.js for backend only** is heavier than needed. Hono or expanding Vercel Functions does the same thing with less ceremony.
- **The Vite frontend doesn't need migration**. The Three.js / animation-heavy experience runs better as a client app. Next.js shines on content/SEO pages that don't dominate this codebase.

Next.js becomes worth doing if/when we add a marketing site, blog, dashboard, or anything SEO-sensitive. Not now.

## Env Variable Cleanup (Independent Task)

Regardless of which path is chosen:

```bash
# Backend (Vercel Project Settings):
DEEPSEEK_API_KEY=sk-...        # rename from VITE_DEEPSEEK_API_KEY
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions

# Frontend (.env.local):
# Remove VITE_DEEPSEEK_API_KEY entirely — it should not be in the browser bundle
```

Update `api/deepseek-proxy.ts:11` to drop the `VITE_DEEPSEEK_API_KEY` fallback once Vercel env is renamed.

## Open Questions

1. **Dev workflow for the proxy**: Do we want `vercel dev` to run the functions locally, or keep the current Vite-direct-proxy approach in dev?
2. **CSV loading on the server**: Cache in-memory per cold start, or move to a quick KV/database read?
3. **SSE vs chunked JSON**: SSE is simpler for the browser; the current proxy passes through Deepseek's SSE format. Decide whether `/api/chat` rewraps it.
4. **When does Next.js become worth it?** — Concrete trigger: when we add a non-experience page (blog, dashboard, public marketing) that benefits from SSR.

## Related Documents

- [Vite Backend-Only Migration Plan](../../docs/vite-backend-only-migration-plan.md)
- [NextJS Backend Migration Plan](../../docs/nextjs-backend-migration-plan.md)
- [Session Handoff R2 Migration](../../docs/session-handoff-r2-migration.md)

---

**Last Updated**: 2026-05-12
**Revision**: 3 (incorporated review noting existing `api/deepseek-proxy.ts`, npm not pnpm, and that monorepo/Next.js is too heavy for the stated problem)
