# Deployment environments

LUME has two Vercel projects from one repository:

- `lume`: the public Vite site and self-contained root `api/*.ts` functions.
- `lume-admin`: the Next.js admin and canonical application APIs.

Both projects use the same branch policy and must always point at the same
Supabase environment.

## Release flow

1. Merge feature branches into `staging` in reviewable batches.
2. CI runs migration sequencing, all workspace typechecks, all unit tests, and
   both production builds.
3. Vercel deploys only `staging`. Ordinary feature branches are intentionally
   skipped to avoid exhausting the deployment quota.
4. Validate the public and admin staging deployments together.
5. Open one `staging` to `main` PR. After review, merge it to deploy production.

`main` is the production branch. Do not use direct feature-to-main pushes for
normal releases. `VERCEL_FORCE_BUILD=1` is an emergency-only override for a
manual feature-branch deployment.

## Required isolation

The staging branch must not inherit production Supabase credentials. Configure
branch-scoped Preview variables for Git branch `staging` in both Vercel
projects:

- `LUME_ENVIRONMENT=staging`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on `lume`
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on
  `lume-admin`
- `ALLOWED_CHAT_ORIGINS` including the staging public URL and local parity
  origins (`http://127.0.0.1:5173` and `http://localhost:5173`) on `lume-admin`

The public and admin variables must target the same dedicated staging project.
Production must set `LUME_ENVIRONMENT=production`. The Vercel build runs
`scripts/verify-deployment-env.mjs` and fails if staging points at the known
production project or if browser/server Supabase URLs disagree.

Do not configure production email, CRM, domain-management, or webhook secrets
in staging unless the provider offers a sandbox account. Missing optional
credentials already degrade those integrations to their documented no-op
behavior.

## Database setup

Preferred: a persistent Supabase preview branch associated with Git branch
`staging`, without production data. If the Supabase plan does not include
branching, use a separate project. Apply every repository migration in order,
then seed only synthetic tenants/users/inventory.

Never copy visitor sessions, leads, customer profiles, API keys, integration
secrets, or other production records into staging.

Before promotion:

```bash
npm run check:migrations
npm run check:all
```

`check:migrations` proves that repository filenames are continuous and unique;
it does not prove a remote database is current. Confirm the staging migration
ledger before testing and the production ledger before merging to `main`.

## Local production-parity stack

After branch-scoped staging variables exist and both project directories are
linked with Vercel CLI, run:

```bash
npm run parity:staging
```

Vercel does not return values marked Sensitive when environments are pulled.
If a required staging secret is sensitive, place its staging-only value in
`.env.staging.local` at the repository root or
`apps/admin/.env.staging.local`, matching the owning project. These files are
gitignored. Never copy production credentials into them; the parity command
still validates the Supabase project identity after applying local overrides.

This command:

- pulls branch-scoped variables into mode-0700 temporary directories, parses
  them in memory, and deletes them before either server starts;
- refuses to start if either process targets production Supabase;
- builds and starts Next.js in production mode on port 3100;
- builds the public Vite bundle and serves it with `vite preview` on port 5173;
- proxies public `/api/*` calls to the local production-mode admin process.

Open `http://127.0.0.1:5173` for the public site and
`http://127.0.0.1:3100` for admin. Stop both with Ctrl-C.

This mirrors application builds, environment shape, tenant resolution, and the
browser-to-API flow. Vercel's CDN, edge network, deployment protection, and the
root serverless wrapper remain platform boundaries; validate those on the
staging deployment before production promotion.

## Rollback

- Staging: revert the batch on `staging`; Vercel creates a new staging build.
- Production code: use Vercel rollback for immediate recovery, then revert the
  offending commit on `main` so Git matches the deployed state.
- Database: migrations are forward-only. Ship a new additive corrective
  migration; never edit an already applied migration.
