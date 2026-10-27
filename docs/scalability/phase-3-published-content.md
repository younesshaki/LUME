# Phase 3 — published content and templates

This change implements only Phase 3 of the [approved migration plan](nextjs-migration-plan.md). It remains an isolated, noindex Next.js preview. No customer route, domain or traffic is transferred. Phase 4 navigation/visitor adapters and Phase 5 cinema/viewer work have not started.

**Dependency:** PR #96 is approved but was still open/draft when this branch was created. This branch starts from staging and merges that approved Phase 2 locally, as requested. Merge #96 first; review the Phase 3-only difference from `cff045f2479f4f8e6c741b3044af11356484ed6e`. Do not merge this PR to main or treat a successful preview as cutover approval.

## Implementation

`apps/web` renders `/` (and legacy `/home`), `/contact`, `/products`, `/products/[productId]`, and one-level published service/custom slugs. Vehicle routes and the three compatible public vehicle API transports retain their Phase 2 ownership. An unpublished services/custom slug returns HTTP 404; it is not invented from a template or redirected to an indexable home page.

The server loads the existing anonymous `tenant_by_slug`, `get_tenant_theme`, `list_published_nav_pages` and `get_published_page` contracts. Every page read carries the resolved tenant ID; the published RPC chooses `published_revision_id`. There are no direct draft/page-revision queries, browser database clients, migrations, remote tenant creation or remote page/template edits. Request-local React caching shares one document between metadata and content. Database fetches and HTML/Flight responses remain uncached across requests.

The original React renderers lived in root `src`, while `@lume/blocks` held the schema/descriptors. With the explicit shared-extraction approval, the reusable views and interactive leaves now live in `packages/blocks/src/react`; original Vite modules retain their contexts, transport/navigation/sound adapters and delegate to those same implementations. CSS, public artwork, product catalog JSON and shader ownership have not been physically migrated: Next references the existing public styles/data/assets. Vite config, root build scripts, API functions, admin source and deployment config are unchanged. The lockfile adds the web-only Tailwind PostCSS adapter at the existing Tailwind version; existing dependency versions/integrities are preserved.

`ServerBlocks` uses the existing schema, descriptors, mode visibility and appearance resolver; all 34 standard-mode descriptor IDs have explicit adapters. Pure text, headings, product/showcase cards, business sections, galleries and vehicle cards render as server views. Stateful product filters, forms, consent, quick search, announcement and FAQ leaves hydrate separately. Product cards and vehicle links use native URLs; no-JavaScript readers receive content and links without a canvas, chat runtime, entry animation or client SEO effect. FAQ uses native details in this preview, and numeric trust values are visible in initial HTML. Cinematic navigation, visitor save/compare services and the full cinematic block experience remain later-phase work.

The import checker follows runtime imports **through** the shared packages. Server loaders cannot reach client components; client graphs cannot reach server/config, Node APIs, environment access, admin modules or `server-only`. The only root references permitted are explicitly public stylesheet/artwork/font/catalog assets. Client database/service credentials are not introduced.

## Published states and SEO

| Case | Behavior |
|---|---|
| Valid published document | Existing shared views, public revision marker, one visible page h1 |
| Missing reserved home/contact/products | Built-in shared default document; Glo3D home uses the extracted original template fallback |
| Empty reserved document | Explicit `empty` state with the same built-in fallback policy; no draft substituted |
| Empty custom/services publication | Published title/h1 and an explicit empty message; no draft/default tenant content |
| Missing custom/services publication | HTTP 404 |
| Invalid document or upstream failure | Sanitized HTTP 500; client error boundary offers retry; failure is not silently called “published” or “missing” |
| Draft/revision/token selector | HTTP 404; never selects another revision |

Normal rendered routes emit title, description, canonical, Open Graph and noindex in raw HTML, with exactly one h1. The server uses the existing pure SEO resolver; Next alone owns metadata. Canonicals derive from the verified tenant/host and omit theme/template/draft/tracking selectors. `/home` keeps the canonical `/`. Product detail lookup respects the published catalog grid's categories and preserves the original static product view; product 3D/cinema stays deferred.

Two existing-contract limits remain explicit. The RPC returns page-level SEO alongside the published revision; the database does not version SEO with each block revision. This change preserves that contract rather than claiming draft SEO is versioned. Also Next's 500 boundary needs JavaScript for its complete retry UI; the captured failed raw response has an error title/status and no published content, while successful content documents are fully readable without JavaScript. A streaming Suspense fallback was rejected during verification because it added another h1 to valid raw documents.

## Preview bindings

Only `WEB_PREVIEW_*` application settings enter the web process. The existing launcher rejects dotenv files, generic production bindings and a production deployment. Staging is project `hapyyupeugxccofpibor`; the production project is a deny comparator, never a selected data source. No database service key, R2 credential, notification credential or provider secret is needed in the web preview.

New bindings are `WEB_PREVIEW_UPSTREAM_ORIGIN` (server-only, fixed staging leads/consent origin) and optional `WEB_PREVIEW_TURNSTILE_SITE_KEY` (publishable value passed explicitly to the form island). The captcha secret stays with the existing API. `WEB_PREVIEW_R2_PUBLIC_BASE_URL` provides public media URLs. The complete mapping of current Vite settings is below; the audit checks it against source, not a stale variable count.

| Vite setting | Next semantic equivalent | Preview disposition |
|---|---|---|
| `VITE_ACCESS_PASSWORD` | Retire as security control | No password gate or browser secret in Phase 1 |
| `VITE_ADMIN_API_HOST` | LUME_ADMIN_API_ORIGIN | WEB_PREVIEW_UPSTREAM_ORIGIN, server-only fixed staging leads/consent upstream |
| `VITE_ENABLE_GOOEY_NAV` | NEXT_PUBLIC_ENABLE_GOOEY_NAV | Deferred client visual feature |
| `VITE_ENABLE_LOCAL_CHAT` | NEXT_PUBLIC_ENABLE_LOCAL_CHAT | Deferred; chat disabled |
| `VITE_LUME_TENANT` | LUME_DEFAULT_TENANT | WEB_PREVIEW_DEFAULT_TENANT; approved preview hosts only |
| `VITE_OLLAMA_CHAT_URL` | NEXT_PUBLIC_OLLAMA_CHAT_URL | Deferred fixed same-origin route, not arbitrary upstream |
| `VITE_OLLAMA_EMBED_MODEL` | OLLAMA_EMBED_MODEL | Server-only; declaration-only legacy surface |
| `VITE_OLLAMA_HOST` | OLLAMA_HOST | Server-only; absent in Phase 1 |
| `VITE_OLLAMA_MODEL` | OLLAMA_MODEL | Server-only; absent in Phase 1 |
| `VITE_PAGE_RENDERER` | LUME_PAGE_RENDERER_ENABLED | Published-only server registry enabled for Phase 3 routes; no client feature flag |
| `VITE_POSTHOG_ENABLED` | NEXT_PUBLIC_POSTHOG_ENABLED | Deferred; no analytics in preview |
| `VITE_POSTHOG_HOST` | NEXT_PUBLIC_POSTHOG_HOST | Deferred public ingest host |
| `VITE_POSTHOG_PROJECT_TOKEN` | NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN | Publishable project token only; deferred, never personal API key |
| `VITE_POSTHOG_SESSION_REPLAY` | NEXT_PUBLIC_POSTHOG_SESSION_REPLAY | Deferred consent-controlled flag |
| `VITE_PREVIEW_TOKEN` | Retire public token; server-only draft-mode capability if drafts added | Absent; draft/revision/public preview-token selectors rejected |
| `VITE_R2_PUBLIC_BASE_URL` | R2_PUBLIC_BASE_URL / NEXT_PUBLIC_R2_PUBLIC_BASE_URL | WEB_PREVIEW_R2_PUBLIC_BASE_URL, server media URLs passed to public views; no R2 credentials |
| `VITE_SUBDOMAIN_TENANT_ROUTING_ENABLED` | SUBDOMAIN_TENANT_ROUTING_ENABLED + LUME_ROOT_DOMAIN | WEB_PREVIEW_ROOT_DOMAIN explicitly enables the staging root |
| `VITE_SUPABASE_ANON_KEY` | SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY | Phase 1 uses WEB_PREVIEW_SUPABASE_ANON_KEY server-only |
| `VITE_SUPABASE_STORAGE_URL` | NEXT_PUBLIC_SUPABASE_STORAGE_URL | Deferred public fallback URL |
| `VITE_SUPABASE_URL` | SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL | Phase 1 uses WEB_PREVIEW_SUPABASE_URL only; no browser database client |
| `VITE_TURNSTILE_SITE_KEY` | NEXT_PUBLIC_TURNSTILE_SITE_KEY | WEB_PREVIEW_TURNSTILE_SITE_KEY passed explicitly to form islands; secret remains on existing API |
| `VITE_USE_BACKEND` | NEXT_PUBLIC_USE_BACKEND | Deferred parity flag; Phase 1 identity is always server-side |
| `VITE_VERCEL_GIT_COMMIT_SHA` | VERCEL_GIT_COMMIT_SHA | Server build identifier; serialize only when needed |

## Forms and consent

The shared form implementations retain validation, success/error UI and Turnstile behavior. The Next transport adds the same first-touch attribution helper and sends the existing lead body, tenant header, credentials and signed `lume_visitor_session` cookie. Only that visitor cookie is forwarded; admin/auth cookies and upstream Set-Cookie are excluded, as in the original public proxy. Consent preserves the version-1 storage format, legacy stored choices, reject/accept and reopening preferences; reporting forwards choice/version without a visitor cookie, user agent or referrer.

The server proxy preserves the real Origin and upstream validation/rate/quota responses. It rejects missing/cross-origin mutations, conflicting/unknown tenants and oversized bodies. It does not substitute an allowed localhost Origin or silently use a privileged key.

**Hosted origin gate:** the initial web deployment returned concrete 403 `Forbidden origin` responses from the existing staging API for both leads and consent. This is an upstream allowlist configuration dependency, not a successful submission. A staging-only allowlist/redeploy scope decision has been requested because the user explicitly required live admin to remain untouched. Until that decision and a successful retest are recorded, hosted form/ledger submission is **not proven**. Production settings/deployments must not change to resolve this.

## Evidence and honest data limits

Staging has one active tenant, `demo`. Home, contact and products have real published revisions; services and a custom page are absent. Staging publishes Luxury, not a second real Glo3D tenant. No tenant or publication was fabricated in Supabase.

The visual harness uses the captured **public** staging snapshot for home/contact/products and the original pre-extraction Vite checkout at `cff045f`. Both templates × both modes are presentation overrides applied to that same public document. Services/`our-story` are explicitly labelled local published-RPC contract fixtures using the existing demo identity. The new Vite adapters are also compared against the old checkout. These fixtures prove renderer coverage; they do not prove a nonexistent real staging service/custom publication.

Screenshots cover the published main content. Global header/footer, mode controls, dock and visitor navigation remain Phase 4 and are excluded. The harness samples text/styles/geometry before flattening scrolling ancestors solely to capture the whole main area; it preserves the viewport backdrop. Public R2 bytes are fetched once and reused in visual captures; separate unmocked media/browser evidence proves the actual origin. Screenshots are review artifacts, not a claim of pixel equality on every GPU/device or every possible block configuration.

- [Local HTML/Flight/state evidence](evidence/phase-3/content-report.json): 20 template/mode/route raw documents, fallback/empty and error cases, forged selectors and 24 concurrent published/unknown-tenant requests.
- [Visual matrix](evidence/phase-3/visual-parity.md): reference and preview screenshots per template/mode/route, including the Vite extraction comparison.
- [Verification output](evidence/phase-3/verification.txt): existing-app checks, contract checks and targeted reruns.
- Hosted raw HTML, media, environment, function and unchanged-deployment evidence will be linked here once final capture completes.

The existing foundation checks separately simulate two active tenants, alternate HTML/Flight and run concurrency checks; the vehicle checks also cover another active tenant requesting a foreign UUID. Those are deterministic local fixtures, not a claim that staging has a second real tenant. Hosted unknown/forged-host requests and the accepted Vercel forwarded-host normalization behavior are recorded separately.

## Function budget and rollout limits

The first actual Phase 3 web deployment (`dpl_7g7ioDe4qahfdbvSpfcrGWozUJ2s`) reported six lambda output entries and five distinct function identifiers: conservative headroom is 6/12. This is a platform manifest measurement, not a count of source files or an assumption that every slug creates a function. Final deployment and live public project counts are recorded with the evidence. No root API helper/function is added by this phase.

No-go for production cutover. Remaining work includes the approved Phase 4 navigation/visitor adapters, preserving cinematic destinations through their current owner, the later actual viewer/cinematic port, API origin configuration for each approved preview/future front door, proper versioned SEO semantics, a real service/custom publication validation when staging has one, broad block/device coverage and later asset/performance budgets. R2 model CORS remains the Phase 2/5 rollout gate; an ordinary image loading does not prove GLB/texture CORS. The known SFTP test defect remains outside this PR.
