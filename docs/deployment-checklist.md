# Deployment Checklist

Use this before publishing a production build.

Normal releases flow through `staging`; see
[`deployment-environments.md`](deployment-environments.md).

## Environment

- `LUME_ENVIRONMENT=production` on both Vercel projects.
- The release batch passed on `staging` using an isolated Supabase project.
- `VITE_R2_PUBLIC_BASE_URL` points to the production Cloudflare R2/CDN base URL.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` point to the production Supabase project.
- Supabase migrations in `supabase/migrations/` have been applied.
- At least one profile has `is_admin=true`.
- `VITE_ACCESS_PASSWORD` is set and understood as a client-visible preview gate, not a secret.
- `VITE_ENABLE_LOCAL_CHAT=false` unless a production AI backend exists.
- `VITE_OLLAMA_HOST` is only used for local development proxying.

## Media

- `npm run check:assets` passes for currently required shell/product assets.
- `npm run check:assets:strict` passes before a full public launch.
- Product image keys match `src/experience/products/catalog.json`.
- New normalized product keys follow `products/<product-id>.webp`.

## Verification

- `npm run check:migrations`
- `npm run typecheck:all`
- `npm test -- --run`
- `npm run build`
- `npm run build:admin`
- Open the deployed preview and verify:
  - gate auth
  - homepage
  - products
  - product detail
  - showcase page
  - title card
  - Red Bull experience preloader
  - admin denied state

## Tenant launch certification

Before onboarding a real dealership (and again before flipping one from pilot
to public), certify the tenant with the launch-readiness audit. It is
read-only; the full check catalogue and remediation paths are in
[`launch-readiness-runbook.md`](launch-readiness-runbook.md).

```bash
npm run audit:tenant-launch -- --tenant <slug> [--profile pilot|public] [--format human|json]
```

- Env is auto-loaded from `apps/admin/.env.local`, then root `.env.local`.
- Exit codes: `0` ready · `1` readiness blockers · `2` configuration/runtime
  error.
- Recommended flow: run the CLI with `--profile pilot`, resolve every blocker
  (the admin's "Launch readiness" section on `/admin/[tenant]/website` shows
  the same checks with remediation links), re-run until exit `0` — then repeat
  with `--profile public` before the tenant goes live on a public URL.
