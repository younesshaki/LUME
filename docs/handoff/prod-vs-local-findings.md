# Prod-vs-Local Findings & Fixes (handoff for review)

_Compiled 2026-07-16. Context: a run of "works in production, broken locally"
(and one inverse) bugs on LUME. Production = the deployed apps; local = Vite
public site on :5173 proxying `/api/*` to the Next.js admin, both hitting the
same shared Supabase (`atsgdjwjtmqvtotbrowu`). Please sanity-check the root
causes and fixes below._

---

## TL;DR

Four distinct issues, three of them the same shape ("prod works, local
doesn't") and one the inverse ("local feature, prod DB missing the schema"):

| # | Symptom | Root cause | Fix | Commit / action |
|---|---------|-----------|-----|-----------------|
| 1 | Public inventory empty locally for non-default tenants (e.g. `demo`), fine in prod | Browsers omit `Origin` on same-origin GETs; admin `isAllowedOrigin` rejected originless requests (403) | Allow absent Origin in admin; inject dev Origin in Vite proxy | `cd8f292` |
| 2 | VDP shows placeholder locally despite uploaded images; list thumbnail fine; prod fine | Anon RLS policy on `vehicle_images` joins `tenants`, which anon can't read → 0 rows | Read gallery with service-role client (mirror prod) | `c81593a` |
| 3 | Saved vehicles don't appear in admin (hearts filled on site) | Migrations 062/063 never applied to prod Supabase → `visitor_saved_vehicles` / `conversion_events` tables missing | Applied 062 + 063 to prod | DB migration (2026-07-16) |
| 0 | (Infra) Reverted feature still visible in prod | Vercel free-tier 100-deploys/day quota exhausted, blocking deploy of `main` | Wait for reset / upgrade; built local prod-mirror worktree | n/a |

Fixes #1 and #2 are code, on `main`, **not yet deployed** (blocked by #0's
quota). Fix #3 is a live DB change, already applied.

---

## The "prod works, local doesn't" family — the general mechanism

Two independent API surfaces exist and have **drifted**:

- **Production public API**: standalone Vercel serverless functions at the repo
  root, `api/*.ts` (e.g. `api/vehicles.ts`, `api/vehicles/[id].ts`). Must be
  self-contained — they can't import `@lume/*` (raw-TS build constraint).
- **Local dev API**: the Next.js admin route handlers
  (`apps/admin/app/api/**`). Locally the Vite proxy sends `/api/*` here.

Because production browsers hit the root functions and local browsers hit the
admin handlers, any divergence in origin-checking, RLS client choice, or
fallbacks shows up as "prod works, local doesn't" (or vice-versa). The two
implementations should be kept behaviourally identical; #1 and #2 are both
cases where the admin handler was stricter/wronger than the root function.

---

## Issue 1 — Empty inventory locally (origin check on same-origin GET)

**Symptom.** `/vehicles` rendered fine in prod but showed an empty inventory
locally for non-default tenants (`demo`). `default` looked fine locally, which
masked it. `curl /api/vehicles?tenant=demo` **with** an `Origin` header returned
1172 rows.

**Root cause.** Browsers **omit the `Origin` header on same-origin GETs.** The
public inventory fetch (`src/experience/vehicles/catalog.ts`, same-origin
`/api/vehicles` behind the Vite proxy) therefore arrives with no Origin. The two
origin checks disagreed:

- `apps/admin/lib/origin.ts` `isAllowedOrigin` used `if (!origin) return false;`
  → **403** for the local proxied fetch.
- Root `api/vehicles.ts` uses `!origin || allowed.includes(origin)` → allows
  originless requests → production worked.

**Why the empty page instead of an error.** `catalog.ts` has an **asymmetric
fallback**: on API failure the `default` tenant falls back to a bundled R2 CSV
catalog (looks populated), but every non-default tenant falls back to `[]`.
Hence "default works, demo empty, only locally" is this bug's fingerprint. Only
bites when `apps/admin/.env.local` actually sets `ALLOWED_CHAT_ORIGINS`
(otherwise the dev "allow-all when empty" path hides it).

**Fix (`cd8f292`).**
- `apps/admin/lib/origin.ts`: `return !origin || allowed.includes(origin);`
  — an absent Origin is not a cross-site request (a cross-site attacker's
  browser always sends one), so CSRF posture is unchanged. Now matches the root
  function.
- `apps/admin/lib/origin.test.ts`: split the missing/unlisted test; added
  "allows same-origin requests that omit the Origin header." 6 tests pass.
- `vite.config.ts`: belt-and-suspenders — the `/api` proxy injects
  `origin: http://localhost:5173` when the browser sent none (skipped in
  subdomain-routing mode, where the real Host/Origin must pass through).

**Question for review.** Is allowing absent-Origin acceptable for all admin
routes that share `isAllowedOrigin`, or should it be scoped to GET/public
reads only? (Our reasoning: cross-site attackers can't suppress Origin, so
absence ⇒ same-origin/non-browser ⇒ safe. Confirm.)

---

## Issue 2 — VDP placeholder despite uploaded images (anon RLS on vehicle_images)

**Symptom.** A vehicle's detail page (VDP) showed the placeholder even though it
had uploaded images; the **list** endpoint showed the primary image fine. DB was
correct (rows in `vehicle_images` with valid `r2_key`, `is_primary`, tenant).
Prod fine.

**Root cause.** The anon RLS policy `vehicle_images_select_public_live` gates on
a JOIN to `tenants` with `t.status='active'`, but **anon has no read access to
`tenants`** (status is only exposed via the SECURITY DEFINER `tenant_by_slug`
RPC / `tenant_is_active(uuid)` helper, migration 017). So the policy's `EXISTS`
is always false for anon → anon SELECT on `vehicle_images` returns 0 rows.
Confirmed with `set local role anon`.

**Why only the VDP broke.**
- LIST route reads the primary image via a denormalized `primary_image_r2_key`
  (RPC/view, bypasses this RLS) → fine.
- DETAIL route (`apps/admin/app/api/vehicles/[id]/route.ts`) did a **direct anon**
  `.from("vehicle_images")` select → empty gallery → client falls back to
  placeholder.
- Prod was fine: root `api/vehicles/[id].ts` reads image metadata with the
  **service-role** client (`imageClient = serviceRoleKey ? service : anon`).

**Fix (`c81593a`).** Admin detail route reads the gallery with
`createServiceClient()` from `@lume/db/server`, mirroring the root function,
keeping `.eq("tenant_id")/.eq("vehicle_id")` for defense in depth. Verified: the
demo Urus returns 2 images.

**Known remaining wart / question for review.** The `vehicle_images` anon policy
is still technically broken (unreadable by anon) but no longer exercised, since
both routes now use service-role for image metadata by design. Should we instead
**fix the policy** to use `tenant_is_active(tenant_id)` (like the `vehicles`
anon policies) so anon reads work directly, rather than routing every image read
through service-role? Trade-off: policy fix restores true public RLS reads;
service-role keeps a single code path matching prod but concentrates trust in
the route handler.

---

## Issue 3 — Saved vehicles not reflecting in admin (migration lag — the inverse case)

**Symptom.** A logged-in visitor saved 5 vehicles on the public site (hearts
filled), but the admin customer detail showed "No saved vehicles."

**Root cause (inverse of #1/#2).** Here the **feature code is local-only** (merged
to `main`, running locally) but its **DB migrations were never applied to the
shared Supabase**. Missing objects:
- `public.visitor_saved_vehicles` (migration **062**; also creates
  `vehicles_tenant_id_id_unique_idx`)
- `public.conversion_events` + `tenant_conversion_funnel()` (migration **063**)

So POST `/api/visitor/saved-vehicles` tried to insert into a non-existent table
and failed server-side; the filled heart was **client-side optimistic state
only**. The admin GET read an empty set. Prod didn't show it because prod is
still on an old deploy **without** this feature.

Prereqs were fine: 045 supplies `visitors_tenant_id_id_unique_idx`, 061 supplies
`tenant_inventory_versions`, and 062 creates its own `vehicles` composite unique.

**Fix (applied to prod 2026-07-16).** Applied 062 then 063 verbatim via Supabase
`apply_migration` (both `create ... if not exists`, additive, safe on the live
old deploy). Verified tables/policies/`vehicles_tenant_id_id_unique_idx`/funnel
fn exist; security advisors flagged nothing new. Confirmed the save route
(`apps/admin/app/api/visitor/saved-vehicles/route.ts`) writes
`event_name: "vehicle_saved"` (allowed by the CHECK constraint) and treats the
conversion-event insert as non-fatal. Verified rest of batch already applied:
059 (`vehicle_images.ai_description`), 060 (`vehicle_facets(...)`), 061.

**Caveat.** The visitor's earlier 5 saves were **lost** (never persisted). They
must re-save for the records to appear.

**Question for review.** How did 062/063 get skipped while 059/060/061 applied?
Is there a migration-ordering/CI gap where feature merges to `main` don't
guarantee prod schema is migrated? Recommend a check that fails the deploy if
repo migrations aren't all present in `supabase_migrations.schema_migrations`.

---

## Issue 0 — Reverted feature still visible in production (deploy quota)

Not a code bug: after reverting a theme/appearance feature on `main`, production
still showed it. Cause: **Vercel free-tier 100-deployments/day quota was
exhausted** ("Resource is limited... api-deployments-free-per-day"), so the
`main` revert never deployed. Prod stayed pinned to the pre-revert build.

Consequence for #1 and #2: their code fixes are on `main` but **not yet in the
production admin app** until the quota resets (~24h) or the plan is upgraded and
`main` redeploys.

Interim: built a git worktree at `~/Documents/LUME-main` on `main`, running a
real production build (`next build` + `next start`) on :3100, with
`refresh-prod-mirror.sh` / `serve-prod-mirror.sh` helpers, to test a stable
prod-like local target independent of the dev servers.

---

## Net state

- **Code (`main`, awaiting deploy):** origin fix `cd8f292`, gallery fix
  `c81593a`.
- **DB (prod, applied):** migrations 062 + 063.
- **Action still needed:** redeploy `main` once Vercel quota resets/upgrades so
  #1 and #2 reach the production admin; visitor to re-save vehicles for #3.

## Cross-cutting themes to critique

1. **Two API implementations (root `api/*.ts` vs admin handlers) drift.** #1 and
   #2 are both drift. Worth unifying or contract-testing the pair?
2. **Anon RLS policies that join `tenants` are a landmine** (anon can't read
   `tenants`). Audit all anon policies for this pattern; prefer
   `tenant_is_active(tenant_id)`.
3. **Merged feature ≠ migrated prod.** #3 shows schema can lag code silently.
   Add a deploy-time migration-presence gate.
4. **Silent client-side optimistic UI** (filled hearts) masked a hard server
   failure. Should saves surface server errors to the user?
