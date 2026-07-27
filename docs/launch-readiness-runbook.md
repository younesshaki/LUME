# Launch Readiness Runbook

How to certify a tenant as ready for a real dealership, and what that
certification does and does not mean.

The system has three parts:

- **Engine** — `apps/admin/lib/launchReadiness.ts`: pure evaluator
  `evaluateLaunchReadiness(snapshot, profile)`. Input is a read-only,
  tenant-scoped snapshot assembled by `apps/admin/lib/launchReadiness.server.ts`.
- **Admin UI** — the "Launch readiness" section on `/admin/[tenant]/website`
  (pilot/public toggle, summary, counts, category grouping, remediation links,
  and safe actions: open preview / copy report JSON / go to next blocker). The
  tenant-overview "Launch checklist" derives its items from the same engine.
- **CLI** — `npm run audit:tenant-launch` (see below).

Every check reports `pass`, `warning`, or `blocker`. A report is **ready** when
`blockerCount === 0` (warnings allowed). Language rule: never say "production
ready" — a tenant is **"Ready for pilot"** or **"Ready for public launch"**.

## Pilot vs public

- **Pilot** is the soft launch: the tenant is reachable on its preview URL and
  being exercised by the dealer's own team. Cosmetic and trust items (logo,
  custom domain, lead capture) warn instead of blocking.
- **Public** is the real launch on a customer-facing URL: everything pilot
  checks, plus a verified custom domain (when the platform configures custom
  domains), lead capture, branding, and a lead destination are blockers.

## The checks

In category order (account → website → inventory → branding → domain →
concierge → operations). "Pilot / public" notes where severity differs.

### account

- `account.tenant-active` — tenant status is `active`; `trial` warns,
  `suspended` blocks.
- `account.owner-present` — at least one owner membership; invited-but-unaccepted
  never counts. Blocker.
- `account.subscription` — an operational subscription exists. Warning only
  (billing is not final).

### website

- `website.home-exists` — a home page exists and is not archived. Blocker.
- `website.home-published` — the home page has a published revision. Blocker.
- `website.home-content-valid` — the published revision has ≥1 valid renderable
  block; empty/invalid published docs are blockers.
- `website.inventory-path` — ≥1 live vehicle for the built-in `/vehicles` path.
  Blocker.
- `website.conversion-path` — lead capture is enabled. Pilot warning, public
  blocker.
- `website.no-stale-drafts` — no unpublished draft changes. Warning.

### inventory

- `inventory.has-vehicles` — the tenant has vehicles. Blocker.
- Coverage checks, each with evidence `"covered/total (pct%)"`:
  - price coverage
  - display-image coverage — 0% coverage is a public blocker, pilot warning
  - mileage coverage
  - stable-identity coverage (VIN/feed id) — warning only

### branding

- `branding.logo` — a logo via theme key or the `tenant-logos` storage bucket.
  Pilot warning, public blocker.

### domain

- `domain.verified` — pilot passes on the preview URL (warning if domains are
  enabled but none verified). Public requires a verified custom domain when the
  platform configures custom domains (`VERCEL_ADMIN_TOKEN` +
  `VERCEL_PROJECT_ID`); otherwise N/A pass.

### concierge

- `concierge.persona-configured` — a bot persona exists. Warning.
- `concierge.knowledge` — RAG knowledge chunks exist. Warning (inventory-grounded
  answers still work without them).

### operations

- `operations.lead-destination` — lead email notifications enabled; otherwise a
  fallback inbox/round-robin is a warning, and nothing at all is a public
  blocker.
- `operations.team-coverage` — more than one member or a pending invite. Warning.

## CLI

```bash
npm run audit:tenant-launch -- --tenant <slug> [--profile pilot|public] [--format human|json]
```

Example:

```bash
npm run audit:tenant-launch -- --tenant acme --profile pilot --format human
```

- Read-only; it never mutates tenant data.
- Env is auto-loaded from `apps/admin/.env.local`, then root `.env.local`.
- Exit codes: `0` ready · `1` readiness blockers · `2` configuration/runtime
  error. Script the audit in CI/hooks with the exit code, not the text output.

## Resolving common blockers

Every blocker in the admin "Launch readiness" section carries a remediation
link to the relevant admin surface. In short:

- **account.tenant-active** — tenant lifecycle status (admin tenant settings).
- **account.owner-present** — invite/accept an owner (team/invite surface).
- **website.home-\*** — publish valid home content in the page editor
  (`/admin/[tenant]/website`).
- **website.inventory-path / inventory.\*** — import or fix vehicles
  (`/admin/[tenant]/vehicles`, incl. CSV import); coverage gaps list which
  fields are missing.
- **website.conversion-path / operations.lead-destination** — lead capture and
  notification settings.
- **branding.logo** — upload a logo in the branding editor.
- **domain.verified** — add and verify a custom domain (domain settings);
  pilot can proceed on the preview URL.

## What readiness does NOT guarantee

A passing report means the tenant's *configuration* is complete enough to face
customers. It does **not** cover:

- **Content quality** — a published home page can be on-brand or gibberish;
  the check only proves it renders.
- **Performance** — no Lighthouse/Core-Web-Vitals signal.
- **Model answer quality** — concierge correctness and tone are not judged;
  `concierge.knowledge` only checks that chunks exist.
- **Billing state** — `account.subscription` is a warning by design; billing is
  not final.
- **Deployment-level health** — `/api/ready` is the deployment-level readiness
  probe and is a separate concern from per-tenant launch readiness.

## Two-tenant isolation test

The engine has a Playwright test proving one tenant's readiness snapshot never
sees another tenant's data:

```bash
cd apps/admin && LUME_E2E_TWO_TENANT=1 npx playwright test launch-readiness-isolation.spec.ts
```

**Handle with care.** The test writes throwaway tenants to whatever Supabase
project the env points at. Slugs are unique per run and cleanup cascades, but
the `LUME_E2E_TWO_TENANT=1` flag is an explicit opt-in for a reason — point it
at a staging/isolated project, never carelessly at production.
