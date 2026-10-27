# Isolated public web preview — Phase 2

This is a **preview-only** Next.js App Router workspace. Nothing routes live
Vite traffic here. Vehicle inventory/detail and their three public read API
transports are available. Lead submission, connected chat, published content
and cinema remain on their existing owners.
The disposable `poc/` remains reference work, not an application dependency.

Read [the approved plan](../../docs/scalability/nextjs-migration-plan.md) and
[Phase 1 evidence / setup](../../docs/scalability/phase-1-web-foundation.md), then
[Phase 2 behavior, evidence and rollout limits](../../docs/scalability/phase-2-vehicle-vertical-slice.md).

From repository root, with Node 24:

```sh
npm ci --legacy-peer-deps
npm run build:web
npm run typecheck:web
npm run test:foundation --workspace=@lume/web
npm run verify:foundation --workspace=@lume/web
npm run test:vehicles --workspace=@lume/web
npm run verify:vehicles --workspace=@lume/web
node apps/web/scripts/audit-env.mjs
npm run audit:functions --workspace=@lume/web
node apps/web/scripts/scan-output.mjs
```

`verify:foundation` starts its own production-build server on an ephemeral port
and a **local Supabase contract double**, with two synthetic active tenants. It
does not contact Supabase, create data, or use this machine's production keys.
It checks actual HTML and React Flight, concurrency, host/selector rejection,
verified-domain contracts, noindex/no-store, HTTP read-only behavior, and an
environment audit inside the real Next process. Generated evidence is ignored
under `artifacts/`. Staging has only one real active tenant (`demo`); hosted rejection tests and
these deterministic multi-tenant tests are recorded separately, without claiming
two real staging tenants.

To start against dedicated staging, configure the `WEB_PREVIEW_*` process
bindings listed in `.env.example` securely, then use `npm run dev:web` or
`npm run start --workspace=@lume/web`. Default local port is 3200, with the
read-only routes `/preview?tenant=demo`, `/vehicles?tenant=demo` and
`/vehicles/<legacy-uuid>?tenant=demo`. Metadata/canonical and
the client identity prop derive from the same request-memoized server result.

**Do not copy `.env.example` to `.env.local`.** Next's dotenv auto-loading could
reintroduce generic production bindings after sanitization, so the launcher
rejects local dotenv files. It forwards only explicitly allowed infrastructure
and web-preview variables. Generic `SUPABASE_*`, `VITE_*`, `NEXT_PUBLIC_*`, provider
keys, R2 credentials and Git tokens are never forwarded to Next. It refuses a
production deployment, the known production Supabase project, and legacy JWTs
whose project/role do not match the staging configuration. New publishable/secret
keys are opaque: their actual authorization must be checked against staging;
their project identity cannot be inferred from their prefix alone.

Vercel serverless functions do not execute `npm start`. They independently
validate their project-scoped runtime bindings and reject known generic app
secrets/production configuration. Do not rely on build-time stripping to clean
Vercel runtime variables: the separate project must contain only staging preview
bindings, and the hosted environment still needs inspection before its gate passes.

Use only these scripts: invoking `next build/start` directly fails the isolation
guard. Staging URL/ref/anon bindings are needed for a running preview, not for
the standalone compilation. The optional staging service-role binding is used
only for exact verified-domain metadata and exact vehicle gallery metadata
after anonymous vehicle visibility is established; ordinary
host/query tenant identity uses anon `tenant_by_slug`. No migration is needed.

Production runtime code lives in `app`, `server`, `components`, `config`
and `proxy.ts`. `build` and `typecheck` enforce import graph boundaries. Server
loaders cannot reach client components; client graphs cannot reach server/config
or server-only Next APIs. Server pages may compose explicit client entry leaves
using serializable props. `@lume/types` is shared via type-only imports; importing
the Vite tree, admin implementation, POC, or an unreviewed runtime package fails
the checker. Framework `server-only` markers provide a second compile-time guard
for the data/tenant adapters. `resolver-core.ts` is pure and testable without Next.

The Vercel config is for a **new separate preview project rooted at `apps/web`**.
Do not apply it to `lume` or `lume-admin`, assign customer domains, or remove the
existing SPA fallback. Production builds are skipped and independently refused
by the launcher. The separate `lume-web-preview` project is now deployed as a
read-only Preview; [hosted evidence](../../docs/scalability/phase-1-hosted-exit-gates.md)
records raw curl responses, staging-only bindings, single-tenant limitations and
the actual Phase 1 function manifest. PR #95 is merged into staging. The
[Phase 2 evidence](../../docs/scalability/phase-2-vehicle-vertical-slice.md) records
the current deployment and function manifest. Phase 3 has not started.
