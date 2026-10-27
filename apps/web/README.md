# Isolated public web preview — Phase 3

This is a **preview-only** Next.js App Router workspace. Nothing routes live
Vite traffic here. Vehicle inventory/detail and their three public read API
transports remain available. Home, contact, products, published services/custom
slugs now render published documents with the shared @lume/blocks views. Lead
and consent writes proxy to the existing staging contracts; the upstream must
allow the exact preview Origin. Connected chat, visitor navigation and cinema
remain on their existing owners.
The disposable `poc/` remains reference work, not an application dependency.

Read [the approved plan](../../docs/scalability/nextjs-migration-plan.md) and
[Phase 1 evidence / setup](../../docs/scalability/phase-1-web-foundation.md), then
[Phase 2 behavior, evidence and rollout limits](../../docs/scalability/phase-2-vehicle-vertical-slice.md), and
[Phase 3 implementation and evidence](../../docs/scalability/phase-3-published-content.md).

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
noindex Preview; [hosted evidence](../../docs/scalability/phase-1-hosted-exit-gates.md)
records raw curl responses, staging-only bindings, single-tenant limitations and
the actual Phase 1 function manifest. PR #95 is merged into staging. The
[Phase 2 evidence](../../docs/scalability/phase-2-vehicle-vertical-slice.md) records
the vehicle deployment and function manifest. The Phase 3 document records the
current published-content deployment, stable alias and staging-only form origin.

Phase 3 checks after `npm run build:web`:

```sh
npm run test:content --workspace=@lume/web
npm run verify:content --workspace=@lume/web
# Optional visual reproduction: serve original cff045f on 5174 and this Vite
# checkout on 5175 using ONLY staging public settings. See Phase 3 evidence doc.
CONTENT_BASELINE_ROOT=/path/to/cff045f-checkout NODE_USE_ENV_PROXY=1 node apps/web/scripts/verify-content-browser.mjs
```

The visual harness intercepts only public RPC/media reads for the Vite references.
It uses an actual public staging snapshot for home/contact/products and explicit
local published-document fixtures for services/our-story (neither exists in staging).
Template overrides are preview presentation only; they never access drafts or write
a tenant/template. `?template=luxury|glo3d&theme=light|dark` selects the presentation
on content routes; canonical URLs omit both. Navigation/visitor adapters stay Phase 4.

To reproduce the complete live Vite extraction comparison, keep the dedicated
staging `WEB_PREVIEW_*` bindings in the process and use an external work directory.
The scripts never deploy Vite or change its build configuration:

```sh
export LIVE_PARITY_WORK=/tmp/lume-phase3-evidence
export CONTENT_BASELINE_ROOT=/tmp/lume-phase3-before
git worktree add --detach "$CONTENT_BASELINE_ROOT" cff045f2479f4f8e6c741b3044af11356484ed6e
ln -s "$PWD/node_modules" "$CONTENT_BASELINE_ROOT/node_modules"
mkdir -p "$LIVE_PARITY_WORK"
cp docs/scalability/evidence/phase-3/fixtures/*.json "$LIVE_PARITY_WORK/"
NODE_USE_ENV_PROXY=1 node --import tsx apps/web/scripts/build-vite-parity.mjs
node apps/web/scripts/serve-vite-parity.mjs
# In another terminal with the same two directory variables:
NODE_USE_ENV_PROXY=1 node apps/web/scripts/verify-live-parity.mjs
CONTENT_EVIDENCE_DIR="$LIVE_PARITY_WORK/next-content" NODE_USE_ENV_PROXY=1 node apps/web/scripts/verify-content-browser.mjs
```

The live flag is false; the published-content harness separately enables Vite's
existing public CMS preview mode. Services/custom publication reads are local
fixtures; the committed snapshot identifies the real staging data.

Hosted read-only mobile verification uses JavaScript-disabled Chromium with no
media/API mocks:

```sh
WEB_PREVIEW_FORM_TEST_ORIGIN=https://lume-web-phase3-hakicsi89.vercel.app CONTENT_MOBILE_EVIDENCE_DIR="$LIVE_PARITY_WORK/mobile" NODE_USE_ENV_PROXY=1 node apps/web/scripts/verify-content-mobile.mjs
```

`verify-form-browser.mjs` performs actual staging consent writes only with
`WEB_PREVIEW_WRITE_CONSENT_EVIDENCE=1`; a real lead POST additionally requires
`WEB_PREVIEW_WRITE_LEAD_EVIDENCE=1`. Without that second flag its lead success is
explicitly a local contract fixture. It preserves upstream 201 creation and 200
recent-duplicate semantics. `FORM_TEMPLATE`, `FORM_THEME`, and
`CONTENT_FORM_EVIDENCE_DIR` select presentation and output. Never run it against
production. Committed evidence contains actual staging receipts for Glo3D/light
and Luxury/dark; no further writes are needed to review this PR.
