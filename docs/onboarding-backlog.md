# Tenant Onboarding Backlog

_Produced 2026-07-04 by actually provisioning a second tenant (`demo`) on prod
and recording every manual step and gap. This list is the distance between
"we have multi-tenant tables" and "a customer can sign up"._

_Update 2026-07-05: items 3 (partially), 4, 6 (partially) and 7 (persona row)
are addressed by `scripts/create-tenant.ts` — see the runbook below. Items
1, 2 (import UX), 5, 8, 9 remain open._

## The onboarding runbook (current)

```bash
# One command: tenant + owner membership + default bot persona + pages.
# Env is auto-assembled from apps/admin/.env.local (+ root .env.local for R2).
# Blank tenant by default; --with-sample-data loads LUME's demo CSV + chunks.
npm run create:tenant -- --slug acme --name "Acme Motors" \
  --owner-email owner@acme.com [--with-sample-data] [--force-pages]
```

<details>
<summary>Original manual runbook (superseded, kept for the record)</summary>

```bash
set -a; source apps/admin/.env.local; source .env.local; set +a
export R2_PUBLIC_BASE_URL="$VITE_R2_PUBLIC_BASE_URL"
export SEED_OWNER_EMAIL=<owner email>  SEED_TENANT_SLUG=demo  SEED_TENANT_NAME="LUME Demo"
npx tsx scripts/seed-default-tenant.ts
SEED_TENANT_SLUG=demo npx tsx scripts/seed-default-pages.ts
```

</details>

Result: tenant `efab59f0-c566-42dc-96d9-d40a6ad2a2f3`, owner membership,
1000 vehicles, 19 rag chunks, 5 published pages.

## What was verified (multi-tenancy holds)

- `tenant_by_slug('demo')` resolves as anon; status gating works.
- Anon RLS vehicle read returns exactly the demo tenant's 1000 rows.
- `get_published_page(demo, 'home')` returns the seeded revision as anon.
- Prod public `/api/vehicles` with `X-Lume-Tenant: demo` returns demo-scoped
  data (header-based tenant routing works on the deployed functions).
- `default` tenant untouched: still 1009 vehicles / 6 pages / 2 members.

## The backlog (ranked by how hard it blocks a real customer)

1. **A second tenant has no website.** _Partially addressed 2026-07-05:_ the
   public site now resolves its tenant at runtime — subdomain first (ready
   for `{tenant}.lume.app`), then a persisted `?tenant=<slug>` override, then
   the build default. Every tenant is viewable today via the admin's
   per-tenant "View website" link (`?tenant=slug&preview=lume`). Still open:
   real subdomain/custom-domain routing as the *canonical* public URL
   (needs the apps/web move + wildcard domain).
2. **No blank-tenant mode.** ~~The seed loads LUME's own demo CSV and
   embeddings into every tenant.~~ _Addressed 2026-07-05:_ `create:tenant`
   provisions blank by default, and the admin now has a CSV inventory import
   (`/admin/[tenant]/vehicles/import` — preview + per-line validation +
   batched insert; since 2026-07-06 also add-vs-replace modes and duplicate
   detection with per-row decisions). Remaining: knowledge-doc upload →
   embeddings (item 8).
3. **Owner must already exist in Supabase auth.** _Addressed 2026-07-05:_
   `/signup` creates the account and `/admin/onboarding` auto-provisions the
   tenant (name → unique slug → owner membership → persona → pages) via
   `provisionTenant()` in `@lume/db`. Invite redemption at `/invite/[token]`.
   _2026-07-06:_ invite links for brand-new users now route through
   `/signup?invite=<token>` (no site-name step, no auto-provisioning) and
   return to the invite after account creation. Item fully closed.
4. **Provisioning is two scripts + hand-assembled env.** Needs a single
   `create-tenant` entrypoint (script now; admin/API surface later) that does
   tenant → membership → pages → (optional) sample data, idempotently.
   Includes consolidating seed env into one documented place.
5. **No admin URL a customer could use.** The deployed Next admin sits behind
   Vercel SSO deployment protection, and `lume-admin.vercel.app` is NOT this
   repo's app (global-subdomain collision with an old prototype project).
   Customers need a stable, publicly reachable admin origin (`app.lume.app`
   per vision) with the app's own Supabase auth as the gate.
6. **No initial theme/branding step.** New tenants get an empty `theme`.
   Provisioning should either copy a starter theme or drop the owner into
   the branding editor as a first-run step.
7. **No bot persona row.** `bot_personas` stays empty for a new tenant; chat
   doesn't read personas yet either. Provisioning should insert the default
   persona; chat should honor it (natural follow-up to SCRUM-144).
8. **Embeddings are copied, not generated.** RAG chunks come from a static
   `embeddings.json`. Customer documents need a hosted embedder path
   (the `Embedder` interface is pluggable — this is wiring + provider choice).
9. **No lifecycle management.** No trial→active→suspended transitions, no
   billing hook, no off-boarding/delete-tenant path (cascades exist on the
   FK level; nothing operational).

## Cleanup note

The `demo` tenant is real data on prod. It's harmless (only reachable by
explicit slug) and useful for testing; delete with
`delete from tenants where slug = 'demo'` (cascades) if unwanted.
