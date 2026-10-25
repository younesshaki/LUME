# Public Next.js migration: decision, proof and execution plan

Status: investigation and disposable POC only. **No public application migration is implemented by this PR.**
Reviewed against `staging` commit `ee51ee197f12039405751b414e44e75d652bdb94` on 2026-10-26.

## Decision

Proceed with a gated, route-by-route Next.js App Router migration into `apps/web`, beginning with vehicle detail. Do not approve a big-bang rewrite or production cutover from this proof. Server-rendered business content and metadata are the product; WebGL, cinema and chat remain optional client islands. Moving the entire Vite `App` behind `ssr: false` would preserve the SEO problem and is not an acceptable migration.

Keep `apps/admin` as the backend authority and admin deployment. Retain public API contracts while replacing their transport adapters. Use npm workspaces, Node 24 and the existing Next 16 line; do not introduce a router competition, Turborepo, new database schema or new authentication system as part of this work.

This document supersedes the migration recommendations in all ten older `docs/scalability` documents. They remain historical design discussion, not parallel execution plans. Nothing here authorizes deploying the POC or changing customer domains.

## Verified starting point

| Topic | Repository/runtime evidence | Consequence |
|---|---|---|
| Public footprint | `src` has 540 files; 487 `.ts/.tsx/.css/.glsl` files, 58,843 lines including tests/styles. Counted by Python `Path.rglob`, suffix filter and `splitlines`; not binary asset bytes | The proposed 423 files / 44k lines underestimates today's source surface |
| Browser-only surface | 104 code files contain `window` or `document`; 19 directly import Three/R3F; 48 code files under `experience/scenes`; two standalone example `.glsl` files | Counts overlap and do not measure the transitive client graph. Audit module initialization, effects, inline shader strings and third-party dependencies; a textual hit is not automatically a reason to disable SSR |
| Routing | `src/app-shell/routePaths.ts`, `NavigationProvider`, React Router 6 and URL-based product/vehicle routes already exist | Do not repeat the earlier screen-state-to-router project |
| Backend | `apps/admin` already runs Next 16; DB/types/RAG/bot/blocks/email workspaces exist | Reuse domain contracts; do not recreate admin inside the public tree |
| API surface | Ten non-test TS source files under root `api`, eight default-export handlers and two helpers (usage and visitor cookie; inventory below) | The premise of seven files is stale; count built deployment functions rather than filenames |
| SEO | Fresh local Vite GET `/`: 4,406 bytes, title `LUME`, no raw description/canonical/h1; `src/lib/seo/SeoProvider.tsx` updates SEO after hydration | The raw-HTML SEO failure is reproduced. Existing SEO rules should become server inputs, not be discarded |
| Media | Real R2 GLB and managed vehicle photograph are reachable. Vehicle detail currently uses a gallery; `DetailModelViewer` is used for product models | A product GLB can prove the integration boundary, but cannot prove vehicle-specific 3D data exists |
| Templates | `PageRenderer` fetches published page documents in an effect and imports a central block registry; vehicle wrapper falls back to the hardcoded page | Wrapping it wholesale in a client component will not server-render page-builder content |
| Deployment | Root `vercel.json` builds Vite `dist`; `lume` and `lume-admin` are separate projects; feature builds normally skipped by `scripts/vercel-ignore-build.mjs` | Keep these settings untouched in this PR. A POC directory is not automatically a Vercel preview |

The reported 7–11 MB page transfers and mobile LCP of 18–27 seconds are **not independently reproduced here**. They are motivating observations, not measured POC results. Before Phase 1, capture production and staging cold-cache waterfalls, compressed transfer bytes, request counts and mobile LCP/INP/CLS for both templates. A Next build alone cannot establish a speed improvement.

## Resolution of the older documents

| Earlier source | Disagreement / stale proposal | Converged decision and reason |
|---|---|---|
| [monorepo-foundation.md](monorepo-foundation.md) | Calls the `apps/web` move mechanical; proposes `git mv` of Vite including its config and `dist` output before tenancy | Keep its isolation and npm workspace choices. Introduce Next `apps/web` beside the root; transfer ownership route by route. Moving Vite first adds churn without SSR and must not precede the proof |
| [next-js-introduction.md](next-js-introduction.md) | Defer Next; first secure the DeepSeek proxy/RAG, estimated 6–11 hours | That backend work is substantially implemented in admin. SEO is now an explicit frontend requirement, so deferral no longer resolves the goal. Its estimate is not a frontend migration estimate |
| [routing-migration-plan.md](routing-migration-plan.md) | React Router is the target; gate remains overlay; 2–3 days | Retain URL semantics, sounds and incremental rollout. Replace only the router adapter for Next-owned routes. Business content cannot wait for an auth/preload overlay |
| [routing-plan-combined.md](routing-plan-combined.md) | Declares itself authoritative; embeds future admin in public router; tenancy deferred; contradictory SPA-fallback instructions | This plan is authoritative for the Next migration. Admin already exists separately; tenancy is required on the first SSR request. Next must not inherit the SPA catch-all rewrite |
| [gpt-routing-plan.md](gpt-routing-plan.md) | Sometimes gate owns `/`; experience state passed through history; recommends redoing router setup | `/` renders the tenant home; canonicalize `/home` later. Preserve current showcase entry query parameters so refresh works; do not recreate the routing foundation |
| [architecture-scalability-assessment-claude.md](architecture-scalability-assessment-claude.md) | Context-first vs direct router migration debate, based on old App size/no URL routing | Keep the navigation/layout contracts, not the historical prerequisite backlog. Use a thin Next adapter with route IDs, deliberate sounds, bot allowlists and one analytics event per committed navigation |
| [component-scalability-architecture-assessment-gpt5.5.md](component-scalability-architecture-assessment-gpt5.5.md) | Move domains to generic `features/*`; variants before router | Keep established feature locations until a route needs extraction; do not mix folder normalization with SSR. Preserve variant contracts at the client shell boundary |
| [debate.md](debate.md) | Chooses a sequence for extracting shell before adding a router | Its separation of ownership is useful; its sequence is already partly delivered. No second global route state should shadow Next URL state |
| [organizing-code.md](organizing-code.md) | All components communicate through UIState; broad folder reorganization | Keep colocation and public module boundaries. Props remain correct for directly related components. Server-rendered data is passed as serializable props, never through a mutable process-global UI store |
| [zustand.md](zustand.md) | Context now, migrate to Zustand only on a later trigger | Zustand 5 is already installed. Keep existing client state where useful; create stores per hydrated tenant tree, not per server process. A state-library rewrite is not a migration phase |

## Target architecture and the apps/web move

```text
apps/web/                         NEW Next public app, introduced in a later PR
  app/(public)/                  Server pages/layout, metadata, loading/errors
    vehicles/page.tsx
    vehicles/[vehicleId]/page.tsx
    [...slug]/page.tsx            published custom pages, after reserved routes
  app/api/                       compatibility route handlers, explicit methods
  server/                        server-only tenant, published content, data, SEO
  components/                    server markup plus narrow client islands
  public/                        public assets/decoders/fonts transferred by phase
apps/admin/                      unchanged canonical backend/admin authority
packages/types, db, blocks, ...  pure shared domain/data contracts
src/, public/, api/              existing Vite deployment during coexistence
poc/nextjs-vehicle-detail/        disposable proof, outside npm workspaces
```

`apps/web` does not exist in this PR. The POC has a separate exact-version manifest/lockfile and is outside `apps/*`/`packages/*`; root dependency declarations, lockfile, scripts, Vite config and app source are unchanged. Delete `poc/nextjs-vehicle-detail` to remove it. Never add the POC to a live project's root directory or build command.

In Phase 1 create `@lume/web` and explicit root delegates (`dev:web`, `build:web`, `typecheck:web`) in a separate reviewed PR. Leave `npm run build` producing Vite until the final retirement phase. React 18/R3F 8 at root and React 19/Next 16 in admin are separate compatibility domains: never hoist a React upgrade across both apps to make one route compile. Choose and pin a React-19-compatible R3F/drei pair **inside web**, prove representative models first, and keep lockfile changes scoped. The POC deliberately uses direct Three.js 0.164 to avoid asserting untested R3F 8 / React 19 compatibility.

Before relocating public assets, inventory absolute `/draco`, fonts, sounds, CSS URLs, R2 fallback paths and module aliases. Move pure types/validation/route builders into existing shared packages before reusing them. Follow the foundation coupling audit: `seed-default-pages` imports root defaults, `create-tenant` calls it, embeddings scripts import root knowledge, asset checks use root catalog. Update each script's ownership only when its source moves. Do not copy the entire root `src` into a giant client entry and call the move complete.

## Rendering and SEO contract by route

Default to dynamic SSR with explicit `no-store` data while tenancy is being proven. `generateMetadata` and the page must call the same request-memoized loader. `React.cache` deduplicates **within a request**; it is not a tenant-blind persistent cache. Metadata, body, theme and canonical must agree even with JavaScript disabled.

| Route | Initial strategy / later cache | Server HTML and SEO | Client islands |
|---|---|---|---|
| `/`, `/home` | SSR per tenant; later published-content data cache with short TTL + publish invalidation. `/home` redirects to `/` once legacy links are accounted for | Tenant/page title, description, canonical `/`, OG image/text, one business h1, visible intro and main links; Organization/LocalBusiness schema from actual business data | Luxury hero/cinema, Glo3D interactions, navigation sounds and optional entry gate; content remains visible without them |
| `/vehicles` | SSR initial results, query filters and pagination; no shared personalized cache | Inventory title/description/h1, crawlable detail links and initial cards, page-specific canonical policy. Index curated landing pages; noindex arbitrary filter/sort combinations; never silently canonicalize all pagination to page 1 | Filter/search refinement, compare tray, saved inventory, transitions |
| `/vehicles/[vehicleId]` | SSR live visibility, tenant and gallery together; later cache only explicitly public DTOs keyed by tenant+id+locale+content version | Year/make/model + tenant title, unique description, canonical, OG photograph, h1/specs/price/status in initial HTML. Vehicle/Product and Offer schema only with verified fields. Missing/cross-tenant/unpublished: real 404; sold: explicit policy, no stale offers | Gallery controls, 3D/spin if configured, financing/lead forms, vehicle-scoped chat entry |
| `/contact` | SSR published contact content; revalidate data on publish | Business contact title/description/canonical/OG/h1; address/hours/phone links and accessible form labels in HTML | Form submission, Turnstile, map loaded on interaction |
| `/products`, `/products/[productId]`, services/custom slugs | SSR published document/catalog; later tenant-scoped tagged cache, not global build-time tenant selection | Route-specific title/description/canonical/OG/h1, real product/service body and links, appropriate Product/Service schema when supported by data | Product viewer, booking/forms, accordions with server-rendered contents |
| `/showcase` | SSR landing text/posters/list; cache published data later | Showcase title/description/canonical/OG/h1 and crawlable product links | Video and cinematic previews loaded after intent |
| `/showcase/intro`, `/showcase/experience?part=&chapter=` | Minimal server frame plus client-only player | Meaningful fallback heading/description/poster/link; noindex internal player/intro URLs, canonical to relevant showcase landing | Canvas, custom shader pipeline, chapter state, music; validate/clamp entry parameters |
| `/account`, legacy `/admin*` | Private SSR/auth or redirect to existing admin project; never index | noindex/private cache; preserve intended destination and auth boundaries | Account interactions only; no admin bundle in public app |

Use `app/sitemap.ts` and `app/robots.ts` to emit **host/tenant-specific** URLs. A shared project must not publish every tenant's inventory under every host. Derive URLs from the verified canonical origin registry, include only live published routes, paginate inventory sitemaps, and set correct lastmod. Production robots allows public routes; preview/POC sends noindex both in metadata and `X-Robots-Tag`, and is excluded from sitemaps. Unknown tenant/domain must not emit a default tenant's sitemap. Robots.txt is not an authentication boundary.

Structured data must be escaped against `</script>` injection, use only public DTO fields, and reflect visible content. Lead/admin data and service credentials never enter HTML, React Flight payloads, JSON-LD or logs. Test ordinary user agents and crawler user agents: Next 16 may stream metadata, so explicitly block metadata streaming where the acceptance contract requires tags in the initial head (the POC sets `htmlLimitedBots: /.*/`). Account for the TTFB tradeoff rather than claiming it is free.

## Client boundaries, visual parity and media

1. Server page fetches tenant, published document, vehicle, image and SEO once and renders useful HTML. Stable sized photograph is the LCP candidate. Use responsive sizes/AVIF/WebP as supported by actual sources; preload only that primary image. Avoid full-screen preloader or opacity-zero cinematic wrapper around server content.
2. A small `'use client'` wrapper uses `next/dynamic` with `ssr:false` for the WebGL module; Next disallows that option directly inside a Server Component. Further conditionally mount it on user intent/visibility. Merely marking a whole page `'use client'` neither guarantees browser-only module evaluation nor reduces downloaded JS.
3. Audit `DetailModelViewer`, `ModelAsset`, `ModelStage`, GSAP, Lenis, audio, ResizeObserver and canvas for module-scope browser access, cleanup and WebGL context loss. Dispose geometries/materials/textures, cancel loops and abort/ignore late loads. Keep keyboard controls, touch fallback, reduced-motion and a static photograph for unavailable WebGL. Draco/Meshopt paths and CORS must work on the final host.
4. Shader migration is explicit: the POC proves webpack `asset/source` imports for both existing standalone example shaders. `vite-plugin-glsl` itself does not run in Next. Inventory inline GLSL and `#include` dependencies; Three shader chunks and any Vite-expanded local includes have different semantics. Port and compare those pipelines in Phase 5, pin webpack initially, and evaluate Turbopack only after parity. No claim that two example shaders validate all cinematic materials.
5. Server-render the page-builder's published document and **all indexable blocks**. Share block schemas/validation through `@lume/blocks`; create separate server and client registries. `registerBlocks.ts` currently imports the entire block surface and `PageRenderer` loads in an effect, so importing either wholesale would defeat the split. Rich text, headings, specs, grids and business contact render on the server; forms, viewers and music hydrate small leaves. Published HTML/metadata must derive from the same document version. Preview is a signed, expiring, server-only draft-mode capability if drafts are introduced; the existing public preview token is not security.
6. Maintain a parity matrix: Luxury × Glo3D × light × dark × page-builder/hardcoded fallback × mobile/desktop. Preserve CSS tokens, fonts, gallery media, concierge CTA, leads/consent, bot navigation and sounds. Tenant owns template; user theme preference may use a cookie to prevent hydration flash. localStorage preferences are read in effects and cannot choose initial server content.
7. Preserve `navigateTo`'s typed bot action allowlist and metadata, implement with `next/navigation`/`Link`. Full document navigations across Vite/Next boundaries are expected during coexistence. Carry explicit tenant/query inventory state; do not depend on shared browser-history state or in-memory stores. Disable speculative prefetch for expensive cinema and across non-owned routes.

## Tenant resolution and cache isolation

Current behavior is inconsistent: `publicTenant.ts` chooses browser subdomain → query → localStorage → Vite default at module boot, while `apps/admin/lib/tenant.ts` selects header → query → legacy host; SCRUM-105 middleware overrides selectors on configured tenant hosts. An SSR page cannot read localStorage, and module-global tenant selection would leak content between requests.

Production resolver for `apps/web/server/tenant.ts`, shared with metadata/page/API adapters:

1. Normalize request host (case, trailing dot, port) and accept forwarded host only from the trusted deployment edge. Strip caller-provided internal tenant headers at ingress. Never construct canonical URLs from arbitrary Host or X-Forwarded-Host.
2. Look up an **exact verified custom-domain mapping** (`tenant_domains` verification state), otherwise exactly one non-reserved tenant label under configured `LUME_ROOT_DOMAIN`. Domain metadata may require a narrowly scoped server-only admin lookup under existing RLS: query only the exact normalized host and verified state, return tenant identity/canonical origin, never verification tokens or full tenant configuration. Do not broaden anonymous table grants or add a migration for this. Verify the resulting slug is an active tenant via `tenant_by_slug`. Unknown/suspended/unverified hosts return 404, never the default business.
3. Host-derived tenant wins; reject a conflicting query/header rather than caching mismatched selectors. On localhost or explicitly approved preview hosts only, `?tenant=` is a supported selector. A validated tenant preview cookie may later provide convenience, with private/no-store responses. Production customer hosts ignore no such browser persistence override.
4. Use an explicit default only on the configured platform apex/approved preview host. Do not interpret random `*.vercel.app` labels as tenant names. Query previews remain noindex; production canonical comes from a verified domain mapping, excludes tracking/preview selectors, and includes only supported pagination/filter identity.
5. Resolve once per request and pass immutable `{id, slug, canonicalOrigin, publishedVersion, template}` through server loaders. Scope **every** database query by tenant ID and public status using anon/RLS; do not fetch all tenants' inventory and filter in memory. Mirror the existing bounded gallery service-role exception only after anon visibility is established. Prefer the existing public API contract over expanding privileged reads.
6. Initially use `private, no-store` for HTML, Flight, redirects, errors and tenant previews. Before ISR, prove alternating host A/B responses and cross-tenant negative cases, include tenant+entity+locale+version in cache keys/tags, and invalidate on publish, inventory update and suspension. Host-only `Vary` is not a substitute for explicit cache partitioning. Cookies/visitor personalization bypass shared data caches.

The POC implements localhost query selection and a strict `*.lume.test` host root, active-tenant RPC, scoped live-vehicle query and cross-tenant 404. Its canonical is an explicitly configured **local proof URL**, including query tenant so two previews cannot share a canonical accidentally. Real verified-domain resolution, cookies, upstream proxy header trust and production caching are Phase 1 work, not claimed as proved by a test Host header.

## Environment mapping (complete current VITE inventory)

23 unique `VITE_*` names occur in current source/config/declarations/tests. Some are declaration-only legacy settings. Next browser variables are build-time inlined; per-request multi-tenant values should usually be serialized from the server rather than baked into a single tenant build.

| Current name | Eventual Next equivalent / disposition |
|---|---|
| `VITE_SUPABASE_URL` | `SUPABASE_URL` server; `NEXT_PUBLIC_SUPABASE_URL` only if browser auth needs it |
| `VITE_SUPABASE_ANON_KEY` | `SUPABASE_ANON_KEY` server public reads; `NEXT_PUBLIC_SUPABASE_ANON_KEY` only for browser auth |
| `VITE_R2_PUBLIC_BASE_URL` | `R2_PUBLIC_BASE_URL` server URLs; `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` only for static client references; prefer passed props |
| `VITE_SUPABASE_STORAGE_URL` | `NEXT_PUBLIC_SUPABASE_STORAGE_URL` optional public fallback; pass tenant-specific URL from server |
| `VITE_LUME_TENANT` | `LUME_DEFAULT_TENANT` server fallback on approved hosts only; not a browser global |
| `VITE_SUBDOMAIN_TENANT_ROUTING_ENABLED` | `SUBDOMAIN_TENANT_ROUTING_ENABLED` + `LUME_ROOT_DOMAIN` server resolver; no browser flag controlling identity |
| `VITE_ADMIN_API_HOST` | `LUME_ADMIN_API_ORIGIN` server/dev proxy; browser calls same-origin `/api`; no exposed internal upstream |
| `VITE_ACCESS_PASSWORD` | Retire as security control; if visual demo gate retained, a public UI option. Real auth stays server/Supabase; never rename into a presumed secret browser password |
| `VITE_USE_BACKEND` | `NEXT_PUBLIC_USE_BACKEND` temporary parity flag; remove after server data is mandatory |
| `VITE_ENABLE_LOCAL_CHAT` | `NEXT_PUBLIC_ENABLE_LOCAL_CHAT` development-only opt-in |
| `VITE_OLLAMA_HOST` | `OLLAMA_HOST` server-only upstream, allowlisted; no browser-selectable proxy destination |
| `VITE_OLLAMA_CHAT_URL` | `NEXT_PUBLIC_OLLAMA_CHAT_URL` fixed same-origin development route, not arbitrary remote URL |
| `VITE_OLLAMA_MODEL` | `OLLAMA_MODEL` server configuration; optional public model label via props |
| `VITE_OLLAMA_EMBED_MODEL` | `OLLAMA_EMBED_MODEL` server only; declaration is not proof it is used in browser |
| `VITE_ENABLE_GOOEY_NAV` | `NEXT_PUBLIC_ENABLE_GOOEY_NAV` client visual feature flag |
| `VITE_TURNSTILE_SITE_KEY` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` public site key; retain server `TURNSTILE_SECRET_KEY` in admin |
| `VITE_PAGE_RENDERER` | `LUME_PAGE_RENDERER_ENABLED` server decision plus serialized boolean; avoid differing metadata/body branches |
| `VITE_PREVIEW_TOKEN` | Retire public token as a gate; server draft-mode secret only if accessing drafts. Existing token reveals published content, not authenticated drafts |
| `VITE_POSTHOG_ENABLED` | `NEXT_PUBLIC_POSTHOG_ENABLED` subject to existing consent semantics |
| `VITE_POSTHOG_HOST` | `NEXT_PUBLIC_POSTHOG_HOST` public ingest host |
| `VITE_POSTHOG_PROJECT_TOKEN` | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` publishable project token only, never personal API token |
| `VITE_POSTHOG_SESSION_REPLAY` | `NEXT_PUBLIC_POSTHOG_SESSION_REPLAY` consent-controlled client flag |
| `VITE_VERCEL_GIT_COMMIT_SHA` | server `VERCEL_GIT_COMMIT_SHA`, serialize bounded public build identifier where needed |

Keep `SUPABASE_SERVICE_ROLE_KEY`, `DEEPSEEK_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, proxy bypass/visitor secrets and provider tokens server-only. R2 signing requires actual secret bytes in the server runtime; HTTP proxy placeholders cannot compute SigV4 locally. Preserve `LUME_CHAT_UPSTREAM_URL`, `LUME_LEADS_UPSTREAM_URL`, `LUME_CHAT_BYPASS_SECRET`, `ALLOWED_CHAT_ORIGINS`, `LUME_ENVIRONMENT` and deployment-isolation checks on the owning project. Staging must target a dedicated staging Supabase project; this proof used read-only public/demo records in the configured project and ran no seeds/migrations.

## Public APIs and the Hobby function budget

Do not merge admin's many route handlers into the Hobby public project. Preserve public URLs, methods, status codes, content types, tenant scope, streaming, timeouts, origin checks, rate limits, consent, visitor cookies and upstream error behavior. Route handlers use Web Request/Response; root Vercel Request/Response functions cannot be renamed to `route.ts` unchanged.

| Current source | Future Next transport | Ownership and compatibility tests |
|---|---|---|
| `api/chat.ts` | `app/api/chat/route.ts` POST/OPTIONS | Thin streaming proxy to admin; preserve SSE/chunk flushing, cancellation, tenant validation, bypass header only server-side; do not rebuild RAG in public app |
| `api/vehicles.ts` | `app/api/vehicles/route.ts` GET/OPTIONS | Anon tenant-filtered inventory DTO; keep filters, limits, sold/stock semantics |
| `api/vehicles/[id].ts` | `app/api/vehicles/[id]/route.ts` GET/OPTIONS | Live vehicle visibility before privileged gallery metadata; preserve gallery order, priceSignal and old-schema feed fallback |
| `api/vehicles/facets.ts` | `app/api/vehicles/facets/route.ts` GET/OPTIONS | Tenant-scoped facet semantics; static facets route must beat dynamic id |
| `api/leads.ts` | `app/api/leads/route.ts` POST/OPTIONS | Preserve explicit/derived admin upstream, Turnstile, tenant and origin validation, no double submissions |
| `api/consent.ts` | `app/api/consent/route.ts` matching existing methods | Proxy existing consent semantics; do not start telemetry before consent resolves |
| `api/events.ts` | `app/api/events/route.ts` matching existing methods | Preserve event payload limits, origin and failure behavior |
| `api/usage.ts` | `server/usage.ts` | Currently a named metering helper, **not a default HTTP handler**. Preserve usage RPC behavior, do not add a new route |
| `api/visitor/[...path].ts` | `app/api/visitor/[...path]/route.ts` GET/POST/OPTIONS | Explicit path allowlist; forward only visitor-session cookie and permitted response headers; retain anonymous `/me` fast path |
| `api/visitorSessionCookie.ts` | `server/visitorSessionCookie.ts` | Cookie helper only, no HTTP endpoint |

**Budget correction:** verify default exports rather than the task's seven-function assumption. The expected transport set is eight HTTP handlers if usage remains helper-only; root `api` contains two helpers. The deployed Vercel manifest is the acceptance evidence: source count is not the billable function count. Next may group handlers/pages into shared functions; do not promise that it does. After the first preview, inspect `.vercel/output/functions` and deployment details for Next pages, route handlers, image/OG handlers, middleware and sitemap/robots. Gate promotion at ≤12 deployable functions on the current plan, with headroom documented. If exceeded, retain admin upstreams and implement a single allowlisted `/api/[...path]` compatibility dispatcher (transport only), and/or confirm supported platform grouping. Recount on the actual Hobby deployment before adding routes. Budget failure blocks cutover; a paid-plan upgrade is a separate explicit decision.

SSR pages should call shared server loaders directly, not HTTP-fetch their own public `/api` route and add a cold start. Client interactions retain same-origin API URLs. Keep secrets out of middleware/edge bundles. This plan uses Node runtime for public SSR/API unless a later proof establishes edge compatibility.

## Incremental delivery, estimates and gates

One experienced engineer, focused engineering days; includes review/test work, excludes DNS/provider waiting time. These are ranges, not 2–3-day routing estimates. Tenant, page-builder and cinematic compatibility are the dominant risks.

| Phase | Concrete implementation slice | Exit gate | Effort |
|---|---|---|---|
| 0 — this PR | Audit, one disposable live-data vehicle page, raw HTML/browser proof, converged plan | Evidence and limitations below reviewed; no production routing changes | 2–3 days budget for independent reproduction/review |
| 1 — isolated web foundation | Create `apps/web` Next workspace/project; server-only data/tenant/canonical resolver; env parity; import boundaries; read-only preview with noindex; function manifest audit | Two active tenants alternate without HTML/Flight/cache contamination; unknown/forged host and selectors rejected; production keys absent from staging | 3–5 days |
| 2 — vehicle vertical slice | Real Next VDP with server gallery/specs/SEO, gallery island, CTA; inventory SSR and compatible public API transports; preserve legacy UUID URLs | JS-off raw metadata/content; cross-tenant 404; existing API contract tests and cookies; R2 CORS/media; price/sold/fallback semantics; usable mobile page without chat/3D | 5–8 days |
| 3 — published content and templates | Server block registry/schema reuse; migrate home, contact, products/services/custom published routes; separate interactive leaves | Luxury/Glo3D light/dark parity; published/fallback/empty/error cases; no duplicate h1/SEO; draft/preview isolation; forms/consent | 6–10 days |
| 4 — navigation, visitor and concierge | Next adapter for typed bot actions, browser history/query state, visitor session bridge, consent analytics; lazy chat with vehicle context | Multi-zone navigation, back/refresh; one event per action; cookies scoped correctly; SSE cancellation and tenant-bound actions, real provider smoke test in funded staging | 3–5 days |
| 5 — viewer and cinematic parity | React19-compatible R3F/drei extraction; actual model controls/decoders; shader expansion pipeline; showcase/intro/player with static fallbacks | Real target-device WebGL, no hydration or shader errors; keyboard/reduced-motion; repeat navigation cleans up contexts/audio; no mandatory cinema in LCP path | 4–7 days |
| 6 — staged routing and hardening | Tenant canary, route allowlist, production-shaped metrics, function count, sitemap/robots, verified-domain cutover/rollback rehearsal | SEO and perf gates below; deploy target/root/env verified; rollback exercised before domain promotion | 3–5 days |
| 7 — retire Vite | After a stable observation window, remove fallback routing, transfer remaining assets/scripts and update root delegates/docs/CI | All public routes owned by web, no legacy traffic dependency, clean install/build/test and domain inventory complete | 2–3 days |

Total after this investigation: **26–43 engineering days (about 6–9 focused weeks)** plus 20–30% contingency for template/shader/data edge cases and deployment limits (roughly 7–12 weeks calendar for one engineer with reviews). Two engineers may parallelize block parity and cinematic extraction after Phase 2; tenant/canonical decisions and cutover remain sequential. Re-estimate at each exit gate; do not reduce the estimate just because the minimal POC builds.

Each phase is reviewable in small PRs; a route can remain on Vite until its acceptance checks pass. The migration is a sequence of vertical slices, never a bulk file move followed by weeks of repair.

## Vercel rollout and rollback procedure

1. Preserve `lume` (Vite) and `lume-admin`. Create a separate `lume-web` Next project rooted at `apps/web`, npm workspace install from monorepo root, Next output (not `dist`) and explicit web build command. Enable monorepo source inclusion as required. Copy security headers deliberately; never carry over Vite's universal rewrite to `/`.
2. Apply environment scoping from `docs/deployment-environments.md`: dedicated staging DB, public and admin matched, previews noindex, correct admin upstream and allowed origins. Existing branch build policy deploys staging/main only; use an explicitly approved isolated preview configuration for web rather than silently setting a global forced-build override.
3. Stage under a test hostname with no customer traffic. Assert root `/api` precedence, `_next` assets, image optimizer remote patterns/width limits if introduced, R2 CORS and custom fonts. During coexistence use a distinct asset prefix or routing rule for the web build's `_next` assets; never route them to Vite's SPA fallback.
4. Introduce an explicit front-door route/tenant allowlist in a later deployment PR: initially only one opted-in tenant's VDP routes go to web; unmatched paths stay at the original Vite origin, APIs retain existing ownership. Preserve original Host through the trusted proxy. Use full navigations between apps until ownership is complete. Never enable a universal fallback that turns a real Next 404 into an indexable Vite 200.
5. Validate custom domains against verified tenant mappings, Vercel project assignments, certificates and DNS ownership before moving them. Domain reassignment for a shared apex must retain path routing for every unmigrated route; DNS alone cannot split route ownership. Hold both deployments and immutable artifacts available. Publish canonical hosts only after those hosts serve the intended Next routes.
6. Promotion gate: raw HTML SEO for each route/template and two tenants; 404/sold policy; correct canonicals/sitemaps; no secret/admin bundles; deployment function count ≤12; existing tests explained/passed; lead/visitor/chat contracts; mobile regression matrix. Measure with repeatable cold-cache mobile runs (at least 5) on the same profiles/content; target LCP ≤2.5s, CLS ≤0.1 and field p75 INP ≤200ms, with explicit data collection window. Set an initial JS budget for non-cinematic landing routes (≤200 kB gzip first-party initial JS is a target to measure, not a POC result); zero GLB/video/chat fetch before intent. If targets cannot be met, stop rollout and inspect images/fonts/block/client graph; Next alone is insufficient.
7. Rollback trigger: wrong-tenant metadata/data, material lead/auth/chat failure, server-error spike, SEO/canonical regression or failed asset routing. Restore the previous front-door allowlist/domain assignment and immutable Vite deployment; purge affected CDN HTML/Flight/cache entries, preserve asset origins for existing tabs, and verify both a new visit and an already-open session. No schema rollback is needed because this migration introduces no DB changes. Keep captured release config, env names, deployment IDs and domain map with each promotion. Do not wait for DNS TTL if a routing/deployment switch can restore service first.
8. Observe each canary for an agreed business traffic window (minimum 48 hours; search indexing takes longer). Keep rollback available through at least one full inventory/publish cycle. Retire Vite only after traffic/error logs prove no remaining dependency.

## Disposable POC: reproduction and evidence

See [POC README](../../poc/nextjs-vehicle-detail/README.md) for exact installation, environment, build, start and verification commands. Its only content route is `/vehicles/[id]`. It never writes to the database or R2, sends chat, changes domains or runs migrations. It uses the active `demo-max` tenant and a real live Ferrari with a managed R2 photograph; it is always noindex and must not be deployed as a customer website.

### Observed proof results

Built with Next 16.2.6 (webpack), React 19.2.4, Three 0.164.1 and Node 24.19.0. `next build` marks the vehicle page and fixed model proxy dynamic. The proof was run against the production build, not just the development server.

Raw response for the sample, extracted from the saved 11,017-byte HTML response (before any JS executes):

```html
<title>2003 Ferrari 360 Spider | Max Auto</title>
<meta name="description" content="2003 Ferrari 360 Spider for sale at Max Auto. View photos, specifications and vehicle details."/>
<link rel="canonical" href="http://127.0.0.1:3100/vehicles/07936ada-4478-5875-9ae4-757d51beab28?tenant=demo-max"/>
<h1>2003 Ferrari 360 Spider</h1>
```

The title/meta/canonical occur in the initial `<head>`, not only a Flight payload or a post-hydration DOM update. OG title, description, URL and the real R2 photograph are also present. A JavaScript-disabled Chromium context sees the same title and one h1. Test-host requests select `demo-max` without a tenant query; wrong-tenant, conflicting-selector and attacker-host requests return 404. No credentials or `<canvas>` appear in the raw HTML.

The browser decodes the real 1,744,276-byte R2 vehicle image. No GLB request occurs before clicking “Inspect 3D proof”. Clicking loads the existing 603,908-byte product GLB, including its `KHR_draco_mesh_compression` / `EXT_texture_webp` requirements, renders the model and the two imported example shaders in a WebGL canvas, and opens a chat-entry dialog carrying the vehicle title. Unmount removes the canvas. The verifier reports no hydration, shader or browser errors. Screenshot and full raw response are generated under the POC's ignored `artifacts/` directory; the README and verifier reproduce them without committing live response payloads.

### What was hard, and the implication

- Server content/metadata was straightforward with a request-memoized, server-only loader. Next's async headers/params APIs and metadata streaming behavior must be handled deliberately; `ssr:false` needs a client wrapper. This is a reusable boundary pattern, not a whole-page port.
- Browser HTTPS initially failed because Chromium did not trust the cloud proxy CA. Importing the **existing platform CA bundle** into its NSS store restored verified HTTPS. TLS/signature checks were never disabled. Node runtime requests need `NODE_USE_ENV_PROXY=1` in this environment. These are test-machine prerequisites, not product dependencies.
- Direct browser GLB loading failed because the asset response has no CORS allow-origin for localhost. A fixed same-origin POC proxy made the render proof possible; direct production-origin CORS remains unproved. The image can load as an ordinary cross-origin `<img>` without proving model fetch/texture CORS.
- The optimized GLB needs Draco; root `public/draco` has JS/wrapper files but lacks the WASM decoder referenced in its README. The POC generates matching decoders from its integrity-locked Three package. This is a real packaging issue to resolve for web, not a reason to edit the live app during investigation.
- The POC uses direct Three.js, not the full React-18/R3F-8 viewer and its animated dependencies. Both templates, the block registry, concierge transport and cinema remain unported. Their compatibility and visual tests explain most of the estimate; successful minimal SSR is not evidence they are mechanical moves.
- No production mobile performance baseline, GPU/device matrix, verified custom-domain cutover or Vercel deployment was performed. The stated performance budgets and ≤12 function gate remain future acceptance checks. Live DeepSeek balance previously blocked chat; the proof deliberately demonstrates only the chat entry context.

### Existing-app verification

All commands ran at repository root on the feature branch; no root app/config/lockfile changes were needed.

| Command | Result |
|---|---|
| `npm run check:migrations` | Passed: 92 sequential migration files; no migrations applied |
| `npm run typecheck:all` | Passed across root and all participating workspaces |
| `npm test -- --run` | **Failed**: 295 files passed / 2 failed; 2,327 tests passed / 2 timed out. Shared-memory credential-output harness and SFTP size-cap test |
| Targeted rerun of both failures with `--maxWorkers=1 --testTimeout=30000` | Shared-memory harness passed (8/8); SFTP passed 6/7 and still failed: expected 25 MiB size-limit rejection, received application 20-second timeout. Same SFTP failure was observed before this task during onboarding; no source/assertions were changed |
| `npm run build` | Passed; existing large-chunk/Sass warnings remain |
| `NODE_USE_ENV_PROXY=1 npm run build:admin` | Passed; existing middleware-convention warning remains |
| `git diff --check` | Passed |
| POC `npm run build`, `npm run typecheck`, `npm run verify` | Passed, including JS-off and live browser/media checks above |

The requested existing suite is therefore **not wholly green**; the PR must not claim otherwise. Additive-only changes and matching pre-task SFTP behavior support that the live app was not disturbed, but do not fix its existing test defect. Resolve or explicitly accept that known failure in a separate task before a migration release gate. No database writes, migrations or customer-domain actions occurred.

## Remaining risks and go/no-go

**Go** for the isolated web foundation and vehicle vertical slice once the proof evidence is reviewed. **No-go** for customer-domain cutover or whole-site migration from this PR.

The hard unknowns are production verified-domain trust/cache partitioning, R3F/drei React 19 compatibility with the *existing* viewer, all scene shaders and decoders, server page-builder parity for both templates, real concierge streaming/cookies through multi-zone routing, mobile GPU performance and actual deployed function accounting. Each has a phase owner and exit gate above. Read-only proof requests cannot establish form submission correctness, R2 write authorization or safe production mutations. The POC is deliberately narrow; it establishes a boundary pattern, not feature parity.
