# Plan: make staging a safe, isolated clone of production

_Status: PLAN — not yet implemented. Drafted 2026-07-16._

## Goal

Turn the staging Supabase project into a **production-shaped, isolated copy** so
we can develop and test a batch of features — including schema migrations and
destructive actions — against realistic data **without ever touching the real
production database**.

Today staging is an empty 4-car shell, so it looks nothing like prod and nobody
wants to test on it. The workaround we've been using (point local builds at the
real production DB) is realistic but dangerous: every write hits live data.

## The core idea

Code and database are two independent dials:

- **Code** = which branch/worktree we build from.
- **Database** = which Supabase URL the `.env.local` / deploy env points at.

We want: **staging code + a COPY of prod data**, fully isolated. That gives a true
dress rehearsal with zero production risk.

## Current facts (verified 2026-07-16)

| Thing | Value |
|---|---|
| Production Supabase project | `atsgdjwjtmqvtotbrowu` (eu-west-1) |
| Staging Supabase project | `hapyyupeugxccofpibor` |
| Prod R2 public image base | `https://pub-da3069790c6443f883e3991be965f766.r2.dev` |
| Prod tenants | `demo` (5,865 live vehicles), `default` (1,009), `secondplace` (0) |
| Prod vehicles with managed R2 images | only 4 (demo: 1 Lamborghini Urus + 3 Ferraris) — the rest use legacy/empty `imageSrc` |
| Latest migration applied | `065_fix_public_read_policies` |
| Guard already in place | `verify-deployment-env.mjs` refuses to build staging if it points at the prod project ref |

Because only 4 vehicles currently have managed images, the image side is *cheap*
right now — and the read-through shortcut (below) makes it cheap regardless of
how many are added later.

## Recommended approach: the pragmatic clone

### 1. Schema
Ensure staging has the **same migrations** as prod. Staging should already be at
migration 065; verify with `list_migrations` / `to_regclass` checks. Going
forward, **apply every new migration to staging FIRST**, test, then prod. This is
the single biggest safety win — it kills the "code expects a table prod doesn't
have" class of bug (e.g. the 062/063 saved-vehicles incident).

### 2. Data (copy the rows)
Copy the core tenant-scoped tables from prod → staging:

- `tenants`, `tenant_members` (careful: staging has its own auth users; membership
  rows must map to staging user ids, not prod ones)
- `vehicles`, `vehicle_images` (metadata / R2 keys only — not the image bytes)
- `visitors` / visitor profiles, `visitor_saved_vehicles`
- `conversion_events` (optional — analytics, can start empty)
- any facets / inventory-version projection tables (059–061)

Method options (decide at build time):
- `pg_dump --data-only` selected tables from prod, load into staging, OR
- per-table `COPY`/`INSERT ... SELECT` via a script, OR
- Supabase dashboard export/import.

FK order matters (tenants → vehicles → vehicle_images → saved_vehicles).

### 3. Images (the cheap shortcut — do NOT copy files)
Do **not** duplicate the R2 objects into a staging bucket. Instead point staging's
public image base URL at the **same production R2 bucket, read-only**:

- Set staging `VITE_R2_PUBLIC_BASE_URL` / `R2_PUBLIC_BASE_URL` =
  `https://pub-da3069790c6443f883e3991be965f766.r2.dev`.
- Do **not** give staging R2 write credentials (or give it its own bucket for new
  uploads if we want to test uploads in isolation).

Rationale: images are immutable public files. Reading them from staging touches
nothing and risks nothing. Staging copies the DB rows (which hold the R2 keys);
the pixels stream from prod's public bucket. Zero storage duplication.

Caveat: if a test in staging *deletes* a vehicle_images row, it only removes the
staging row — the prod file and prod row are untouched. Good. But **do not let
staging get write/delete access to the prod bucket.**

### 4. A refresh script (`staging:refresh-from-prod`)
A snapshot drifts the moment prod changes. Provide one command to re-sync:

- truncates the copied tables in staging,
- re-copies current prod rows,
- leaves staging's own auth users / secrets alone.

Run it on demand when staging feels stale. Not automatic.

## Costs / caveats (accept these before starting)

1. **Drift + refresh maintenance.** Staging is a point-in-time copy; re-run the
   refresh when needed.
2. **One-time setup effort** to get the copy + FK ordering right.
3. **PII.** Prod has real customer emails/names. For a solo founder using own data
   this is usually fine, but the "proper" version scrubs/anonymizes customer PII
   in the copy. Decide consciously.
4. **Auth users don't transfer cleanly.** Staging has its own `auth.users`; don't
   copy prod auth rows. `tenant_members` must reference staging user ids. (We
   already created a staging owner: `hakicsi89@gmail.com` / owner of demo.)
5. **Keep staging's own secrets** (service-role key, `VISITOR_SESSION_SECRET`,
   etc.). Note: staging is currently **missing `VISITOR_SESSION_SECRET`**, which
   caused the visitor-account 401 — fix this as part of the setup.

## Resulting mental model (the payoff)

- **Develop & test everything** → staging (safe prod-clone). Migrate freely here.
- **`main`** → production, reached only after staging looks right.
- **"point local at real prod" mirror** → optional last-mile check only, not the
  daily driver.

Deploy flow unchanged: feature/upcoming → staging (deploys + testable) → main
(production). Only staging & main deploy on Vercel (build gating).

## Open decisions (to settle before implementing)

- [ ] Which tables to copy vs. leave empty (analytics tables?).
- [ ] Scrub PII or copy customer data as-is?
- [ ] Share prod R2 read-only (recommended) vs. give staging its own bucket + copy
      the 4 image sets?
- [ ] Copy all 3 tenants or just `demo` (the rich one)?
- [ ] Where the refresh script lives and how it authenticates to both projects.

## First implementation step (when we start)

Copy the core tables for the `demo` tenant only (tenants → vehicles →
vehicle_images → visitors → visitor_saved_vehicles), wire staging's image base to
the prod R2 read-through, add `VISITOR_SESSION_SECRET` to staging, and verify the
staging site renders the real inventory. Then wrap it as `staging:refresh-from-prod`.

## Related docs / memory
- `docs/handoff/prod-vs-local-findings.md` — the prod-vs-local bug family.
- Session context: staging project stood up empty; build gating + `parity:staging`
  + local prod-mirror all created 2026-07-16.
