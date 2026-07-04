# Monorepo Foundation (Phase A delivered)

This branch (`nextjs-intro`) lays the groundwork for LUME's multi-tenant SaaS
shape. The Vite public site stays untouched at the repo root; everything new
lives alongside it under `apps/` and `packages/`.

## Layout

```
LUME/
├── apps/
│   └── admin/                  Next.js 16 (App Router) — admin dashboard + public APIs
│       ├── app/
│       │   ├── admin/          Auth-gated tenant dashboard
│       │   ├── login/          Email/password sign-in
│       │   └── api/
│       │       ├── chat/       POST: tenant-scoped streaming chat
│       │       └── vehicles/   GET:  tenant-scoped vehicle listing
│       ├── lib/
│       │   ├── supabase/       server/client/middleware factories
│       │   ├── tenant.ts       getTenantFromRequest (header > query > subdomain)
│       │   └── origin.ts       ALLOWED_CHAT_ORIGINS allowlist
│       └── middleware.ts       Refreshes Supabase session, gates /admin/*
├── packages/
│   ├── types/                  Shared domain types (Tenant, Vehicle, RagChunk, …)
│   ├── db/                     Typed Supabase clients + row↔domain mappers
│   └── rag/                    Server-side RAG (fuzzy match, prompt assembly,
│                               pgvector retrieval, Ollama embedder)
├── supabase/migrations/
│   └── 011_multi_tenant_foundation.sql   tenants, members, vehicles, RAG, RLS
├── scripts/
│   └── seed-default-tenant.ts  Seeds the existing data into a 'default' tenant
└── src/, public/, vite.config.ts, …  ← public Vite site, unchanged
```

## Decisions baked in

| Question | Decision | Where it lives |
|---|---|---|
| Auth provider | Supabase Auth (cohesion with DB; RLS friendly) | `apps/admin/lib/supabase/*` |
| Monorepo tool | npm workspaces (no Turborepo until the build graph needs it) | root `package.json` |
| Tenant routing | Path-based today, subdomain-ready. Header `X-Lume-Tenant`, `?tenant=`, then subdomain | `apps/admin/lib/tenant.ts` |
| Data isolation | Single schema, `tenant_id` column + RLS | migration 011 |
| RAG storage | Supabase `pgvector(768)` with HNSW + `match_rag_chunks_for_tenant()` RPC | migration 011, `packages/rag/src/server.ts` |
| Vehicle catalog | Supabase table, RLS-protected, public read for active tenants | migration 011 |
| Embedding model | `nomic-embed-text` via Ollama (pluggable Embedder) | `packages/rag/src/server.ts` |

## Setup steps (run once)

### 1. Install workspaces

```bash
npm install --legacy-peer-deps
```

(Same flag the existing `vercel.json` uses.) Workspace packages are linked into
`node_modules` automatically.

### 2. Apply the migration

```bash
# Using Supabase CLI:
supabase db push

# Or via the Supabase dashboard: SQL Editor → paste migrations/011_*.sql
```

This enables `pgvector`, creates all tenant-scoped tables, RLS policies, and
the RPCs the admin app calls.

### 3. Configure environment

Two `.env.local` files now:

**Repo root** (`.env.local`) — Vite app:

```bash
VITE_R2_PUBLIC_BASE_URL=...        # already set
VITE_OLLAMA_HOST=http://...         # already set
VITE_LUME_TENANT=default            # NEW — slug of the tenant this Vite build serves
# REMOVE: VITE_DEEPSEEK_API_KEY    # no longer used by the browser
```

**`apps/admin/.env.local`** — Next.js admin app (copy `.env.example`):

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
DEEPSEEK_API_KEY=...
OLLAMA_HOST=http://...
ALLOWED_CHAT_ORIGINS=http://localhost:5173,https://lume.com
```

### 4. Create the owner auth user

Sign up via Supabase Studio (Authentication → Users → Invite) using the email
you want as the admin owner.

### 5. Seed

```bash
SEED_OWNER_EMAIL=you@example.com R2_PUBLIC_BASE_URL=... \
  npm run seed:default-tenant
```

This creates the `default` tenant, makes the user its owner, imports the
vehicle CSV, and loads existing embeddings as RAG chunks.

## Running it

Two terminals:

```bash
# Terminal A — public site
npm run dev                      # Vite on :5173

# Terminal B — admin + APIs
npm run dev:admin                # Next.js on :3000
```

Vite proxies `/api/*` to `:3000` (see `vite.config.ts`). Open
`http://localhost:5173` for the public site, `http://localhost:3000/admin` for
the dashboard.

## Deploying

Two Vercel projects:

1. **Public site** — root directory `.`, output `dist/`. The existing
   `vercel.json` proxies `/api/*` to the admin host. Edit the destination
   to match your admin deployment URL before pushing.

2. **Admin** — root directory `apps/admin`, framework "Next.js", env vars
   from `.env.example`. The admin URL is what the public site rewrites to.

Once both are deployed, the public site calls `/api/chat` → Vercel rewrites
to admin → admin builds prompt + streams Deepseek back.

## Security model

- Browser never sees: Deepseek key, system prompt, RAG chunks, full
  vehicle list (unless filtered query returns them).
- `/api/chat` is public (no auth) but origin-restricted via
  `ALLOWED_CHAT_ORIGINS`. Add Vercel BotID before opening it to the world.
- `/admin/*` is gated by Supabase Auth in middleware. Layout double-checks
  membership.
- RLS enforces tenant isolation at the database level — even if a bug
  forgot to filter by `tenant_id`, anon/auth users still cannot read
  other tenants' rows. Service-role usage is confined to
  `apps/admin/app/api/chat/route.ts` (where it's needed to bypass RLS for
  the RAG RPC call).

## What's deliberately not in this branch

- Admin UIs for vehicle CRUD, RAG document management, page builder,
  analytics, billing, role management. The data model and APIs exist;
  the screens come in follow-up sessions.
- `apps/web/` (the Vite app moved into the monorepo). Vite stays at the
  root for now — moving it is a mechanical refactor best done in a
  dedicated session. See the checklist below.
- Tenant signup / onboarding flow. New tenants are created today via the
  seed script. Self-serve onboarding is its own project.
- Vercel BotID, rate limiting, runtime cache layer. Hooks are in place
  (origin check) — bolt these on before public beta.

## Deferred: moving Vite into apps/web

**Trigger condition (decided 2026-07-04):** this move stops being deferrable
the moment work starts on making a second tenant publicly reachable —
subdomain routing, per-tenant builds, or custom domains going live (see
`docs/onboarding-backlog.md` item 1). Do the move BEFORE that work, not
during it. Secondary trigger: any new root-level serverless function or
config that would deepen root-relative coupling — prefer doing the move
first. Until a trigger fires, keep new shared code in `packages/*` so the
move stays cheap.

When ready:

1. `mkdir apps/web && git mv {src,public,index.html,vite.config.ts,vitest.config.ts,tsconfig.json,tsconfig.node.json,components.json} apps/web/`
2. Move root `package.json` Vite scripts + Vite-only deps into
   `apps/web/package.json` with `"name": "@lume/web"`. Keep root scripts
   minimal (delegate via `npm run -w @lume/web ...`).
3. Move `scripts/{check-r2-assets,generateEmbeddings}.ts` into
   `apps/web/scripts/` or keep at root with adjusted paths.
4. Update `vercel.json` (or create `apps/web/vercel.json`):
   `"buildCommand": "cd ../.. && npm run build:web"`, output `apps/web/dist`.
5. Verify: `npm run dev`, `npm run build`, `npm test` all pass from root
   workspace commands.

Recommend doing this in a fresh session with no other work in flight, so
the entire context window is available for catching surprises.
