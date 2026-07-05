# Mission: LUME Admin Dashboard UI/UX Overhaul

You are working in the LUME monorepo. Read `CLAUDE.md` and `docs/SESSION-HANDOFF.md`
first and obey every rule there. Your mission is a **presentation-layer overhaul of
the admin dashboard** (`apps/admin`) — from unstyled scaffold to a polished,
modern SaaS admin that feels professional, fast, and pleasant. Keep iterating:
build → run → look at every page → critique → refine, until you would proudly
demo any screen. Do not stop at "better"; stop at "excellent."

## Where taste comes from

Browse these component sources and choose the best fit per problem — all are
installable via the shadcn CLI (`npx shadcn@latest add ...`, component pages
show the exact command):
- **shadcn/ui** (ui.shadcn.com) — the foundation: button, input, select, table,
  dialog, dropdown-menu, tabs, badge, card, skeleton, sonner (toasts), command,
  sidebar, breadcrumb, chart.
- **Tremor** (tremor.so) + shadcn charts — analytics/data-viz patterns.
- **Origin UI** (originui.com) — refined inputs, tables, filters.
- **Aceternity UI** (ui.aceternity.com) — ACCENT ONLY. This is an admin tool,
  not the cinematic public site. At most 2–3 restrained touches (e.g. a subtle
  glow/spotlight on empty states or the platform overview) — nothing that moves
  while the user works.
- **Magic UI / Kibo UI** — optional accents under the same restraint rule.

**Design direction:** clean, dense-but-breathable SaaS tool (think Vercel /
Linear / Supabase dashboards). Neutral surfaces; LUME's gold (#d9b76a) strictly
as accent (active nav, focus rings, primary CTAs, brand mark). Full light AND
dark mode. Never sacrifice legibility or latency for spectacle.

## Current state (verified 2026-07-05)

- `apps/admin` = Next.js 16 App Router + Tailwind **v4** (`@import "tailwindcss"`
  in `app/globals.css`). NO shadcn init yet (no components.json in apps/admin),
  no icon lib, no toasts; everything hand-rolled `neutral-*` classes.
- Surfaces to redesign, roughly current quality order (worst first):
  1. Sidebar/layout (`app/admin/layout.tsx`) — flat link list, repeated per
     tenant, no collapse, no active state, plain "Sign out".
  2. `admin/[tenant]/vehicles` — plain table, no search/sort/pagination
     (inventories run 1000+ rows), plus `vehicles/import` (CSV flow),
     `vehicles/new`, `[id]` forms.
  3. `admin/[tenant]/leads` + `leads/[leadId]` (status workflow, timeline).
  4. `admin/platform` — all-tenants table (platform admins only).
  5. `admin/[tenant]/{analytics,team,domains,persona,knowledge,pages,assets,branding}`.
  6. Auth/first-run: `/login`, `/signup`, `/admin/onboarding`, `/invite/[token]`.
- Server Components by default; client components exist for interactive
  surfaces (TeamClient, ImportClient, etc.).

## Ideas the pages are begging for (pick, adapt, improve)

- Proper app shell: shadcn `sidebar` with collapsible sections, active-route
  highlighting, a tenant switcher dropdown, user menu w/ sign out; breadcrumbs.
- shadcn `table` + TanStack Table on vehicles/leads/platform: column sort,
  text search, server-side pagination for vehicles (the API already paginates).
- `command` palette (Cmd+K): jump to tenant/section, quick actions.
- `sonner` toasts replacing inline status text; `dialog`/`alert-dialog`
  replacing bare buttons for destructive actions (delete vehicle, revoke
  invite, remove member).
- `skeleton` loading states + designed empty states (first-run tenant with 0
  vehicles/leads should feel intentional, with a CTA to import/add).
- `badge` for statuses (lead status, invite status, tenant status, roles).
- Analytics: shadcn `chart` (recharts) instead of raw numbers.
- Forms: consistent field components, inline validation, pending states on
  every submit button.

## Hard constraints

- **Presentation layer only.** Do NOT change data logic, queries, RLS
  patterns, server actions' semantics, or anything in `apps/admin/app/api/**`,
  `packages/**`, root `src/**`, root `api/**`, `supabase/**`.
- Keep pages Server Components where they are; add `"use client"` only for
  genuinely interactive pieces.
- Allowed to touch: `apps/admin/**` (incl. its `package.json` for shadcn CLI
  deps + `components.json` + `globals.css`) and the root lockfile. Install with
  `npm install --legacy-peer-deps`. Nothing else.
- Never echo/commit secrets. Never push to main, deploy, or touch the DB.
- Accessibility floor: keyboard operable, visible focus, labels on inputs,
  WCAG AA contrast in both themes.

## Working loop

- Branch off `origin/main`: `codex/admin-ui-overhaul`. Small, reviewable
  commits (one surface or one primitive-set per commit).
- After every commit: `npm run typecheck:all`, `npm test`, `npm run build:admin`
  — all must stay green (162+ tests).
- Use `npm run dev:admin` and actually LOOK at each page you touched (both
  themes, 1280px and ~768px). If you can't screenshot, describe what you
  verified. Re-critique against the design direction; iterate.

## Definition of done (all true, then write a summary and stop)

1. Every admin surface uses the shared component system — zero pages left on
   ad-hoc `neutral-*` scaffolding.
2. App shell: collapsible sidebar, active states, tenant switcher, user menu,
   breadcrumbs, Cmd+K palette.
3. Vehicles & leads & platform tables: search/sort/pagination + skeletons +
   designed empty states.
4. All destructive actions confirm via dialog; all mutations give toast
   feedback; all submits show pending state.
5. Light + dark mode both deliberate; gold accent used consistently.
6. typecheck/test/build green; final message = branch, commits, per-page
   before→after summary, and anything intentionally left out.
