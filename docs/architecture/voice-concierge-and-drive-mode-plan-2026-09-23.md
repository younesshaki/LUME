# Voice Input and Drive Mode — Implementation Plan

- **Date:** 2026-09-23 (revised same day: voice **input only**)
- **Status:** proposed; not started. Written against `origin/main` @ `2e89ece`.
- **Scope:** speaking to the public concierge and the admin concierge, plus
  **Drive mode** — the public concierge taking the wheel and browsing the
  dealership site for the visitor.
- **Decided out of scope:** voice **output**. The concierge answers in text, as
  it does today. Also out: new text LLM providers, RAG changes, a 3D avatar
  (`docs/parked/concierge-robot.md`), native mobile.

## 1. The decision in one paragraph

Voice is a new **way to type**. It is not a new brain. The spoken sentence
becomes text, that text is sent as an ordinary chat message through the same
`/api/chat` pipeline that is live today (deterministic rules first, grounding,
entitlements, turn sequencing, the duplicate-turn lease, telemetry), and the
reply appears as text exactly as it does now. "Taking the wheel" is a separate
capability, **Drive mode**, which lets the server return a short, fully grounded
*tour* — a sequence of steps built only from actions we already trust — that
the browser plays back step by step, with an on-screen caption for each step.
Every guarantee the concierge has today survives, because neither voice nor
Drive mode can decide anything the text concierge could not.

## 2. What exists today (verified on `main`)

| Area | Where | What it gives us |
|---|---|---|
| Chat transport | `src/lib/deepseekService.ts` | SSE stream with `meta`, deltas, `action`, `thinking`, `duplicate`; client `requestId` |
| Turn ownership | `src/lib/chatTurnSequencer.ts` | Only the current turn may act; abort revokes authority |
| Action execution | `src/lib/botActionBus.ts`, `src/App.tsx:357-445` | Consumers for `navigate`, `navigate-target`, `highlight-vehicle`, `filter_inventory`, `compare_vehicles`, `open-lead-form` |
| Targets | `src/lib/conciergeTargetRuntime.ts` | Cross-route actions wait for the destination to mount; allowlisted anchors only |
| Action types | `packages/types/src/bot-actions.ts` | Closed union of 8 actions |
| Server pipeline | `apps/admin/app/api/chat/route.ts` + `chatDeterministicRules.ts`, `chatAnswers.ts` | Deterministic answers rendered from DB rows; model only as fallback |
| Interpretation | `apps/admin/lib/chatInterpretation.ts` | Closed Phase 3 intent schema, shadow/canary |
| Admin concierge | `apps/admin/components/admin-concierge-panel.tsx`, `/api/admin/concierge` | Navigate, search, propose; writes need a **Confirm change** click |
| Plans | `packages/types/src/plans.ts` | `chat.actions`, `chat.premium_models` entitlements |
| Model access | `apps/admin/lib/conciergeModels.ts` | Vercel AI Gateway profiles already in use |
| Telemetry | `apps/admin/lib/observability.ts`, `apps/admin/lib/posthog.server.ts`, `src/lib/posthog.ts` | Per-turn record + PostHog operational and training events |

**Gaps this plan must close — each confirmed in the code:**

1. **The microphone is disabled on the public site.** `vercel.json` sends
   `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Any
   `getUserMedia` call fails. This is the first line to change.
2. **The concierge cannot move within a page.** `scroll-to` exists in the type
   union but has **no consumer** in the app. `highlight-vehicle` does not
   highlight anything; it navigates to the detail page.
3. **There is nothing to point at.** The vehicle detail page exposes one stable
   anchor (`vehicle-inquiry-title`). A guided tour needs named sections:
   gallery, price, key specs, features, finance, inquiry.
4. **Actions fire all at once.** A turn's actions are dispatched as they arrive.
   There is no sequencing or pacing — the core of "taking the wheel".
5. **No voice code exists anywhere**, and the `ai` package is not installed.

## 3. Architecture

### 3.1 Why not a speech-to-speech "realtime agent"

The Gateway lists nine realtime voice models (for example
`openai/gpt-realtime-2.1`, `google/gemini-3.8-live`). They decide for
themselves what to do and which tools to call, turn by turn. That hands the
steering wheel to the model — exactly what the deterministic-first design
exists to prevent — and the documented failure class ("open the 3rd one"
opened the 4th car) would come back. With input-only voice they are also
unnecessary: we only need speech turned into text.

### 3.2 The design

```text
Visitor holds the mic button and speaks
  → browser mic (AudioWorklet, 16 kHz PCM)
  → WebSocket /api/voice/stream  (auth, entitlement, quota, 30 s cap)
      → experimental_streamTranscribe via AI Gateway, with tenant keyterms
      ← interim transcript (shown live in the input box) + final transcript
  → final transcript sent as the visitor's chat message
  → existing streamChat(messages, …, requestId)        ← unchanged pipeline
      ← meta, text deltas, actions, and new: tour
  → reply appears as text; Drive mode executor plays any tour
Visitor speaks again mid-turn → the new turn supersedes the old one
```

Three properties matter:

- **The transcript is a normal chat message.** Everything downstream is code
  that is already tested. Voice adds no new decision path.
- **The server mediates audio.** Provider keys stay server-side, and we can
  enforce entitlement, quota, rate limits and a maximum utterance length, and
  inject tenant vocabulary. Audio passes through and is **never stored**.
- **The visitor sees what was heard before it matters.** The live transcript
  fills the input box while they speak, so a mis-hearing is visible
  immediately.

### 3.3 Provider path

The AI SDK documents **streaming transcription through the AI Gateway**
(`experimental_streamTranscribe`, experimental), which LUME already uses for
text. Speech-to-text models the Gateway lists today (2026-09-23; re-check at
spike time):

| Candidate | Price (Gateway list) | Why it's a candidate |
|---|---|---|
| `spacexai/grok-stt` | ~$0.0017/min | **Supports `keyterm` boosting**, interim results, endpointing |
| `openai/gpt-realtime-whisper` | ~$0.017/min | Low-delay streaming mode |
| `google/gemini-3.5-transcribe-live` | ~$0.009/min | Live transcription |

**Keyterm boosting is the most important selection criterion.** The July
2026 handoff deprioritised voice precisely because speech-to-text gets makes,
trims and ordinals wrong, which is exactly what the concierge depends on. The
tenant's make and model vocabulary is already loaded every turn
(`vehicle_facets_v2`), so the voice session can pass the top ~100 terms
("Camry", "X5", "Porsche", "Cayenne") as keyterms. That is the mitigation, and
it is measured in the spike, not assumed.

A Vercel Marketplace speech provider may also fit. The local Vercel CLI is too
old (52.0.0) to run `vercel integration discover`, so availability was not
checked. Do it in the spike after `npm i -g vercel@latest`.

### 3.4 Transport

- **Recommended:** a WebSocket route (`/api/voice/stream`). Vercel Functions
  support WebSockets on Fluid Compute; in Next.js this is
  `experimental_upgradeWebSocket()` from `@vercel/functions`. Verify against
  the installed version before building.
- **Fallback:** record the utterance in the browser and `POST` it whole to a
  batch transcription route when the button is released. Slower (no live
  transcript), simpler, and a safe plan B if WebSockets misbehave. With
  push-to-talk and short utterances the latency difference is modest, so this
  fallback is a genuinely viable first version.
- **Not recommended:** the browser's built-in `SpeechRecognition`. Firefox
  lacks it, Safari is inconsistent, Chrome sends audio to Google outside our
  control, and it offers no keyterm boosting.

## 4. Drive mode — the concierge takes the wheel

### 4.1 What the visitor experiences

> *Visitor says:* "Show me your SUVs under forty grand."
>
> The inventory filters. A caption reads *"Nine SUVs under $40,000. Here are
> the top three."* The first card is softly spotlit with its facts beneath it —
> *"2022 BMW X5 · 62,000 miles · $38,900"* — then the second, then the third.
> The chat offers: *"Want me to open the X5?"*
>
> *Visitor says:* "Yes, show me."
>
> The detail page opens. The gallery advances. The price is spotlit, then the
> key specs, then the finance calculator, each with a one-line caption. The
> chat ends with *"I can book a test drive if you'd like."*

At any moment the visitor can tap anything, scroll, press the Stop bar, or say
"stop" — and the concierge lets go immediately.

### 4.2 The tour contract

A tour is **one new action type**, built only from steps the system already
trusts plus three presentational steps:

```ts
type BotTourAction = {
  type: "tour";
  tourId: string;              // server-issued, tied to the turn
  steps: BotTourStep[];        // hard cap: 6
};

type BotTourStep =
  | { kind: "act"; action: TourSafeAction; caption?: string }   // existing actions
  | { kind: "spotlight"; anchor: ConciergeAnchorId; caption?: string }
  | { kind: "gallery"; vehicleId: string; imageIndex: number; caption?: string }
  | { kind: "pause"; ms: number };                              // ≤ 1500

// Never a tour step: capture_lead, schedule_*, or another tour.
type TourSafeAction =
  | BotInventoryFilterAction | BotNavigateTargetAction
  | BotHighlightVehicleAction | BotCompareVehiclesAction;
```

Rules — enforced on the server, then **again** in the browser:

- Every vehicle id is grounded exactly as actions are today (current result
  set, tenant-scoped, live status).
- Anchors come from a **closed allowlist** (`packages/types/src/conciergeAnchors.ts`),
  never a CSS selector. Same principle as the concierge target registry: the
  server names a registered thing; it never points at arbitrary DOM.
- No step can submit a lead, book an appointment, or mutate data. A tour can
  *open* the lead form as its final step. Submitting stays the visitor's act.
- Captions that state facts (price, mileage, count) are **rendered from
  database rows**, like the existing deterministic answers. A model never
  writes a number that appears in a caption.

### 4.3 Who writes the tour

Tours are deterministic templates in a new pure module,
`apps/admin/lib/chatTours.ts`, next to `chatAnswers.ts`:

| Template | Trigger | Steps |
|---|---|---|
| **Inventory tour** | A search that returned results, in Drive mode | filter → spotlight cards 1–3 with templated facts → offer |
| **Vehicle tour** | "show me around this one", "tell me about the X5" | open detail → gallery → price → key specs → finance → inquiry CTA |
| **Compare tour** | "compare the first two" | open compare → spotlight differences |

Initial triggers are explicit phrases ("show me around", "walk me through",
"take me through") handled by the deterministic layer. The Phase 3
interpreter can later add a `tour` intent kind. The model may **choose a
template**; it may never compose steps.

### 4.4 The executor in the browser

A new state machine, `src/lib/conciergeDriver.ts`:

`idle → driving(step n) → paused → done | yielded`

- **Owned by the turn.** The tour belongs to its `requestId`. If the turn is
  superseded or aborted (`chatTurnSequencer`), the tour stops. This reuses the
  guarantee that already stops stale actions.
- **Waits for the page.** Cross-route steps reuse the pending-after-mount
  mechanism in `conciergeTargetRuntime.ts`. A spotlight waits (with a timeout)
  for its anchor to register and become visible. A missing anchor skips the
  step; it does not guess.
- **Paces for reading.** Run the step, show its caption, and advance after a
  reading-time estimate (words per minute, clamped to a minimum and maximum
  dwell). A "Next" control and the spoken word "next" skip ahead.
- **Yields instantly.** Any pointer, wheel, touch or key event outside the chat
  panel ends the tour with a quiet "You're in control". A visible
  *"LUME is showing you around — Stop"* bar stays up while it drives.
- **Respects reduced motion.** No smooth scrolling, shorter dwell, spotlight
  without animation.
- **Local voice commands.** "Stop", "pause", "next", "go back" spoken during a
  tour are handled in the browser. They are instant, free, and never reach the
  concierge.

### 4.5 Anchors to add

`useConciergeAnchor(id)` registers an element. The initial allowlist:

- Inventory: `inventory.results`, `inventory.card:<vehicleId>` (card position
  is resolved from the grounded result set).
- Vehicle detail: `vdp.gallery`, `vdp.price`, `vdp.keySpecs`, `vdp.features`,
  `vdp.finance`, `vdp.inquiry`.
- Page-builder blocks later, per block type.

Implement the dormant `scroll-to` consumer against the same allowlist while
this is being built.

**Drive mode does not depend on voice.** "Show me around" typed into the chat
drives the site too. Build it so; it ships and demos independently.

## 5. Safety and trust rules specific to voice

1. **A spoken email or phone number is never submitted as heard.** If contact
   details come from a voice transcript, show a confirm card with the
   transcribed values, editable, and require a tap. Transcription of email
   addresses is unreliable, and the existing rule ("contact must appear in a
   real visitor message") cannot catch a mis-heard one.
2. **Admin writes stay click-only.** A spoken "yes" or "confirm" never executes
   an admin command. The blueprint (`concierge-operator-accuracy-blueprint-2026-07-27.md`)
   already forbids a natural-language "yes" when more than one plan is pending
   or the plan changed; voice goes further and forbids it outright, because a
   mis-heard or overheard "yes" is a new way to confirm by accident.
3. **Low-confidence entities are echoed back.** If the key entity in a
   transcript has low confidence, the deterministic layer asks ("Did you say
   Camry?") rather than searching on a guess.
4. **Audio is never stored and never sent to PostHog.** Transcripts follow the
   existing training-capture policy, so the **SD-004 revisit condition now also
   covers voice**: when the first real dealership onboards, voice transcripts
   stop being the owner's data. Add SD-006 for visitor audio sent to a US
   processor through the Gateway.
5. **Microphone use is explained on first use.** A short line before the
   browser prompt: what is sent, that audio is not kept.
6. **Cost abuse is capped.** 30-second utterance limit, per-session and per-IP
   rate limits (reuse `checkChatRateLimit` with a `voice:` keyspace), and a
   per-tenant `voice_seconds` quota through `quota.server.ts`.

## 6. Latency and cost

**Latency targets** (to be measured, not assumed):

| Stage | Target |
|---|---|
| Button released → final transcript | 300–500 ms streaming; ~0.8–1.5 s with the batch fallback |
| Deterministic turn, server | ≤ 750 ms p95 (existing target) |
| **Button released → reply visible, deterministic turn** | **~1–1.3 s** (streaming) |
| Same, model turn | ~2–3.5 s, with the existing "thinking" indicator |

**Cost per 10-turn voice conversation** (8 s of speech per turn, Gateway list
prices), on top of today's text cost:

| Model | Cost |
|---|---|
| `spacexai/grok-stt` | ~$0.002 |
| `google/gemini-3.5-transcribe-live` | ~$0.012 |
| `openai/gpt-realtime-whisper` | ~$0.023 |

That is roughly **$2–23 per 1,000 voice conversations** — small next to the
model cost of the replies. Dropping voice output removed about 80–95% of the
cost in the original plan. It should still be capped, because an uncapped
microphone is an open meter.

## 7. Plans and entitlements

- Add `chat.voice` to `PLAN_FEATURES` (recommend Pro and Ultra, matching
  `chat.actions`, since Drive mode needs actions).
- The `meta` event gains `capabilities.voice`. The mic button renders only when
  it is true. Enforcement stays server-side in the voice route.
- Rollout flags mirror the shadow-interpreter pattern: `CONCIERGE_VOICE_ENABLED`
  plus a tenant allowlist, so enabling an environment cannot switch voice on for
  every tenant at once.

## 8. Telemetry and evaluation

**Telemetry.** Extend `recordConciergeTurn` with `inputMode: "text" | "voice"`,
speech-to-text latency and model, transcript confidence band, tour steps run
versus yielded, and takeover events. PostHog gets operational
`lume_concierge_voice_*` and `lume_concierge_tour_*` events. **No audio ever.**

**Evaluation gate.** Build a voice gold set from the existing
`apps/admin/lib/chatInterpretationGoldSet.ts`:

1. Generate audio for each phrase in 2–3 synthetic voices and accents, clean
   and with background noise, plus a small set of real recordings. (Synthetic
   voices are used only to *produce test audio*; nothing is spoken to visitors.)
2. Run audio → speech-to-text (with and without keyterms) → the existing
   pipeline.
3. Report, **with denominators**: entity accuracy (makes, models, numbers,
   ordinals), end-to-end intent match, and latency distribution.
4. Voice leaves the allowlist only when entity accuracy with keyterms clears an
   agreed threshold (proposal: ≥ 95% on held-out conversations).

**Tests.**

- Unit: driver state machine, anchor allowlist, tour grounding, reading-time
  pacing, local voice commands, keyterm selection from facets.
- Route contract: tours contain no lead or booking steps; the voice route
  enforces entitlement, quota and the utterance cap.
- Browser: extend `e2e/concierge/` with mocked SSE tours — a tour plays in
  order; a scroll or tap yields; a superseded turn stops its tour; reduced
  motion. Chromium's `--use-fake-device-for-media-stream` and
  `--use-file-for-fake-audio-capture` let Playwright drive the real mic path
  with a recorded file.

## 9. Delivery plan

Estimates are full-time-equivalent weeks, solo with AI assistance.

| Phase | What | Weeks |
|---|---|---|
| **V0 — Foundations and spike** | Permissions-Policy fix. Install `ai` (and `@vercel/functions` if streaming) with approval. Benchmark 2–3 speech-to-text models on gold-set audio with and without keyterms; prove the WebSocket route on a preview, or choose the batch fallback. Output: a decision record. | 1 |
| **V1 — Voice input (public)** | Push-to-talk mic in the chat, live transcript in the input box, contact confirm card, entitlement, quota, rate limits, telemetry. Behind flag and allowlist. | 1.5–2.5 |
| **V2 — Drive mode** | Anchor registry and anchors on inventory and vehicle detail; `scroll-to`, spotlight and gallery consumers; the `tour` action; `chatTours.ts` templates; executor with captions and take-back-control; browser tests. Works for typed requests too. | 3–5 |
| **V3 — Admin voice input** | Push-to-talk in the Ask LUME panel; navigation, search and proposals by voice; writes stay click-only. | 1 |
| **V4 — Optional** | Hands-free (always-listening with voice-activity detection), more languages only if the product claims them, and voice output if it is ever wanted. | — |

**Core path: roughly 6.5–9.5 weeks.** V1 and V2 touch disjoint files (voice in
`src/lib/voice/*` and the chat panel; Drive mode in `App.tsx` consumers,
`conciergeDriver.ts` and `chatTours.ts`), so they fit the existing two-lane
Claude/Codex workflow and can run in parallel after V0.

## 10. File map

New:

- `apps/admin/app/api/voice/stream/route.ts` — speech-to-text (WebSocket, or batch `POST` for the fallback)
- `apps/admin/lib/voice/` — keyterms from facets, voice quota
- `apps/admin/lib/chatTours.ts` (+ tests) — tour templates
- `packages/types/src/conciergeAnchors.ts` — anchor allowlist
- `src/lib/voice/` — mic capture, transcript client, local voice commands
- `src/lib/conciergeDriver.ts` (+ tests) — tour executor
- `src/lib/useConciergeAnchor.ts` — anchor registration
- `e2e/concierge/voice-drive.spec.ts`

Changed:

- `vercel.json` — `microphone=()` → `microphone=(self)`
- `packages/types/src/bot-actions.ts` — `tour` action, step types
- `packages/types/src/plans.ts` — `chat.voice`
- `apps/admin/app/api/chat/route.ts` — tours, voice capability in `meta`
- `src/App.tsx` — `tour` and `scroll-to` consumers
- `src/components/chat/OllamaChat.tsx` — mic button, live transcript, driving bar
- Vehicle detail and inventory components — register anchors
- `apps/admin/components/admin-concierge-panel.tsx` — push-to-talk
- `apps/admin/lib/observability.ts` — voice and tour fields
- `docs/security/security-debt.md` — SD-006

## 11. Risks

| Risk | Mitigation |
|---|---|
| Speech-to-text mis-hears makes, trims, numbers, ordinals (the July reason for deferring) | Keyterms from tenant facets; live transcript the visitor can see; low-confidence echo-back; gold-set gate before wider rollout |
| The concierge fights the visitor for control | Yield on any input, visible Stop, local "stop" command, tours capped at six steps |
| Microphone permission friction, especially iOS Safari | Ask only on the first mic tap, with a one-line explanation; text input always remains |
| Cost abuse of the voice route | Entitlement, quota, rate limits, 30-second cap |
| Hallucinated tours | Closed step set, server grounding, anchors from an allowlist, templated captions |
| Multi-instance memory | Upstash is still unprovisioned in every environment. Voice makes rapid follow-up turns more common, which raises the value of provisioning it. |
| New dependencies and experimental APIs | `experimental_streamTranscribe` may change; pin the version and keep the batch fallback |

## 12. Decisions needed from the owner

Already decided: **voice input only; no voice output.**

1. **Push-to-talk first** (recommended) or hands-free from the start.
2. **Speech-to-text model**, after the V0 benchmark. All current candidates are
   US processors reached through the Gateway.
3. **Streaming with a live transcript, or the simpler batch version first.**
   Recommended: let the V0 spike decide; batch is an acceptable first release.
4. **`chat.voice` on Pro and Ultra** (recommended) or all plans.
5. **A per-tenant voice budget** (seconds per month).
6. **Drive mode for typed requests too** (recommended — it ships and demos
   without voice).
7. **English only** for the first release (recommended — it is all the product
   claims today).

## 13. Why this is worth it now

The July deferral was about risk (speech-to-text errors on exactly the
entities the concierge relies on) and opportunity cost before the first
customer. The risk is now addressable — keyterm boosting through the Gateway,
a live transcript the visitor can see, and a gold set to measure it — and it is
gated, not assumed away. Input-only voice also keeps the cost to a few dollars
per thousand conversations. The opportunity-cost argument is a product call.
One thing works in favour: a concierge you can talk to that then walks you
through the lot is the most demonstrable thing LUME could show, which suits a
plan built on online content and demos.
