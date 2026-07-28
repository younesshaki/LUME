# Concierge Autonomous Testing — Handoff for Codex

**Read this whole file before starting.** It's self-contained: environment
setup, tools, the exact loop to run, safety rules, and a bounded definition
of "done" for one session. This is a long, token-heavy task by design — the
boundaries below exist so it doesn't run forever without a checkpoint.

Background reading (do this first, it explains WHY the system is built the
way it is and catalogs everything already fixed, so you don't rediscover it):
`docs/architecture/concierge-architecture-and-limitations-2026-07-23.md`

---

## Mission

Find real concierge conversation failures, root-cause them in code, fix
them, add a regression test, verify the fix against the exact failing
conversation, and move on — repeating until the starter scenario suite is
clean and you've explored beyond it. This mirrors exactly how every bug was
found and fixed on 2026-07-22/23 (see the architecture doc) — you're
continuing that process, not starting a new approach.

**The concierge is deterministic-first, model-second** (four layers: pattern
extraction → conversation-state memory → template answers → AI fallback).
Almost every bug found so far has been in the deterministic layers — a
regex too narrow, a piece of state that didn't get cleared, a rule that
fired when it shouldn't have. Assume the same is true of whatever you find
next, and look there first.

---

## 1. Environment setup

Work in `~/Documents/LUME` (this checkout). Bring up both servers from here:

```bash
# Public site (Vite, hot-reload) — port 5173
cd ~/Documents/LUME && npm run dev

# Admin (Next.js), LUME_CHAT_DEBUG=1 is required — it's what makes the
# transcript logger below actually emit anything. Append (>>), don't
# overwrite, so history survives across restarts within your session.
cd ~/Documents/LUME/apps/admin
LUME_CHAT_DEBUG=1 npx next dev --port 3100 >> ~/Documents/LUME/logs/concierge-debug.log 2>&1 &
```

Use `next dev`, never `next start` — see the port/checkout rules in
`feature-upcoming-push.md` (same repo root) if anything about the dev stack
seems inconsistent. Confirm both are up and serving THIS checkout before
testing:
```bash
lsof -nP -iTCP:3100 -iTCP:5173 -sTCP:LISTEN
```

`logs/concierge-debug.log` is gitignored — it will not end up in a commit.

---

## 2. The tools (all in `scripts/`, already built and verified working)

### `scripts/concierge-scenarios.mjs`
The regression suite. Every scenario is `{ name, turns }`; a turn is either
a plain string (log the exchange, no auto-check — use for judgment calls) or
`{ text, expect?, reject? }` (case-insensitive substring checks on the bot's
visible reply). **Extend this file as you go** — every new bug you find
should become a permanent scenario here before you move on, the same way
every fix tonight got a regression test in the actual code.

### `scripts/run-concierge-scenarios.mjs`
Runs scenarios through the REAL visitor path (`:5173` → proxy → `:3100`),
maintaining one session per scenario across all its turns, with pacing
built in to avoid the chat route's rate limiter (turns are ~3.5s apart by
default — don't remove this, tightening it just produces false failures).

```bash
node scripts/run-concierge-scenarios.mjs                       # full suite
node scripts/run-concierge-scenarios.mjs path/to/subset.mjs    # a subset — write a
                                                                 # small file that
                                                                 # re-exports a filtered
                                                                 # `scenarios` array
```

Prints each exchange live and a pass/fail summary at the end. Exit code is
non-zero if any `expect`/`reject` check failed.

### `scripts/read-concierge-transcript.mjs`
Pulls the FULL conversation (real user text + real bot text + actions +
tool calls) out of the raw server log, grouped by session:

```bash
node scripts/read-concierge-transcript.mjs logs/concierge-debug.log
node scripts/read-concierge-transcript.mjs logs/concierge-debug.log --session <id>
node scripts/read-concierge-transcript.mjs logs/concierge-debug.log --tail 20
node scripts/read-concierge-transcript.mjs logs/concierge-debug.log --json | jq .
```

Each transcript line also tells you which internal path answered the turn —
`source: "deterministic" | "model" | "tool"`. **This is the single most
useful field for spotting a new bug class**: if something that looks like it
should have a safe, canned answer shows `source: "tool"` or `"model"`
instead, the deterministic layer didn't recognize it and the AI improvised —
that's worth investigating even if the actual reply happened to be correct,
because it means the safety net didn't catch this phrasing.

For the lower-level filter-state debug lines (extracted filters, active
filters before/after, the exact verified vehicle-ID list, which rule fired)
that sit alongside the transcript lines in the same log:
```bash
grep '"level":"debug"' logs/concierge-debug.log | grep 'conversation-state'
```

---

## 3. The loop

For each scenario (starting with the full `concierge-scenarios.mjs` suite,
then your own new ones):

1. **Run it.** `node scripts/run-concierge-scenarios.mjs`
2. **On any failure or anything that looks off** (even if no `expect`/`reject`
   caught it — read the actual replies, not just the pass/fail summary):
   pull the exact turn from the log with `read-concierge-transcript.mjs
   --session <id>`, cross-reference the `conversation-state` debug lines for
   that session, and find the root cause in code. Don't guess — the whole
   point of the logging is that you shouldn't have to.
3. **Fix it** in the relevant file — almost certainly one of:
   - `apps/admin/lib/chatConversationState.ts` (the state machine: ordinal
     resolution, reset-phrase recognition, filter transitions)
   - `packages/rag/src/vehicleFilters.ts` (natural-language filter extraction)
   - `apps/admin/app/api/chat/route.ts` (deterministic answer wiring, response
     path selection)
4. **Add a regression test** — both a unit test near the fix (follow the
   existing test file conventions — e.g. `chatConversationState.test.ts`,
   `vehicleFilters.test.ts`) AND a new entry in
   `scripts/concierge-scenarios.mjs` covering the exact real conversation
   that failed.
5. **Gate before considering it done:**
   ```bash
   npm run typecheck:all
   VITE_LUME_TENANT=default npx vitest run   # NOT demo — demo tenant fails
                                               # unrelated CSV-fallback tests,
                                               # that's a local env artifact
   npm run build && npm run build:admin
   git diff --check
   ```
6. **Re-run the exact failing scenario** to confirm the fix against the real
   conversation, not just the unit test in isolation.
7. **Commit** the fix on your branch (see §5 — do not push to
   `features/upcoming` or further yourself).
8. Move to the next scenario.

After the starter suite is clean, design new scenarios probing further:
different phrasings of reset/ordinal/refinement language, multi-turn chains
longer than anything tested so far, edge cases in price/year/mileage
parsing, and the two things flagged as genuinely open in the architecture
doc — numeral ordinals ("3rd") and reset synonyms ("whole"/"entire") are
represented as "KNOWN GAP" scenarios already; fix those first, they're
already root-caused in the architecture doc (§3, items A and B).

---

## 4. Also verify (not concierge logic, but directly related to this session's fixes)

- **Active filter chips**: open `http://localhost:5173/vehicles`, have the
  concierge apply a filter you can't normally see on the main toolbar (e.g.
  "only AWD ones", "under 40,000 miles", "in California") and confirm a
  removable chip appears for it and clicking it removes just that facet. Do
  the same on any tenant page using the "Vehicle Inventory" page-builder
  block (that surface previously had NO way to see/remove concierge-set
  filters at all — see commit `1b3aec2`/`fix(vehicles): show every active
  filter...` for the fix). If you find a filter field that still doesn't
  produce a chip, that's a real bug — `activeFilterChips()` in
  `src/experience/vehicles/catalog.ts` is the single place both surfaces
  read from, so a gap there affects both.

---

## 5. Safety / process rules

- **Do not push to `origin/features/upcoming`, `staging`, or `main`, and do
  not run any part of the release process.** Land fixes as commits on your
  own branch (or leave uncommitted, whichever you're already doing) for the
  orchestrator to review, gate independently, and land — same as every other
  piece of work this session.
- **Do not touch production data.** The local admin server points at the
  real production Supabase + R2 by design (see `local-parity-prod-pair`
  convention) — reading is fine, this task shouldn't be writing vehicles/
  leads/etc., but be aware every query is against real data.
- **Never remove or weaken an existing regression test to make the gate
  pass.** If a new fix seems to conflict with an old test, that's a signal
  to understand why, not to delete the test.
- **`git diff --check`** must be clean (no trailing whitespace / no-newline
  issues) before considering anything done — it's part of the gate for a
  reason established earlier this session.
- If you find yourself wanting to change the *deterministic-vs-AI*
  architecture itself (e.g. replacing a regex with a model call) — stop and
  flag it instead of doing it. That's a deliberate, larger decision the
  orchestrator/user makes explicitly (see architecture doc §4); this task is
  about fixing bugs within the existing architecture, not changing it.

---

## 6. Definition of done for one session (checkpoint, not a hard stop)

This task is intentionally open-ended ("keep testing until everything is
perfected" was the ask), which is exactly why it needs a checkpoint instead
of running unbounded:

- **Stop and report back when:** the full `concierge-scenarios.mjs` suite
  passes with zero failing checks AND you've spent a reasonable exploration
  budget beyond it (your judgment — a good target is at least 10–15 new
  scenarios covering phrasing/state-machine territory the starter suite
  doesn't), OR you hit a bug that implicates the bigger architecture
  question (§5's last bullet) rather than a local fix.
- **Report format:** a short summary of (a) every bug found and fixed, each
  with the exact failing conversation and the root cause — same style as the
  "Part 2" bug list in the architecture doc, (b) every new scenario added to
  `concierge-scenarios.mjs`, (c) current pass/fail state of the full suite,
  (d) anything you found but didn't fix, and why.
- Do not attempt to keep going indefinitely past that checkpoint on your own
  judgment of "perfected" — report back and let the next instruction decide
  whether to continue, widen scope, or stop.
