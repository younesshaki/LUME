# LUME Concierge — How It Works, What We Fixed, What's Still Limited

**Purpose of this doc:** you asked for a plain-language picture of the concierge's
current architecture, its real limitations, everything fixed this session, and
the open decision on the table. This is that picture — written to give you
enough to make the call, not to be a code reference.

---

## TL;DR

- The concierge is **deterministic-first, model-second**: a layer of hand-written
  rules tries to answer/act on a message safely and instantly; only when that
  layer doesn't recognize the message does it fall back to the AI model.
- Across the 2026-07-22/23 testing rounds we found and fixed the original
  deterministic bugs plus **three long-conversation state-drift failures**,
  all
  through the same method: you tested live, I read the exact internal state
  from debug logs, found the root cause, fixed it, and verified against your
  exact failing conversation before shipping.
- The deterministic layer's fixes were about **rules that were too narrow or
  too sticky** — not wrong in principle, just incomplete.
- Numeral ordinals, whole/entire resets, make switches, selection resets, and
  long-lived broad budget searches are now deterministic and covered by live
  sequence tests.
- There's also a **softer, different problem**: when the model _does_ have to
  answer freely (no deterministic rule fires), it can say things that sound
  authoritative but aren't backed by real data (e.g. "10% below comparable
  listings" — invented).
- The open question: keep patching the rule-based layer's gaps one phrase at a
  time, or add a small AI classification step for the genuinely open-ended
  parts (see "The Decision On The Table" below).

---

## Part 1 — How the concierge actually works today

Think of every message the visitor sends as passing through up to **four
layers**, in order. Each layer only runs if the previous one didn't already
produce an answer.

### Layer 1 — Read the sentence for structure (no AI, instant, free)

A set of hand-written pattern-matchers looks at the visitor's exact words and
tries to pull out **filters**: make, model, price range, year, body style,
drivetrain, mileage, location. This includes typo tolerance ("porche" →
Porsche) and handles spoken numbers ("fifty grand" → $50,000), but it is
fundamentally **pattern matching, not understanding** — it recognizes shapes of
sentences it was taught to recognize, nothing more.

This layer also recognizes a small set of specific _moves_: "open the first
one" (ordinal reference), "show me all inventory" (reset), "only AWD ones"
(refinement). These are recognized the same way — by matching against a fixed
list of phrasings.

### Layer 2 — Remember what's currently on screen (no AI, instant, free)

The concierge keeps a small memory _per visitor session_: which filters are
currently active, and the **exact ordered list of vehicle IDs** it last showed
them (this is a real, verified list — it came from an actual database query,
not from the AI's imagination). This is what lets "open the first one" work:
it's not the AI guessing which car you mean, it's code reading position #1 out
of a list it already knows is real.

Every turn, this layer decides: _do we need to run a new database search, or
does the visitor's message just reference something already on screen?_

It also records when inventory scope was last active. Immediate refinements
still inherit the current filters, but a broad price-only search naming
"cars", "vehicles", or "inventory" starts fresh after 30 minutes of inventory
inactivity or seven unrelated turns. This prevents a model/year from much
earlier in a long conversation leaking into a new general shopping request.

### Layer 3 — Answer directly when the situation is unambiguous (no AI, instant, free)

For a handful of common, well-defined situations, the concierge answers
without ever calling the AI model:

- "Do you have a 2026 Camry?" → runs the real query, states the real count and
  examples.
- A refinement that matches nothing → says so plainly, names _why_ (e.g. "no
  AWD BMW SUV under $70,000"), and keeps showing the last real results instead
  of an empty page.
- "Tell me more about it" → pulls the real specs of the selected vehicle.

These are template sentences filled in with real database values — there's no
AI-generated prose here, which is exactly why they're fast and can't
hallucinate.

### Layer 4 — Fall back to the AI model (slower, costs money, less predictable)

Only if nothing above fired does the message go to the actual AI model, with
the real inventory data attached as context ("here are the vehicles that
match — answer using only these"). The model can also call **tools** — small
functions like "search vehicles" or "compare vehicles" — which run real,
verified database queries on its behalf.

**Critically: even here, the AI never gets to just say "show vehicle X" for an
arbitrary ID.** Every action the AI proposes — opening a vehicle page, filtering
inventory, starting a comparison — gets checked by code afterward against the
verified list from Layer 2. If the AI's proposed vehicle ID isn't in that
verified list, the action is silently dropped. This is the one non-negotiable
rule the whole system is built around: **the AI can suggest, but only verified
data can execute.**

### Why it's built this way

The alternative — letting the AI directly decide what to search for and show —
is faster to build but has one specific failure mode we can't accept: it can
invent things. A vehicle that doesn't exist, a price that's wrong, a "10%
below market" claim with nothing behind it. For a business where "the
concierge told me you had a car for $20k and it doesn't exist" is a real
trust-destroying failure, the deterministic-first design trades some
flexibility for a hard guarantee: **nothing the visitor sees as a fact or a
navigable link is ever unverified.**

---

## Part 2 — What we found and fixed tonight (in the order it happened)

Every one of these was found the same way: you (or I, testing on your behalf)
had a real conversation with the concierge, something looked wrong, and I
turned on a debug flag (`LUME_CHAT_DEBUG=1`) that logs exactly what filters
were active, what the verified vehicle list was, and what rule fired — so I
could pinpoint the _exact_ line of logic responsible, not guess.

### 1. "Open the first one" opened a Ford Fiesta instead of a Toyota Camry

**What happened:** after searching Camrys, saying "open the first one" opened
a completely unrelated car. **Why:** the word "first" was being loosely
matched against catalog model names, and it happened to be close enough to
"Fiesta" to be treated as if you'd asked for a Fiesta, overriding the real
search. **Fix:** ordinal words are now explicitly excluded from that matching,
and matching a _make_ to a _model_ (or vice versa) now requires the first
three letters to agree — enough to still catch real typos ("porche" →
Porsche) without ever letting an unrelated word become a fabricated filter.

### 2. "Do you have a 2026 Camry?" said "no" when 9 existed

**What happened:** the AI's own prose contradicted the real search results.
**Fix:** added Layer 3 (see above) — a deterministic, template-based
availability answer that states the real count directly, so this class of
question never reaches the AI's free-form judgment at all.

### 3. The whole "memory" system was rebuilt

Originally, "what are we currently talking about" was re-figured-out fresh
every single message by re-reading recent chat history. This was replaced with
the persistent state machine described in Part 1, Layer 2 — an explicit,
inspectable record of the active filters and the exact verified vehicle list,
carried forward turn to turn. This is the foundation everything since has been
built on.

### 4. "Do you have a camry?" → "what about a caddy?" searched for a Cadillac Camry (0 results)

**What happened:** the word "caddy" was close enough to "Camry" to be
mis-matched onto the _model_ filter (only the _make_ matching had the
three-letter-prefix protection from fix #1 — the model-matching path didn't).
**Fix:** applied the same three-letter-prefix rule to model matching.

### 5. Even after fixing #4, it searched for "Cadillac Camry" (still 0 results)

**What happened:** fixing the word-matching wasn't enough — the _old_ model
("Camry") was still sitting in memory from the previous message and got
combined with the _new_ make ("Cadillac"). **Fix:** naming a different make
now correctly clears the old model — "asking about a Cadillac" starts a fresh
search, not "the same model, different make."

### 6. "2026 Camry" → "caddy" → "BMW SUVs under 70k" got stuck on a fake zero-result

**What happened:** fix #5 cleared the old _model_ on a make-switch, but not
the old _year_. So "year: 2026" — set three messages earlier — silently
survived two make-switches and turned a real, existing $64,500 BMW into a
false "no matches." **Fix:** year now clears alongside model whenever the make
changes, on the reasoning that a specific model-year is tied to _the car you
were just discussing_, not a standing preference like price range is.

### 7. Once _any_ refinement returned zero results, the concierge got permanently stuck

**This was the worst one.** Example: "BMW SUVs under 70k" (real match) → "only
AWD ones" (no AWD match — fine, that's a real answer) → but the "AWD" filter
never went away. Every later message kept re-adding it, and any further
zero-result attempt (like accidentally also adding "2026") compounded on top.
The concierge became stuck on a dead combination of filters with **no way
out** except the visitor guessing an exact reset phrase. This is what you
called "stuck on BMW."
**Root cause:** the code that was supposed to "preserve results when nothing
matches" only protected the _old list of cars shown_ — it never rolled back
the _filters themselves_. So every failed attempt left a permanent scar on the
search. **Fix:** a refinement that matches nothing now rolls the filters back
to exactly what they were before that message — the failed attempt is
reported honestly, but doesn't stick.

### 8. "Back to the whole inventory" / "all makes" did nothing

**What happened:** the reset-recognizer only knew the word "**all**" ("all
inventory", "all vehicles") — not synonyms like "whole" or "a different make."
**Fix:** extended the recognized phrasing.

### 9. "Open the 3rd one" fell to the model — and it opened the wrong car (Part 3, item A)

**What happened:** numeral ordinals (1st/2nd/3rd) weren't recognized, so the
message left the safe deterministic path; the model either failed loudly or
**confidently opened the wrong vehicle** (the 4th instead of the 3rd).
**Fix:** numerals, spelled-out ordinals through tenth, and `#3`/"number 3"
all resolve through the same deterministic result-set lookup; out-of-range
positions get a bounded answer ("the current list has 9 results — pick 1–9").

### 10. "Back to the whole inventory" only half-reset (Part 3, item B)

**Fix:** reset language now covers whole/entire/full/complete + inventory
nouns. A later pass in the same session found the same shape one level down:
**filter-explicit resets** ("forget the filters", "no filters", "show me
everything", "start over") only cleared make/model, letting a $70k cap
survive — the "full" inventory came back as 1,142 vehicles instead of 1,283.
Those phrases now clear everything.

### 11. "What about a different make?" contradicted itself

**What happened:** the model asked the right clarifying question, then listed
the OLD make's results underneath its own question — sometimes, not always.
**Fix:** an unnamed make-switch is now a deterministic clarifier with no
query and no old-make grounding. The reply can't disagree with itself because
the model is never asked.

### 12. "Compare the first two" invented a model called "Compass"

**What happened:** the typo corrector rewrote the ordinary word "compare"
into the catalog model "compass" → "Nothing matches 2026 Compass". After
that was blocked, the model still confused itself, claiming the just-listed
cars "aren't in the dataset". **Fix:** the corrector never rewrites ordinary
words; comparisons of result-set positions ("compare the first two",
"compare the 1st and 3rd") resolve deterministically from the stored list and
answer with a templated, field-by-field comparison.

### 13. The selection leak (found in a real conversation, not synthetic)

**What happened:** "open the 3rd one" (a Jeep) → "any bmws less than 70k?" →
"back to the whole inventory" replied with the **Jeep's detail text,
duplicated**, instead of the reset inventory. Retry a few seconds later
worked — non-deterministic. **Why:** a scope reset cleared the filters but
never the stored _selection_ (or the result list it came from); the stale
selection leaked into the model's grounding context, and sometimes the model
narrated the old vehicle instead of the reset. **Fix:** a scope reset now
forgets the selection and the result list along with the filters, and reset
turns skip selection-grounding entirely. This one only appears as a
_sequence_ of turns — selection, filter change, reset — which is why the
scenario suite now chains state transitions instead of testing each in
isolation.

### 14. A reset could claim success while doing nothing to the UI

**What happened:** after long conversations, "back to the whole inventory"
correctly cleared server state and said "1,283 vehicles," but sometimes
emitted no `filter_inventory` action. The chips, URL, and grid therefore
stayed filtered. **Root cause:** an empty filter object did not qualify for
the deterministic presentation-action path; the route relied on the model to
choose the tool, which became inconsistent as history changed. **Fix:** full
resets now produce the verified count and empty `filter_inventory` action
deterministically. The live harness now asserts actions as well as prose.

### 15. BMW → Camry failed even though Camry → BMW worked

**What happened:** after selecting a BMW, "do you have a 2026 Camry?" answered
about "2026 BMW." **Root cause:** the extraction vocabulary was itself
filtered by the active make. With BMW active, Camry was absent from the model
vocabulary, so extraction returned only `{ year: 2026 }`. **Fix:** vocabulary
loading is tenant-wide and scope-independent; real filters are still applied
later by the tenant-scoped inventory query. As defense in depth, an explicitly
different model without a named make clears the stale make, model year, and
body class before merging.

### 16. A broad budget query inherited scope from 90+ minutes earlier

**What happened:** a fresh "do you have a 20k budget worth of cars?" inherited
`2026 Camry` from much earlier and returned a false zero. **Root cause:** the
memory TTL was 24 hours and state had no inventory freshness boundary.
**Fix:** state now records `lastInventoryActivityAt`. Broad generic price-only
queries clear old scope after 30 minutes or seven unrelated turns; immediate
refinements such as "under 40k" still inherit. This uses the existing memory
backend and TTL—no migration or new storage.

### 17. Long probes found one more stranded facet

One new 10-turn probe found `BMW + SUV` surviving into an explicit Camry
search, yielding a false "Camry SUV" zero result. An explicit model switch now
also clears the old body class. At that point, price, location, mileage,
drivetrain, and other standing preferences remained intact; price handling was
subsequently refined in item 18 below.

### 18. A price cap could survive unrelated named-vehicle searches

**What happened:** `BMW under $70k` → `2026 Camry` → `Cadillac` → a failed
`$20k` refinement → `Camry` → `BMW SUVs` returned only one SUV, even though
nine were available. The original $70k cap was no longer visible in the
visitor's request but remained in state as a so-called standing preference.
**Fix:** price minimum/maximum are now current-search facets, like make,
model, and year. A named make/model switch clears them. A visitor who wants a
budget to carry forward can say so explicitly (for example, “same budget”).
This is intentionally more predictable than applying an invisible old cap to
a different vehicle topic.

### 19. Some deterministic “show me” turns produced a blank message

**What happened:** after a model-led “go back” response, a stored-result-set
“show me” continuation entered the deterministic path with no filter action.
Its only fallback acknowledgement was therefore an empty string, so the SSE
stream completed without visible assistant text.
**Fix:** stored result-set presentation now always emits the verified
`filter_inventory` action. The deterministic response additionally has a
non-empty text fallback for action-disabled plans, so this path cannot produce
a blank visitor message.

### 20. Anonymous sessions were checked for cross-session state bleed

**Question:** a transcript grouping appeared to show a first turn inheriting
BMW/$70k filters from another session. That would be a privacy and correctness
issue if true.
**Finding:** this was session/log grouping ambiguity, not a shared anonymous
memory key. A controlled live probe sends two separate HTTP clients with no
cookies, no first-request `sessionId`, and `startNewSession:true`. The server
issues distinct UUIDs and the second client's first `filter_inventory` action
contains only its Camry filters—not BMW or `priceMax`. Conversation-state debug
records now include `conversationSessionId`, making this correlation explicit
in future logs. The reusable probe is `node scripts/concierge-session-isolation.mjs`.

### Non-concierge work landed in parallel

Several visual/UI features were also built and shipped tonight — a login page
background, a third "Bento" card layout for vehicle listings, and a carousel +
grid view for the admin's page list. These are unrelated to the concierge's
reasoning and don't affect anything above; mentioned here only for a complete
picture of tonight's session.

---

## Part 3 — What's still actually broken

**Update (later sessions, same day): items A and B are fixed**, as are the
three long-conversation state-drift failures described in fixes 14–16. Item C
remains open. The original text is kept below for the record.

You pasted a real conversation after the fixes above shipped, and it surfaced
**two more gaps of the exact same shape** — narrow phrase-recognition, not a
different kind of bug:

### A. "Open the 3rd one" fails; "open the first one" works

The ordinal-recognizer only knows spelled-out words (first, second, third,
last) — not numerals (1st, 2nd, 3rd). "3rd" wasn't recognized, so instead of
using the safe, verified Layer 2/3 path, the message fell through to the AI
model, which tried to resolve "the 3rd one" itself and failed, producing "I'm
unable to open that vehicle's detail page because the vehicle ID could not be
verified." This is a direct, live demonstration of the core risk described in
Part 1: when the deterministic layer doesn't recognize something, the AI is
left to improvise, and improvising with real vehicle identity is exactly what
we don't want it doing.

### B. "Back to the whole inventory, no filters" only half-worked

"Whole" isn't recognized as a synonym for "all" (same root cause as fix #8,
just a phrasing the fix didn't cover). The word "no" in "no filters"
accidentally tripped a _different_, weaker rule (meant for things like "not
Toyota") that only clears make/model — not price. So the $70,000 cap from many
messages earlier silently survived, and "the whole inventory" came back
smaller than it should have (1,142 instead of the real 1,283). When you then
told the concierge the number was wrong, it had no way to understand that as
a correction — it just repeated the same stale answer twice, verbatim.

**Both of these are the same underlying issue: a fixed list of recognized
phrases can never cover every way a real person phrases something.**

### C. A different kind of gap: invented-sounding claims

Separately (found earlier tonight, not from your last transcript): when you
asked "any cheaper ones?", no deterministic rule matched, so it went to the AI
— which answered with things like _"priced 10% below comparable listings"_ and
_"near-current model year"_. Nothing in our real data supports those specific
claims; the model said something that sounds authoritative but isn't checked
against anything. This is a genuinely different problem from A/B — it's not
about recognizing the _request_, it's about the AI's free-form _answer_ not
being fact-checked against real data before it's shown to a visitor.

---

## Part 4 — The decision on the table

You pushed back on the whole approach tonight, correctly: **a fixed list of
recognized phrases will always be a step behind how people actually talk.**
That's the real, permanent limitation of everything in Part 1's Layer 1 — it's
not a bug to patch, it's the nature of the technique.

The question is what to do about it. Two things are getting conflated and
should be pulled apart, because they need opposite answers:

**"Which car is #3?" is not a language problem.** It's a lookup into a list we
already have. The AI doesn't have privileged access to what's on the
visitor's screen — asking it to resolve this itself is _strictly worse_ than
a rule, because a rule is 100% consistent and testable, and the AI proved
tonight (issue A) that it can get this wrong. This part should **stay
deterministic, always** — the fix here is just widening what the rule
recognizes (numerals, not just words), not replacing the rule.

**"Does this message mean 'start over'?" genuinely is a language problem.**
People will phrase this a hundred different ways forever, and a growing list
of hardcoded synonyms is a losing game — which is exactly what issue B just
demonstrated. This is the part where AI's actual strength (flexible language
understanding) is the right tool.

**My recommendation:** split them.

- Keep the free, instant rule-based layer for the common phrasings (most
  messages should still cost nothing and respond instantly).
- For the specific, narrow question of _"what is the visitor's intent"_ (reset?
  which position in the list? which filter changed?) — when the rules don't
  confidently recognize it — add one small, cheap AI call whose **only** job is
  to output a strict, limited answer (e.g. "this is a reset" or "this means
  position 3"), never a vehicle ID, never a database query, never free text.
  Code then takes that label and does the real, verified lookup — same
  guarantee as today, just fed by a smarter recognizer instead of a fixed
  phrase list.
- This does **not** mean "let the AI write code" or "let the AI query the
  database directly" — that would reintroduce exactly the risk this whole
  architecture exists to avoid (issue A, at a larger scale, plus real security
  exposure). The AI's job stays narrow: label the intent. Code's job stays the
  same: verify and execute.

This is a genuine architecture change (bigger than tonight's patches), not a
quick fix — worth deciding deliberately rather than diving in.

Separately, issue C (invented-sounding claims) is closer to what your earlier
"confidence-gated verification" idea was aimed at — a check on the AI's
_answer_, not its recognition of the _request_. That's a different mechanism
from the one above and can be considered independently.

---

## Appendix — How we've been finding and verifying these bugs

For reference, since you may want to keep testing this way yourself: the admin
server can be run locally with `LUME_CHAT_DEBUG=1`, which logs (to the server
console) the exact filters extracted each turn, the before/after state, the
real verified vehicle list, inventory-activity timestamps, emitted/dropped
actions, and which internal rule fired — without exposing any of that to the
visitor. Every fix above was verified by re-running the exact failing sequence
through the public Vite proxy and real chat route. The suite now contains 55
live scenarios, including five additional 10-turn reset/make-switch/ordinal
probes.
