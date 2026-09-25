# Public Concierge Action Capabilities

The single list of what the public concierge can actually do on a dealer's
site, and the rules for adding to it. The machine-readable source of truth is
`packages/types/src/conciergeActionCapabilities.ts`;
`apps/admin/lib/conciergeActionCapabilities.test.ts` fails the build when this
document's rules are broken.

Companion document: [concierge-target-registry.md](concierge-target-registry.md)
(which destinations a tenant enables).

## The bar for a live action

A type may be live only when all of the following hold:

1. It is a member of the closed `BotAction` union.
2. The chat server validates and authorizes it: plan (`chat.actions`), persona
   capability, tenant targets, and grounding.
3. The public site has a real consumer for it (`useBotAction` in `src/App.tsx`,
   or `LeadCaptureBridge` for `capture_lead`).
4. It has a safe outcome when the browser's context is incomplete.
5. Unit tests, route tests (`*.route.test.ts`) and browser tests
   (`e2e/concierge/`) cover it.
6. The model cannot claim it happened unless it was emitted.
7. Stale-turn suppression applies to it (`chatTurnSequencer`).

These are enforced in code:

- The registry is typed `satisfies Record<BotAction["type"], …>`, so a new union
  member without an entry is a compile error.
- The persona gate (`ACTION_SHAPES` in `chatPersona.ts`) is keyed by the same
  union.
- The contract test checks three things: every live type has a browser
  consumer and a browser validator case; retired and deferred types are
  rejected by both validators; and no server-only, retired or deferred type is
  ever advertised to the model.

## Live actions (2026-09-24)

| Action | Origin | Browser consumer | Safe outcome when context is missing |
|---|---|---|---|
| `filter_inventory` | server or model | App router → `/vehicles` URL state | Unrecognised facets are dropped; the inventory opens unfiltered |
| `navigate` | server or model (legacy, not advertised) | App router | Only the public route allowlist resolves; anything else is ignored |
| `navigate-target` | server or model | App router + target runtime | Only an enabled tenant target with a server-attached descriptor resolves |
| `highlight-vehicle` | server or model (legacy, not advertised) | App router → vehicle detail page | Dropped server-side unless the vehicle is grounded this turn |
| `compare_vehicles` | server or model (tool) | App router → comparison | Fewer than two grounded vehicles opens nothing |
| `open-lead-form` | server or model (not advertised) | App router → contact form | Opens with only the allowlisted prefill fields |
| `capture_lead` | server or model | `LeadCaptureBridge` | Dropped unless the email or phone appears in a visitor message |
| **`navigate-back`** | **server only** | App router + `src/lib/inAppHistory.ts` | In-app history, then the server-grounded results, else nothing |

"Server only" means deterministic server rules are the sole origin. Model or
tool output of that type is discarded (`filterModelNavigationActionsByUserIntent`),
it is never shown to the model (`advertise: false`), and `/api/bot-actions`
refuses it.

## `navigate-back` — the safe back-navigation contract

This fixes a confirmed production failure. A visitor opened a vehicle from a
filtered result set and said "go back". The chat replied "Done — I've sent you
back." while emitting `actions: []`, so nothing moved.

**Recognition** (`apps/admin/lib/chatBackNavigation.ts`) matches whole
messages only. For example:

- "go back", "take me back", "previous page", "back to where I was" →
  `destination: "previous"`.
- "return to the results", "back to the cars", "back to my search results" →
  `destination: "results"`.

Any text an inventory-reset rule claims is refused first. "Back to full
inventory", "show all inventory" and "clear my filters" keep their existing
meaning: `filter_inventory` with the filters cleared. "Go back to BMWs" is a
new search.

**Server decision.** A back request is answered by the back rule alone. No
ordinal, filter, interpreter or registry navigation rides along with it, and
no model is called.

| Situation | Action | Reply |
|---|---|---|
| Browser reports in-app history for the destination | `navigate-back` (+ fallback if any) | "Taking you back to the previous page." / "…to your results." |
| No history, but the conversation has a verified result set, and the visitor isn't already on the results page | `navigate-back` with that result set as `fallback` | "Taking you back to your results." |
| "Back to the results" while on the results page | none | "You're already on the results page." |
| Neither | none | "There isn't an earlier page on this site to take you back to…" |
| Plan or persona removed the action | none | "I can't move around the site for you here, but your browser's back button…" |

The reply is derived from the actions that survived every gate, so it can't
describe a move that was filtered out. The fallback is built from
`conversationState.resultSet.filtersApplied`, which is server state. It is
withheld while shared memory is degraded, because in that state the stored
result set may not belong to this visitor.

**What the browser sends.** `navigation: { hasPrevious, hasResults }` is two
booleans read from the in-app history, and never a path. The server only uses
them to pick the wording. A crafted value like `"true"` counts as false.

**What the action carries.** `destination` and an optional `fallback` that
must itself validate as a `filter_inventory`. It never carries a URL, path,
route or history index. Both validators reject anything else.

**Browser execution** (`useBotAction("navigate-back")` in `src/App.tsx`):

1. **Destination.** `resolveBackNavigationTarget` looks in the tab's same-origin
   in-app history for the previous page (`previous`) or the most recent
   `/vehicles` results page (`results`). If it finds one, it router-navigates
   to that recorded path.
2. **Fallback.** If there's no history, it opens the server's `fallback` via
   the existing `filter_inventory` route.
3. **Neither.** It does nothing.

It never calls `window.history.back()` or `navigate(-1)`, and it never uses
`history.length`. The browser's previous entry may be another site;
`e2e/concierge/navigate-back.spec.ts` proves that a real non-LUME previous
entry is never visited.

**The in-app history** (`src/lib/inAppHistory.ts`):

- **What it records.** Only paths the public router rendered, keyed by
  react-router's per-entry `location.key`.
- **Browser back/forward and reloads.** A back/forward (POP) navigation
  truncates the history to the entry it returned to. A reload re-keys the
  current entry instead of adding a duplicate.
- **Concierge returns.** A return triggered by the concierge collapses the
  history instead of growing it.
- **Excluded paths.** Admin and preview paths, protocol-relative paths,
  absolute URLs and control characters are never recorded or restored.
- **Storage.** The history is kept in `sessionStorage`, so a reload keeps it.
  It starts empty on a fresh arrival from another origin, even though
  `sessionStorage` survives a same-tab round trip.

**Staleness.** `navigate-back` passes through the same turn sequencer as every
action. A superseded or aborted turn's `navigate-back` can't move the page
(browser test: "a superseded turn's navigate-back cannot move the page").

**Future semantic router.** A bounded intent such as `{ kind: "back" }` can
compile into the same `detectBackNavigationRequest` result. The router must
never choose a route, history entry, URL, vehicle ID, selector or target key;
the server and browser rules above do that.

## Truthful replies

`apps/admin/lib/chatActionClaims.ts` stops the model claiming a site action
that didn't happen. When a model turn emits **no** actions and its prose claims
the page was moved or changed, the guard steps in. Examples of such claims:
"I've sent you back", "Taking you there", "I've opened the … page", "I've
applied the filters", "You're now on the …".

- **Single-call path:** the whole reply is replaced with
  `NO_ACTION_TRUTHFUL_REPLY`. The false claim taints the rest of the text.
- **Streamed tool path:** already-sent text can't be recalled, so
  `NO_ACTION_TRUTHFUL_CORRECTION` is appended before `[DONE]`. The correction
  is also what conversation memory stores.
- **Telemetry:** each case is recorded as a rule code
  (`false_action_claim_replaced` / `false_action_claim_corrected`).

Answers that list or describe vehicles aren't site actions and are untouched.

## Retired: `scroll-to`

It was declared, advertised to the model and accepted by both validators, yet
nothing in the browser consumed it. So it was a silent no-op the model could
claim to have performed. A free-form `sectionId` also can't be validated
against anything a tenant registered.

- **Replacement:** safe section scrolling already exists. Use `navigate-target`
  with a tenant-registered `section-anchor` target. It gives allowlisted IDs,
  reduced-motion support and focus management.
- **What changed:** `scroll-to` is removed from `BotAction`, from the persona
  gate (so it's never advertised or authorized), and from both validators.
- **Legacy model output:** a `scroll-to` JSON line is recognized only so it can
  be hidden from the visitor. It is never executed.

## Deferred: `schedule_appointment`, `schedule_test_drive`

Both are typed in `bot-actions.ts` but deliberately kept out of `BotAction`.

- **What exists today:**
  - Booking intent ("book a test drive") opens the tenant's `vehicle-inquiry`
    target.
  - The `TestDriveBooking` page block creates `source: "test-drive"` leads
    through its own form.
  - A tenant can expose that block as a `navigate-target`.
- **What's missing:** a chat-native booking action would need a public flow
  that collects a date and time with explicit visitor confirmation and creates
  a tenant-scoped, attributed appointment. That flow does not exist.
- **Known gap:** the persona admin screen still shows a `scheduleAppointment`
  capability toggle. No action honours it. Hide or relabel it in the next admin
  pass.
