# CLAUDE.md

Repo guide for future Claude sessions. Keep this short and accurate; long
narratives belong in `docs/`.

## What this product is

LUME is becoming a **multi-tenant SaaS** where businesses pay to use it as
their own website + ops layer. The cinematic Vite app is the public site
that visitors see; the Next.js admin app is what the *paying customer*
logs into to operate their site. Read `docs/vision/product-vision.md`
before proposing any architectural change.

When making any decision, assume:
- Multiple tenants exist; data must be tenant-scoped at all layers.
- The admin dashboard will grow into a large second app.
- Customer-configurable content is a first-class requirement.
- The bot is a real actor in the UI, not a chat widget.

## Workspace layout

```
LUME/
├── apps/admin/             Next.js 16 (App Router) — admin dashboard + public APIs
├── packages/types/         Shared domain types
├── packages/db/            Typed Supabase clients + row↔domain mappers
├── packages/rag/           Server-side RAG (pgvector, prompt assembly, fuzzy match)
├── supabase/migrations/    SQL migrations (apply with the Supabase MCP or `supabase db push`)
├── scripts/                Node scripts: seed-default-tenant, generateEmbeddings, R2 utilities
└── src/, public/, vite.config.ts, ...   ← public Vite site, NOT YET MOVED to apps/web
```

`apps/web/` does not exist yet. The Vite app stays at the repo root for now;
moving it is task #10 in the foundation plan and is *not* trivial — see
`docs/scalability/monorepo-foundation.md` for the migration checklist.

## Commands

| Action | Command |
|---|---|
| Install everything | `npm install --legacy-peer-deps` |
| Run public site (Vite) | `npm run dev` (port 5173) |
| Run admin (Next.js) | `npm run dev:admin` (port 3000) |
| Run both for full local stack | both, in two terminals |
| Typecheck root + workspaces | `npm run typecheck:all` |
| Test (Vite app only today) | `npm test` |
| Build public site | `npm run build` |
| Build admin | `npm run build:admin` |
| Seed default tenant | `npm run seed:default-tenant` (needs env, see below) |
| Provision a tenant (blank, one command) | `npm run create:tenant -- --slug x --owner-email y` |
| Regenerate embeddings | `npm run embed` (Ollama) — legacy; prefer the seed script + DB |

The Vite dev server proxies `/api/*` to `http://127.0.0.1:3000` (the
admin Next.js server). Without admin running, chat will fail — that's
expected.

## Environment

Two `.env.local` files:

- **Repo root** — Vite reads `VITE_*` vars at build time. Required:
  `VITE_R2_PUBLIC_BASE_URL`, `VITE_OLLAMA_HOST`, and `VITE_LUME_TENANT`
  (slug of the tenant this build serves; defaults to `default`).
  `VITE_DEEPSEEK_API_KEY` was removed — never put it back; the key must
  not ship to the browser.
- **`apps/admin/.env.local`** — copy from `apps/admin/.env.example`.
  Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`,
  `ALLOWED_CHAT_ORIGINS`) live here.

Never echo, log, or commit any of these values.

## Supabase

- Project: **LUME** (`atsgdjwjtmqvtotbrowu`, eu-west-1).
- Schema lives in `supabase/migrations/*.sql`. Migration `011` set up the
  multi-tenant foundation: `tenants`, `tenant_members`, `vehicles`,
  `rag_documents`, `rag_chunks` (pgvector 768d + HNSW), all with RLS.
- Use the Supabase MCP (`mcp__claude_ai_Supabase__*`) to read/apply
  migrations, query, list advisors. Always:
  1. `list_tables` before schema changes.
  2. `get_advisors` after schema changes.
  3. Treat `apply_migration` as live-on-prod — there is no separate dev
     branch by default. For risky changes, create a Supabase branch first.

### RLS conventions

- Every tenant-scoped table has a `tenant_id uuid not null references public.tenants`.
- Members read via `tenant_ids_for_current_user()`; editor+ writes via
  `user_has_tenant_role()`. Both are SECURITY DEFINER with locked
  `search_path` — defensible only because they enforce tenant scope
  internally.
- Anon role gets read-only access to vehicles/rag chunks for `active`
  tenants (so the public site renders without a session).
- Server code that legitimately needs to bypass RLS uses
  `createServiceClient()` from `@lume/db/server`. Confine its use to
  trusted route handlers — never expose the service-role key to a
  client component.

## Adding a new API route

Default to `apps/admin/app/api/<name>/route.ts`. Pattern:

1. Resolve tenant via `getTenantFromRequest(req)` from `@/lib/tenant`.
2. Origin-check via `isAllowedOrigin(req)` from `@/lib/origin`.
3. Use `runtime = "nodejs"` and `dynamic = "force-dynamic"`.
4. Return CORS headers via `corsHeadersFor(req)`; handle `OPTIONS`.
5. Choose the Supabase client carefully: anon for tenant-readable data,
   service-role only when the operation requires bypassing RLS.

For chat-like streaming, mirror `app/api/chat/route.ts`: prepend a
one-shot `data: {"type":"meta",...}` SSE event with metadata, then
pass the upstream stream through.

## Adding a new admin page

Pattern: `apps/admin/app/admin/[tenant]/<feature>/page.tsx` (Server
Component by default). Use `createSupabaseServerClient()` from
`@/lib/supabase/server` — RLS does the tenant filtering, but **always**
also `.eq("tenant_id", tenant.id)` for defense in depth.

Client Components should use `createSupabaseBrowserClient()` from
`@/lib/supabase/client`.

## Embeddings

Today's embedder is Ollama (`nomic-embed-text`, 768 dim) via
`createOllamaEmbedder()` in `@lume/rag/server`. The `Embedder` type is
pluggable — swap to a hosted provider by writing a new factory and
passing it into `retrieveContext()`. If the dimension changes, the
`vector(768)` column in `rag_chunks` must change too (drop + recreate
the HNSW index after).

## Things that look fine but aren't

- **Don't import `@lume/db/server`, `@lume/rag/server`, or anything
  using `process.env` from a Client Component or Vite source.** Those
  modules read server-only env and will throw at runtime.
- **Don't add `"use client"` to a file that imports a Supabase
  service-role client.** Same reason.
- **The Vite app at the root will eventually move to `apps/web/`.** Don't
  add deep references to the root-relative paths (e.g. don't hardcode
  `../../src/lib/foo` in scripts) — use workspace packages (`@lume/*`)
  for anything that should survive the move.
- **`src/lib/knowledge/embeddings.json` is seed data.** After the
  default tenant is seeded into Supabase, the runtime path no longer
  reads this file. Don't add new code that does — write to `rag_chunks`
  instead.

## When in doubt

- Vision and architecture: `docs/vision/product-vision.md`,
  `docs/scalability/monorepo-foundation.md`,
  `docs/scalability/next-js-introduction.md`.
- Schema: `supabase/migrations/011_multi_tenant_foundation.sql`.
- Tenant resolution: `apps/admin/lib/tenant.ts`.
- Public APIs: `apps/admin/app/api/{chat,vehicles}/route.ts`.
- The Vite chat client (only thing the browser knows about chat):
  `src/lib/deepseekService.ts` + `src/components/chat/OllamaChat.tsx`.
