# Phase 1 — isolated web foundation

Scope: the first implementation phase of [the approved migration plan](nextjs-migration-plan.md), and nothing from Phase 2 onward. This document records implementation, evidence and remaining external prerequisites. It does **not** declare the hosted Phase 1 gate complete.

## Reference and starting state

At inspection, staging was `ee51ee197f12039405751b414e44e75d652bdb94`; [PR #94](https://github.com/younesshaki/LUME/pull/94) remained OPEN/draft and was not merged. The user approved its plan, so `nextjs-migration-plan.md` is carried byte-for-byte from `3ee4e276297a8f1466a7b417393e95417c668e15`. This task does not merge #94. Its disposable POC is not moved into web or included as a web dependency. Rebase against staging after the reference PR is merged if necessary.

The source still lives at root: `src`, `vite.config.ts`, root Vite build/`dist` and public API deployment. The current code/style/shader surface is 487 files / 58,843 lines; the older 423-file estimate is stale. There are 23 unique `VITE_*` names in source/config/declarations/tests, not 18. `apps/admin` remains the existing separate Next app/backend.

## Implementation

- New npm workspace `@lume/web`, Next 16.2.6, React/React DOM 19.2.6 (matching admin's resolved React), Node 24. No Three/R3F, Vite app or POC imports. Shared `TenantContext` comes from `@lume/types` as a type-only dependency.
- Root wiring is deliberately minimal: three **new** delegates (`dev:web`, `build:web`, `typecheck:web`) and eight additive lockfile records. All pre-existing lock records, versions, integrity and platform metadata remain unchanged. Existing `build`, `dev`, `build:admin`, dependency declarations, Vite source/config, root `vercel.json`, admin source and CI commands remain unchanged. The wildcard `apps/*` workspace definition already covers web.
- Only `/preview` dynamically server-renders a tenant identity, title, description and canonical. `/` is a static foundation notice; `/robots.txt` disallows all crawling. Global metadata and headers set noindex, nofollow, noarchive/private/no-store, including rejected requests. Ingress allows only GET/HEAD. No API adapters, inventory, forms, analytics, concierge, models or production route rewrites are introduced.
- The server repository can POST only the existing read-only `tenant_by_slug` RPC for tenant identity and GET exact verified-domain metadata. It uses no-store fetches, bounded timeout, no redirects, no logged keys/response bodies, and returns a minimal public tenant DTO.
- `requestTenant` uses request-scoped `React.cache` to share a result between metadata and page. There is no module-level current-tenant state, persistent identity cache, tenant cookie or browser storage fallback. A tiny client leaf receives only a serialized slug so the proof explicitly exercises React Flight.

## Host, selector and canonical policy

The Node proxy rejects unknown ingress hosts, supplied `x-lume-tenant` / `x-web-tenant`, mismatched `x-forwarded-host` and duplicate tenant queries before rendering. Forwarded host never selects identity. Static `_next` assets contain no tenant data and bypass this proxy; global noindex headers still apply.

The server resolver then normalizes DNS host/case/trailing dot/port, rejects lists/userinfo/schemes/nested or reserved tenant labels, and selects in this order:

1. An exact `WEB_PREVIEW_CUSTOM_HOSTS` host-to-slug allowlist entry **and** one existing database row matching the exact domain, `verified=true` and `verification_status=verified`. Resolve the allowed slug through anon `tenant_by_slug` and require its ID to match the domain's tenant ID. A mismatched/unverified row returns 404. Only `tenant_id,domain` are selected; verification tokens never leave the database.
2. Exactly one non-reserved label under `WEB_PREVIEW_ROOT_DOMAIN`, if explicitly enabled for the staging root. Verify the slug is active through the existing RPC.
3. Query `?tenant=` or an explicit default only on exact `WEB_PREVIEW_HOSTS`, the platform's exact `VERCEL_URL` in a Preview deployment, or loopback outside Vercel. Arbitrary `*.vercel.app` hosts do not become tenant labels. Conflicting host/query selectors return 404. Unknown/suspended tenants never fall back to a different business.

Custom-host canonical origins come from the exact verified mapping; root-domain canonicals come from the configured staging root and validated slug. Preview canonicals contain the tenant query to avoid identifying different previews as the same document. The route remains `/preview`; there are no production URLs to cut over. Hostnames not accepted by the resolver cannot influence metadata. A later phase must define preferred customer-domain canonical policy when multiple verified domains exist; this preview does not assume that all are interchangeable.

There is no shared caching/ISR in this phase. HTML and RSC responses are private/no-store, including 404s. Changing a tenant between requests requires a fresh identity read, while metadata and page share one request-local read.

## Environment isolation and configuration

This machine's existing generic Supabase bindings point at the known production project. They are **not reused** by web. No dedicated staging bindings were available during this task. The runner strips all inherited application/provider/Git credentials and forwards only an explicit infrastructure allowlist plus `WEB_PREVIEW_*` names. It rejects dotenv files because Next could otherwise auto-load them after sanitization. Both build and start refuse `VERCEL_ENV=production`.

| Preview binding | Purpose / requirement |
|---|---|
| `WEB_PREVIEW_SUPABASE_URL` | Dedicated non-production HTTPS project origin; required to run against staging |
| `WEB_PREVIEW_PROJECT_REF` | Explicit expected staging project ref; must match that origin and differ from the known production ref |
| `WEB_PREVIEW_SUPABASE_ANON_KEY` | Staging public-read key; used server-side only in Phase 1 |
| `WEB_PREVIEW_SUPABASE_SERVICE_ROLE_KEY` | Optional **staging-only** key for exact verified-domain metadata; not needed for query/subdomain identity |
| `WEB_PREVIEW_HOSTS` | Comma-separated exact approved preview hosts; no wildcard host grants |
| `WEB_PREVIEW_ROOT_DOMAIN` | Optional explicitly approved staging tenant DNS root |
| `WEB_PREVIEW_DEFAULT_TENANT` | Optional fallback only on approved preview hosts |
| `WEB_PREVIEW_CUSTOM_HOSTS` | JSON object mapping exact custom host to expected tenant slug; database verification also required |

Legacy JWT project/role claims are checked against staging before use, including rejecting a production JWT pointed at a different URL. Opaque new-format keys cannot reveal project identity from their prefix; use actual staging-issued keys and verify their authorization. Their upstream destination is always the validated staging origin. Invalid URL/credential errors report no values. Local test-mode origin/keys are allowed only for the contract-double verifier and are explicitly forbidden when `VERCEL` is present.

The three core staging binding requirements were saved in the cloud configuration draft, with **no values**. This does not provision a staging project, apply runtime settings or publish an environment. Enter dedicated staging values securely in environment settings; no key should be supplied through chat, a PR, or a checked-in file. An optional domain key belongs only in the isolated staging deployment's secure configuration.

Vercel serverless functions bootstrap independently of `npm start`: runtime configuration is validated again without requiring the local launcher's build marker. Known generic application secrets and production project/deployment settings cause a failure. Build-time stripping cannot remove values injected separately by a hosting platform. Therefore the new project's runtime variable inventory must be inspected as part of the pending hosted gate; the local process proof is not substituted for it. A dedicated test covers this hosted-runtime bootstrap path.

### Full current VITE mapping

The table is generated/verified from `apps/web/config/env-mapping.json`. Run `node apps/web/scripts/audit-env.mjs`; it compares every unique current `VITE_*` name in root source/config to that mapping and fails on additions or omissions. Next targets follow the approved plan. Flags for features not implemented until later phases are explicitly deferred; they are not silently exposed to this preview.

| Vite | Next semantic target | Phase 1 disposition |
|---|---|---|
| `VITE_ACCESS_PASSWORD` | Retire as security control | No password gate or browser secret in Phase 1 |
| `VITE_ADMIN_API_HOST` | LUME_ADMIN_API_ORIGIN | Server-only; no Phase 1 API proxy |
| `VITE_ENABLE_GOOEY_NAV` | NEXT_PUBLIC_ENABLE_GOOEY_NAV | Deferred client visual feature |
| `VITE_ENABLE_LOCAL_CHAT` | NEXT_PUBLIC_ENABLE_LOCAL_CHAT | Deferred; chat disabled |
| `VITE_LUME_TENANT` | LUME_DEFAULT_TENANT | WEB_PREVIEW_DEFAULT_TENANT; approved preview hosts only |
| `VITE_OLLAMA_CHAT_URL` | NEXT_PUBLIC_OLLAMA_CHAT_URL | Deferred fixed same-origin route, not arbitrary upstream |
| `VITE_OLLAMA_EMBED_MODEL` | OLLAMA_EMBED_MODEL | Server-only; declaration-only legacy surface |
| `VITE_OLLAMA_HOST` | OLLAMA_HOST | Server-only; absent in Phase 1 |
| `VITE_OLLAMA_MODEL` | OLLAMA_MODEL | Server-only; absent in Phase 1 |
| `VITE_PAGE_RENDERER` | LUME_PAGE_RENDERER_ENABLED | Server decision + serialized flag; Phase 3 |
| `VITE_POSTHOG_ENABLED` | NEXT_PUBLIC_POSTHOG_ENABLED | Deferred; no analytics in preview |
| `VITE_POSTHOG_HOST` | NEXT_PUBLIC_POSTHOG_HOST | Deferred public ingest host |
| `VITE_POSTHOG_PROJECT_TOKEN` | NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN | Publishable project token only; deferred, never personal API key |
| `VITE_POSTHOG_SESSION_REPLAY` | NEXT_PUBLIC_POSTHOG_SESSION_REPLAY | Deferred consent-controlled flag |
| `VITE_PREVIEW_TOKEN` | Retire public token; server-only draft-mode capability if drafts added | Not an auth mechanism; absent in Phase 1 |
| `VITE_R2_PUBLIC_BASE_URL` | R2_PUBLIC_BASE_URL / NEXT_PUBLIC_R2_PUBLIC_BASE_URL | Deferred; URL props from server when media routes arrive |
| `VITE_SUBDOMAIN_TENANT_ROUTING_ENABLED` | SUBDOMAIN_TENANT_ROUTING_ENABLED + LUME_ROOT_DOMAIN | WEB_PREVIEW_ROOT_DOMAIN explicitly enables the staging root |
| `VITE_SUPABASE_ANON_KEY` | SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY | Phase 1 uses WEB_PREVIEW_SUPABASE_ANON_KEY server-only |
| `VITE_SUPABASE_STORAGE_URL` | NEXT_PUBLIC_SUPABASE_STORAGE_URL | Deferred public fallback URL |
| `VITE_SUPABASE_URL` | SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL | Phase 1 uses WEB_PREVIEW_SUPABASE_URL only; no browser database client |
| `VITE_TURNSTILE_SITE_KEY` | NEXT_PUBLIC_TURNSTILE_SITE_KEY | Deferred publishable site key; secret stays server-only |
| `VITE_USE_BACKEND` | NEXT_PUBLIC_USE_BACKEND | Deferred parity flag; Phase 1 identity is always server-side |
| `VITE_VERCEL_GIT_COMMIT_SHA` | VERCEL_GIT_COMMIT_SHA | Server build identifier; serialize only when needed |

All `NEXT_PUBLIC_*` targets above refer to public configuration, never provider/service keys. Phase 1 forwards **none** of the generic browser/server bindings from this production-configured cloud machine. Future per-tenant public settings should be passed from server DTOs rather than baked into one tenant build. R2 signing, AI providers, visitor/cron/encryption/bypass tokens stay server-only and are neither required nor available inside web in this phase.

## Import boundaries

`build` and `typecheck` run `scripts/check-boundaries.mjs`, which parses imports/re-exports/literal dynamic imports using TypeScript and traverses the graph. The existing root CI already runs workspace typechecks, so this check runs without modifying CI or the Vite build.

- Server/config/client graphs cannot escape `apps/web` into root Vite source, admin implementation or the POC. Only approved runtime packages and type-only `@lume/types` are admitted.
- Server loaders and infrastructure cannot transitively import `'use client'` modules. Client graphs cannot reach `server`, `config`, `server-only` or server-only Next APIs. Client `process` access is rejected. Nonliteral module loading is rejected rather than escaping the audit.
- Server pages may compose an explicit client leaf with serializable props. This is the normal App Router boundary, not permission to import a client implementation into the data layer.
- Actual repository/request adapters also import framework `server-only`, so bypassing the audit still causes a Next compile failure if they enter a client graph. The pure resolver core is deliberately independently testable; its folder boundary is enforced by the import graph check.
- Mutation tests in the foundation suite create an indirect server→client→server cycle and an out-of-workspace import in a temporary fixture and prove that the checker rejects them. No existing application test is modified.

## Concrete exit-gate evidence

The automated verifier runs `next start` from the production build against two synthetic **active** tenants in a local Supabase contract double. It starts a fresh app with production-shaped sentinel bindings inherited in its launcher, verifies the real Next subprocess environment through a test-only preload, then makes actual HTTP/Flight requests. It does not connect to production or create records.

```text
PASS actual Next process contains zero generic production/application/token bindings
PASS alternating HTML and React Flight alpha → beta → alpha → beta; 20 concurrent requests remain isolated
PASS verified custom-domain contract; 12 forged/unknown selector cases return 404; noindex robots and responses
```

For each of the eight alternating HTML/Flight requests the evidence records HTTP 200, the expected name/slug, absence of the other tenant's name, no-store/noindex, and exactly one identity lookup shared between metadata and page. Concurrent responses are checked independently. Twelve negative cases cover unknown/nested/reserved/unverified/suspended hosts, conflicting/duplicate selectors, internal-header forgery, forwarded-host forgery, arbitrary Vercel labels and unknown root host. POST returns 405. `artifacts/isolation.json` is generated, ignored and reproducible.

| Required gate | Local evidence | Hosted staging status |
|---|---|---|
| Two active tenants alternate without HTML/Flight/cache contamination | **PROVEN locally**, eight alternating responses plus 20 concurrent requests; metadata/body identity consistent and request-local dedup verified | **BLOCKED**, no dedicated staging URL/key/ref or two staging tenant selectors supplied; synthetic contract rows are not called real staging tenants |
| Unknown/forged hosts and selectors rejected | **PROVEN locally**, 12 rejection cases plus custom-domain verification contract | **PENDING hosted check**, separate Vercel project's forwarding/routing behavior is not inferred from local requests |
| Production keys absent from staging preview | **PROVEN for the actual locally started Next subprocess**, plus production URL/JWT/role rejection tests and compiled output scan; inherited generic production bindings removed | **PENDING hosted check**, there is no linked/deployed staging web project to inspect |

The implementation and local proofs are reviewable now. The full hosted gate is **not proven** and must not be marked complete until those prerequisites are provided and tested. Stop after this draft; do not implement Phase 2 to work around missing staging access.

## Function-budget audit

Run `npm run audit:functions --workspace=@lume/web` after building. It records source handlers/helpers, Next route/prerender manifests, and, when available, actual `.vercel/output/functions/**/.vc-config.json` records in ignored `artifacts/function-audit.json`.

| Project / evidence | Count and headroom |
|---|---|
| Existing `lume` Vite public source | Eight default-export HTTP handlers: chat, consent, events, leads, vehicle list/detail/facets and visitor catch-all. Helpers `usage.ts` / `visitorSessionCookie.ts` are not HTTP handlers. Root source unchanged |
| Root source estimate against 12 | 4 slots if only the eight real handlers deploy; conservative 2 slots if both helper files are counted by the existing build. This is not a verified deployment count |
| New separate `apps/web` Next build | One dynamic page `/preview`; static `/`, robots and framework error pages; one Node proxy; **zero new API handlers**, no image optimizer usage/dynamic OG generation |
| New web estimate against 12 | Conservatively 2 dynamic units (SSR + proxy), leaving 10 estimated slots, **subject to Vercel grouping/runtime accounting** |
| Actual Vercel Build Output / deployment | **UNVERIFIED**: no Vercel CLI, project link/token or connected Vercel tool was available. No `.vercel/output/functions` exists. Counts are explicitly not reported as deployed/billable counts |

The two projects have separate budgets; do not add their counts as though they were one deployment. A real preview build must inspect the Vercel manifest/deployment details and enforce ≤12 before claiming the Phase 1 hosted gate or Phase 2 readiness. No production deployment or account-plan change was attempted.

## Preview project configuration and reproduction

Create/link only a new dedicated `lume-web` staging/preview Vercel project rooted at `apps/web`, with monorepo source inclusion, no customer domains, and no production application keys. `apps/web/vercel.json` installs workspaces from the monorepo root, builds web only, and skips production deployments; the launcher independently refuses production. Root `vercel.json` and both live projects remain untouched. No routing or DNS cutover is involved.

Securely supply the explicit staging bindings above and exact preview host. For localhost, use `npm run dev:web` (port 3200) or `npm run build:web` then `npm run start --workspace=@lume/web`. The compilation intentionally needs no production/staging credentials; starting a real data preview requires staging values. No `.env.local` files are accepted by this launcher. `NODE_USE_ENV_PROXY` and the platform CA are retained when needed; TLS verification is not disabled.

From repository root:

```sh
npm ci --legacy-peer-deps
npm run build:web
npm run typecheck:web
npm run test:foundation --workspace=@lume/web
npm run verify:foundation --workspace=@lume/web
node apps/web/scripts/scan-output.mjs
node apps/web/scripts/audit-env.mjs
npm run audit:functions --workspace=@lume/web
```

The local verifier deliberately uses an isolated loopback origin and synthetic active tenants; test mode is forbidden in Vercel. Repeat the same alternating HTML/Flight and negative requests on the eventual hosted staging preview using **real active staging tenants**, without enabling test mode. A positive custom-domain check additionally needs an already-verified staging mapping and staging domain-read binding under existing RLS. Do not add a migration or relax RLS if those are absent; report the prerequisite instead.

## Verification results and next review

| Check | Result |
|---|---|
| `npm run typecheck:all` | Passed, including the new web workspace and boundary audit |
| `npm test -- --run` | Failed: 295 files passed / 2 failed; 2,327 tests passed / 2 timed out (SFTP and credential-output harness) |
| Targeted single-worker rerun with 30-second test timeout | Credential-output harness passed 8/8; SFTP passed 6/7, with the known application timeout before the expected size-limit error |
| `npm run build` | Passed; existing Vite warnings retained |
| `NODE_USE_ENV_PROXY=1 npm run build:admin` | Passed; existing admin warnings retained |
| `npm run check:migrations` | Passed: 92 sequential migration files; none applied |
| `git diff --check` | Passed |
| `npm run build:web` | Passed, with no staging or production credentials needed |
| `npm run typecheck:web` | Passed |
| `npm run test:foundation --workspace=@lume/web` | Passed: 7 tests, 0 failures, including boundary mutation tests |
| `npm run verify:foundation --workspace=@lume/web` | Passed against production build / local contract double: 8 alternating HTML/Flight responses, 20 concurrent requests, 12 rejection cases, verified-domain contract and read-only methods |
| `node apps/web/scripts/scan-output.mjs` | Passed: 82 compiled server/client files contain none of the inherited production credential values |
| `node apps/web/scripts/audit-env.mjs` | Passed: all 23 current VITE names have explicit mappings |
| `npm run audit:functions --workspace=@lume/web` | Local manifest/source audit recorded; actual Vercel deployment count remains unverified |
| Existing manifest/lock preservation | Every previous lock record unchanged; existing scripts/build/deploy/dependency declarations preserved; only new delegates and additive records |

Existing test failures are reported and were not masked by code or assertion changes. The shared-memory credential-output harness clears on a longer-timeout single-worker rerun; SFTP remains an application-timeout-versus-size-cap failure already seen before this phase.

Open risks / Phase 2 prerequisites: complete dedicated staging bindings and hosted isolation/secret audit; link/build only the separate preview project and inspect actual function accounting; review custom-domain metadata permissions without broadening RLS; rebase the approved reference plan after #94 is merged. Browser storage migration, live inventory SSR/DTOs, API adapters, R2/model/shader parity, templates, concierge and mobile performance remain later phases. This task stops for review and does not start any of them.
