# feature/upcoming — Codex live-dev prompt & push flow

Paste the **Codex prompt** below at the start of a Codex session so its edits
show up live at the page-editor URL. The **push flow** at the bottom is how that
work reaches `features/upcoming`.

Editor URL to watch (tenant `demo`):
`http://localhost:3100/admin/demo/pages/668218c5-844c-41c8-8e8a-2440150a4385`

---

## Codex prompt (copy-paste)

```
Before you start editing, bring up the local dev stack FROM THE SAME CHECKOUT
you are editing (~/Documents/LUME), so I can watch your changes live at
http://localhost:3100/admin/demo/pages/668218c5-844c-41c8-8e8a-2440150a4385
(tenant "demo"). The page editor's live preview is an iframe that embeds the
public site, so BOTH servers must run from your checkout:

1. Public site (Vite, hot-reload):
     cd ~/Documents/LUME && npm run dev          # port 5173

2. Admin (Next.js) — use `next dev`, NOT `next start`:
     cd ~/Documents/LUME/apps/admin && npx next dev --port 3100
   Use dev because NEXT_PUBLIC_* vars are baked in at build time; `next start`
   will not reflect config or code changes without a full rebuild.

3. Env:
   ~/Documents/LUME/apps/admin/.env.local:
     NEXT_PUBLIC_PUBLIC_SITE_URL=http://localhost:5173   # editor embeds LOCAL public site
   ~/Documents/LUME/.env.local (root):
     VITE_ADMIN_API_HOST=http://127.0.0.1:3100           # public /api proxy -> local admin
     VITE_LUME_TENANT=demo                                # preview is the demo tenant

Rules:
- Run the servers from the SAME checkout you edit. If the servers run from a
  different worktree, the editor shows that other checkout, not your edits.
- Use `next dev` (HMR). "[HMR] connected" in the console is EXPECTED in dev.
  Never use `next start` for this live-editing workflow.
- Public-site edits (src/**, VehiclesPage.css, block components) hot-reload via
  :5173 in the iframe; admin-side edits (apps/admin/**) hot-reload via next dev.
- After your change, tell me to hard-refresh the editor tab, and confirm both
  servers are up and serving THIS checkout before you say it's ready:
     lsof -nP -iTCP:3100 -iTCP:5173 -sTCP:LISTEN
- Do NOT commit, push, or run the release. Leave the work committed on your
  feature branch (or uncommitted) for review; the orchestrator lands it.
```

---

## How it reaches `features/upcoming` (orchestrator does this, not Codex)

1. Review Codex's diff; independently gate:
   `npm run typecheck:all` · `VITE_LUME_TENANT=default npx vitest run` ·
   `npm run build` · `npm run build:admin`  (default tenant for vitest — the
   demo tenant makes the CSV-fallback tests fail; that's a local env artifact).
2. Commit on Codex's branch in `~/Documents/LUME`, then cherry-pick onto
   `integrate/feed-sync-plus-grid` in `~/Documents/LUME-upcoming`.
3. Re-gate on the integration branch, then
   `git push origin HEAD:features/upcoming` (fast-forward; no Vercel trigger).
4. Production ships separately: `features/upcoming → staging → main`, waiting for
   both Vercel projects (`lume`, `lume-admin`) to reach READY at each stage.

## Port ownership note

The dev stack in the Codex prompt takes over ports **3100/5173** from the
orchestrator's `LUME-upcoming` servers (one process per port). During a Codex
live-edit session, Codex owns them; afterward the orchestrator restarts its
integration servers. Don't expect both up at once.

---

## Codex prompt: implementing a shadcn/Aceternity registry component

Use this whenever asking Codex to add a component from `npx shadcn add
@aceternity/...` or any other registry demo. Bento and Carousel both landed
clean on the first pass using these rules — paste as-is, then name the
specific component/URL at the bottom.

```
You're adapting a component from a shadcn/Aceternity registry demo into LUME.
Do NOT run `npx shadcn add @aceternity/<name>` and wire the raw output into
the app. The registry output is a generic demo: unrelated placeholder copy,
generic icons, skeleton divs, and often a dependency (e.g. embla-carousel)
we don't need. Follow this exact process instead:

1. READ the registry component's source/demo (fetch the .json or view it) to
   understand the INTERACTION and VISUAL LANGUAGE ONLY — layout mechanics,
   animation timing, spacing rhythm, the overall "feel." Do not copy its data
   shape, its copy, or its dependencies.

2. HAND-WRITE our own component using that visual language, with:
   - Our own real data type (not the demo's placeholder shape).
   - Zero new npm dependencies unless the task genuinely requires one —
     justify it explicitly if so. Prefer plain React/CSS over a heavy demo
     dependency (e.g. no embla-carousel for a carousel; we hand-rolled ours
     in ~120 lines).
   - A footer/content slot that takes REAL actions (Edit/Duplicate/Delete,
     navigation, whatever the surface needs) — never hardcoded demo actions.

3. REUSE existing logic — do not duplicate it:
   - If the surface already has handlers (e.g. handleDuplicate/handleArchive/
     handleDelete on a list page), call the SAME functions from your new
     component. Never write a second copy of business logic for a new view.
   - If there's an existing validated input this maps onto (e.g. a page-block
     schema's color/enum field), extend that closed schema — add an enum
     value, not a new free-text prop. Any color/style value that becomes a
     CSS value must go through a strict validated format (e.g.
     `z.string().regex(/^#[0-9a-fA-F]{6}$/)`) and get applied as a CSS custom
     property, never interpolated into a raw style string — that's the only
     safe way to let user/tenant input drive appearance without opening a
     CSS-injection path.

4. TENANT ISOLATION: if the component shows any tenant-specific asset
   (screenshots, sample content, etc.), scope it explicitly per-tenant in
   code — never let one tenant's reference content silently render for
   another tenant. Placeholder/empty state for tenants without the asset.

5. THEME AWARENESS — check this explicitly, don't assume:
   - Read the actual page's background before styling. If the surface has a
     NON-default background (e.g. a dark hero/marketing page, forced-dark
     card), any button/text you add must be given an EXPLICIT color for its
     base (non-hover) state — do not rely on inherited/ambient text color
     from a parent, and do not assume a shared component's default variant
     (e.g. Button's "outline" variant) has readable contrast in your context.
     Actually resolve what background/foreground CSS values are active
     (check the theme's CSS variables for light AND dark mode, e.g.
     :root vs .dark) before deciding a color is safe. Getting this wrong
     produces literally invisible white-on-white or black-on-black controls.
   - Decide once: is this surface theme-aware (uses light/dark: variants,
     matches the rest of the authenticated app) or intentionally
     fixed-dark/cinematic (matches a "showcase" surface like a carousel)?
     Be consistent for every element within the same component — don't mix.

6. RESTRAINT on decorative effects (hover glows, spotlights, animated
   accents): start LOW. A first pass with a strong cursor-follow glow needed
   a follow-up fix to tone it down — ship the restrained version the first
   time, not the maximal one.

7. GATE before calling it done:
     npm run typecheck:all
     VITE_LUME_TENANT=default npx vitest run   (NOT demo — demo tenant makes
       the CSV-fallback tests fail locally; that's an env artifact, not a
       real failure, so always use default here)
     npm run build && npm run build:admin
     git diff --check
   Then actually load the surface in the browser (hard refresh) and check it
   before reporting done — don't rely on a green gate alone for a UI change.

8. Report back: what you reused vs. adapted vs. added new, and why any new
   dependency (if you added one) was necessary.

Component/registry URL to adapt: <PASTE THE SPECIFIC COMPONENT NAME OR
npx shadcn add @aceternity/... COMMAND HERE>
Where it goes / what data it should show: <DESCRIBE THE SURFACE AND DATA>
```

---

## Codex prompt: long autonomous concierge testing/debugging task

Everything this prompt needs is already built and verified working —
transcript logging, a test-driving harness, a starter regression suite with
real evidence, and a full architecture explainer. This prompt is just the
entry point; the real detail lives in the two docs it points to. Paste as-is.

```
You're starting a long, autonomous, iterative task: find real concierge
conversation failures, root-cause them, fix them, add a regression test,
verify against the exact failing conversation, and repeat. This is expected
to be long and token-heavy — that's fine, it's designed for that.

Read these two files FULLY before doing anything else, in this order:

1. docs/architecture/concierge-architecture-and-limitations-2026-07-23.md
   — explains WHY the concierge is built the way it is (deterministic-first,
   AI-fallback-second, and why that split exists), and catalogs every bug
   already found and fixed. Don't rediscover these — read what's already
   known first.

2. docs/handoff/concierge-autonomous-testing.md
   — the actual task brief: environment setup (dev stack, LUME_CHAT_DEBUG,
   log location), the tools (scripts/run-concierge-scenarios.mjs,
   scripts/read-concierge-transcript.mjs, scripts/concierge-scenarios.mjs),
   the exact fix-verify loop to follow, safety/process rules, and a bounded
   definition of "done" for one session (report back at that checkpoint
   rather than continuing indefinitely on your own judgment).

The starter regression suite (scripts/concierge-scenarios.mjs) already
contains 11 scenarios, three of them CONFIRMED real bugs found in a
verification pass on 2026-07-23 — read their inline comments carefully, they
contain the exact reproduction and root-cause hypothesis for each:
- numeral ordinals ("open the 3rd one") don't reach the safe deterministic
  path and can return a CONFIDENTLY WRONG vehicle, not just fail loudly
- "whole"/"entire" aren't recognized as reset-language synonyms for "all"
- "what about a different make?" correctly asks a clarifying question but
  self-contradicts by still listing the OLD make's results in the same reply

Start by running the full suite (node scripts/run-concierge-scenarios.mjs)
to get your baseline, then work through failures using the loop documented
in the handoff file. Stay within the existing deterministic-first
architecture — if you find yourself wanting to replace a rule with a model
call, stop and flag it instead of doing it, per the handoff file's process
rules.

Report back at the checkpoint defined in the handoff doc's "Definition of
done" section.
```
