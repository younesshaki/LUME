# Phase 1 hosted exit gates — verified 2026-10-27

Scope: close the hosted checks for PR #95 only. No Phase 2 routes or features, customer domains, traffic cutover, schema changes or seed data are introduced. No application code needed changing for deployment.

## Deployment and acceptance

- Separate project: `lume-web-preview` (`prj_OAtJghgaCiSDMqapWbATWOb51CQf`), root `apps/web`, Next.js, Node 24, monorepo source inclusion.
- READY deployment: `dpl_BKy6dB7Mv1dAKhqsMXkAfxztE9AQ`.
- [Read-only Preview](https://lume-web-preview-lsots60e4-hakicsi89-5044s-projects.vercel.app/preview?tenant=demo).
- Deployed application commit: `8fca3da10821c2fb70dcef7ef257ca9ceba584fb`; this follow-up changes evidence/docs only, not that application code.
- Vercel's API calls the explicit non-production target `staging`; its environment variables are **Preview** scoped. This is not a Production deployment. There is no Git integration link or customer-domain assignment for the new project. Preview authentication was disabled on this isolated read-only project so the recorded anonymous curl requests can be reproduced.
- A first request with omitted target was classified as Production by Vercel's new-project behavior. The existing production ignore guard canceled it (`dpl_HaZqUBFcBJcFaHW2SomZDXAfhoBH`); it never served the foundation. The successful request explicitly used API target `staging`. No guard was weakened and neither live project's deployment was changed.

All hosted exit gates are **PROVEN under the task's single-tenant criterion**, including the explicitly accepted provider-normalization behavior below. PR #95 remains draft and stops for review; this does not authorize Phase 2.

## 1. Isolation and spoofing evidence

Staging provides only the active tenant `demo` / `LUME Demo`, ID `2de52a45-bc2b-451c-994c-02208b994e26`. A read-only staging vehicle count returned `Content-Range: 0-0/1173`. No second staging tenant was fabricated or seeded, and two-real-tenant alternation is **not claimed**.

The existing deterministic production-build test still simulates two active tenants and proves:

```text
HTML alpha: HTTP 200; Foundation Alpha Motors; other tenant absent; identity lookups=1
HTML beta: HTTP 200; Foundation Beta Autos; other tenant absent; identity lookups=1
Flight alpha: HTTP 200; Foundation Alpha Motors; other tenant absent; identity lookups=1
Flight beta: HTTP 200; Foundation Beta Autos; other tenant absent; identity lookups=1
PASS alternating HTML and React Flight alpha → beta → alpha → beta; 20 concurrent requests remain isolated
PASS verified custom-domain contract; 12 forged/unknown selector cases return 404; noindex robots and responses
```

The [complete captured output](evidence/phase-1-hosted/deterministic-isolation.txt) includes the repeated alternating requests. These are synthetic local contract rows, not staging records. Against the hosted preview, a separate real-data sequence returned `demo 200 → unknown 404 → demo 200 → unknown 404 → demo 200`; every unknown response excluded `LUME Demo` ([sequence](evidence/phase-1-hosted/hosted-sequence.json)).

### Raw curl/HTML from the deployed preview

```sh
curl -sS -D - 'https://lume-web-preview-lsots60e4-hakicsi89-5044s-projects.vercel.app/preview?tenant=demo'
```

```http
HTTP/2 200
cache-control: private, no-cache, no-store, max-age=0, must-revalidate
content-type: text/html; charset=utf-8
x-robots-tag: noindex, nofollow, noarchive
x-vercel-cache: MISS
```

```html
<title>LUME Demo | LUME foundation preview</title>
<meta name="description" content="Read-only tenant preview for LUME Demo."/>
<meta name="robots" content="noindex, nofollow, nocache"/>
<link rel="canonical" href="https://lume-web-preview-lsots60e4-hakicsi89-5044s-projects.vercel.app/preview?tenant=demo"/>
<h1>LUME Demo</h1>
```

These tags are in the server response, without executing JavaScript. The committed [full HTML](evidence/phase-1-hosted/demo.html), [headers](evidence/phase-1-hosted/demo.headers.txt), [raw Flight response](evidence/phase-1-hosted/demo.flight.txt) and [Flight headers](evidence/phase-1-hosted/demo-flight.headers.txt) are actual curl captures. Header line endings/trailing whitespace and the robots file's trailing blank line were normalized for Git; status codes and header values are unchanged. HTML/Flight payloads are captured verbatim, not replaced by assertions.

```sh
curl -sS -D - -H 'RSC: 1' 'https://lume-web-preview-lsots60e4-hakicsi89-5044s-projects.vercel.app/preview?tenant=demo'
```

This returned HTTP 200 / `text/x-component`, noindex and private/no-store, with only the demo identity.

### Deployed negative requests

Use the same preview URL with the following query/header changes:

| Request | Actual result | Evidence |
|---|---|---|
| `?tenant=unknown-phase1-gate` | Application 404, no demo content, noindex | [headers](evidence/phase-1-hosted/unknown-tenant.headers.txt), [HTML](evidence/phase-1-hosted/unknown-tenant.html) |
| `-H 'Host: phase1-unknown-exitgate.vercel.app'` | Vercel edge 404 `DEPLOYMENT_NOT_FOUND`, before tenant code | [headers](evidence/phase-1-hosted/unknown-host.headers.txt), [body](evidence/phase-1-hosted/unknown-host.txt) |
| `-H 'x-lume-tenant: other'` with demo query | Application 404, `Preview not found`, no tenant data | [headers](evidence/phase-1-hosted/internal-selector.headers.txt), [body](evidence/phase-1-hosted/internal-selector.txt) |
| `?tenant=demo&tenant=other` | Application 404 | [headers](evidence/phase-1-hosted/duplicate-selector.headers.txt) |
| `-X POST` | 405, read-only preview | [headers](evidence/phase-1-hosted/post-rejected.headers.txt) |
| `GET /robots.txt` | `User-Agent: *`, `Disallow: /` | [body](evidence/phase-1-hosted/robots.txt) |

The unknown-host response is a **Vercel routing rejection**, not claimed as an app-produced 404. Its platform response does not carry the app's noindex header; no application/tenant document is served. An initial `.invalid` Host test was blocked by the cloud egress proxy before reaching Vercel, so it was not used as hosted proof. The recorded `.vercel.app` test reaches Vercel and includes `x-vercel-error: DEPLOYMENT_NOT_FOUND`.

### Forwarded-host normalization — accepted result, not a fabricated 404

```sh
curl -sS -D - -H 'x-forwarded-host: phase1-forged.invalid' \
  'https://lume-web-preview-lsots60e4-hakicsi89-5044s-projects.vercel.app/preview?tenant=demo'
```

Vercel documents that [x-forwarded-host is identical to Host](https://vercel.com/docs/headers/request-headers#x-forwarded-host). It replaces the attacker-supplied value before the application receives it. The actual result is **HTTP 200 with the legitimate demo tenant/canonical**, not an application mismatch 404. The raw [headers](evidence/phase-1-hosted/forwarded-host.headers.txt) and [HTML](evidence/phase-1-hosted/forwarded-host.html) are retained.

The normal and injected-header HTML have the same SHA-256:

```text
6d7bdedeff591e16e7de59ec7fda3880d36d47a73e08f955a55b0137ab02a2c4
```

The injected hostname occurs in neither response. This platform normalization was explicitly accepted as hosted anti-spoofing evidence for the gate. The app's direct mismatch-to-404 behavior is separately exercised by the deterministic local test. We do not claim that a mismatch survives Vercel and is then rejected by the app.

## 2. Staging-only application bindings

The new project's environment API was audited, with decrypted values compared **in memory** and only non-secret ref/hostname and match booleans saved. [Environment audit](evidence/phase-1-hosted/environment-audit.json):

```json
{
  "stagingProjectRef": "hapyyupeugxccofpibor",
  "usesProductionProject": false,
  "applicationBindings": [
    "WEB_PREVIEW_DEFAULT_TENANT",
    "WEB_PREVIEW_PROJECT_REF",
    "WEB_PREVIEW_SUPABASE_ANON_KEY",
    "WEB_PREVIEW_SUPABASE_URL"
  ],
  "productionTargetsForAppBindings": 0,
  "forbiddenDeploymentBindingNames": []
}
```

The URL is `https://hapyyupeugxccofpibor.supabase.co`, and all three supplied staging bindings exactly match the configured secure values. The anon key value is **not** included in evidence. Every application binding targets only `preview`; none targets `production`. The deployment inventory has no generic Supabase, provider, R2, Git or Vercel API-token application bindings. Vercel injects its own platform/observability metadata; those are not copied production application credentials.

The production ref appears only in the guard/audit as a deny-list comparator, never as a configured destination. Neither raw HTML nor Flight contains either an application key or the production ref. Successful hosted lookup of the staging-only demo identity plus the actual deployment/project configuration proves the running preview uses staging; local environment assertions alone are not substituted for this check. No diagnostic route exposing runtime secrets was added.

## 3. Actual deployed functions and Hobby headroom

The team API confirms the plan is `hobby`. Counts below come from the READY deployment API's **actual `lambdas[].output` manifest**, not TypeScript source-file counts or estimates. [Captured manifests](evidence/phase-1-hosted/function-manifests.json) include IDs, output records, distinct function names and arithmetic. The `/files` API was unavailable for this deployment, so it is not cited as evidence.

| Project / deployment | Manifest output records | Distinct deployed function identities | Headroom against 12 |
|---|---:|---:|---:|
| Isolated `lume-web-preview` / `dpl_BKy6dB7Mv1dAKhqsMXkAfxztE9AQ` | 5 | **4** | **8** |
| Existing live Vite `lume` / `dpl_2ZqooHgcvQEX6iox7UbFjW8b2XHo` | 10 | **10** | **2** |

One preview function identity appears twice in the route output records; deduplicating identical `functionName` values gives four actual identities. The live project has ten distinct names. These are separate project budgets and are not added together. For a maximally conservative entry-count view, the preview's five records are also below twelve (seven remaining), so neither interpretation approaches the limit. The former two-unit preview estimate is superseded by this measured manifest.

No public API was migrated or helper file removed to affect the count. The live site's function manifest was read, never rebuilt/redeployed by this task.

## Live site and data stayed untouched

[Before/after snapshots](evidence/phase-1-hosted/live-projects-unchanged.json) are identical for the existing `lume` and `lume-admin` project IDs, roots, frameworks, build/install settings, production deployment IDs/URLs and digests/counts of environment binding names/targets (never values). All Vercel mutations were scoped to the new `lume-web-preview` project. No production aliases, customer domains, DNS or traffic rules were changed.

The existing production deployment pointers remain:

```text
lume       dpl_2ZqooHgcvQEX6iox7UbFjW8b2XHo
lume-admin dpl_7nWpz7u7FpWnZbWD1SNQMC6EvyPa
```

This follow-up contains documentation/evidence only, leaving the Phase 1 application code and live Vite app/build/deploy configuration unchanged. The POC stays reference material. No database migration, seed, second tenant, lead, chat request or upload was created.

## Re-run checks

| Check | Result |
|---|---|
| `npm run typecheck:all` | Passed |
| `npm test -- --run` | **Failed:** 295 files passed / 2 failed; 2,327 tests passed / 2 timeouts (SFTP and credential-output harness) |
| Targeted rerun with one worker and 30-second test timeout | Harness passed 8/8; SFTP passed 6/7 and retained the known application-timeout vs size-limit failure |
| `npm run build` | Passed |
| `NODE_USE_ENV_PROXY=1 npm run build:admin` | Passed |
| `npm run check:migrations` | Passed: 92 sequential files; no migrations applied |
| `git diff --check` | Passed |
| `npm run build:web` / `npm run typecheck:web` | Passed |
| Foundation suite | Passed: 7 tests, 0 failures |
| Production-build deterministic contamination verifier | Passed: eight alternating HTML/Flight requests, 20 concurrent requests, 12 negative cases |
| Vercel Preview build | READY; serverless output created successfully |

The known existing test failures are reported, not hidden or repaired through unrelated changes. Closing these hosted exit gates does not claim the existing full test suite is green, approve merging PR #95, or authorize Phase 2. Stop for review.
