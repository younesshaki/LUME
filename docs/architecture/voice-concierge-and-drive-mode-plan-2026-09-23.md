# Voice Concierge and Drive Mode — Implementation Plan

- **Date:** 2026-09-23
- **Status:** proposed; not started. Written against `origin/main` @ `2e89ece`.
- **Scope:** voice input and output for the public concierge and the admin
  concierge, plus **Drive mode** — the public concierge taking the wheel and
  browsing the dealership site for the visitor.
- **Out of scope:** new LLM providers for text, RAG changes, a 3D avatar
  (see `docs/parked/concierge-robot.md`), native mobile.

## 1. The decision in one paragraph

Voice is a new **input and output channel** onto the concierge that already
exists. It is not a new brain. The spoken sentence becomes text, the text goes
through the same `/api/chat` pipeline that is live today (deterministic rules
first, grounding, entitlements, turn sequencing, the duplicate-turn lease,
telemetry), and the reply comes back as text that we also speak. "Taking the
wheel" is a separate capability, **Drive mode**, which lets the server return a
short, fully grounded *tour* — a sequence of steps built only from actions we
already trust — that the browser plays back while the concierge narrates it.
Every guarantee the concierge has today survives, because neither voice nor
Drive mode is allowed to decide anything the text concierge could not.

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
   anchor (`vehicle-inquiry-title`). A narrated tour needs named sections:
   gallery, price, key specs, features, finance, inquiry.
4. **Actions fire all at once.** A turn's actions are dispatched as they arrive.
   There is no sequencing, pacing, or narration sync — the core of "taking the
   wheel".
5. **No voice code exists anywhere**, and the `ai` package is not installed.

## 3. Architecture

### 3.1 Why not a speech-to-speech "realtime agent"

The Gateway lists nine realtime voice models (for example
`openai/gpt-realtime-2.1`, `google/gemini-3.8-live`). They are impressive, and
they are the wrong brain for LUME. A realtime agent decides for itself what to
say and which tools to call, turn by turn, in audio. That hands the steering
wheel to the model — exactly what the deterministic-first design exists to
prevent. The documented failure class ("open the 3rd one" opened the 4th car)
would come back, now with no transcript in the middle to ground against.

A realtime model could be revisited later purely as a *transport* (low-latency
audio in and out) wrapped around the existing pipeline. It must never be the
thing choosing actions.

### 3.2 The cascaded design

```text
Visitor speaks
  → browser mic (AudioWorklet, 16 kHz PCM) + voice-activity detection
  → WebSocket /api/voice/stream  (auth, entitlement, quota, 30 s cap)
      → experimental_streamTranscribe via AI Gateway, with tenant keyterms
      ← interim + final transcript
  → final transcript shown in the chat as the visitor's message
  → existing streamChat(messages, …, requestId)          ← unchanged pipeline
      ← meta, text deltas, actions, and new: speech tokens, tour
  → Drive mode executor plays the tour, step by step
  → sentence-by-sentence speech via POST /api/voice/speech
  → speaker
Visitor speaks again mid-reply → audio stops, tour yields, new turn supersedes
```

Three properties matter:

- **The transcript is a normal chat message.** Everything downstream is the
  code that is already tested. Voice adds no new decision path.
- **The server mediates audio.** Provider keys stay server-side, and we can
  enforce entitlement, quota, rate limits and a maximum utterance length, and
  inject tenant vocabulary. Audio passes through and is **never stored**.
- **Speech output is sentence-chunked.** The AI SDK's speech API returns whole
  audio per call (no streaming as of the current docs), so first-word latency
  depends on synthesising the first sentence alone, not the whole reply.

### 3.3 Provider path

The AI SDK documents **streaming transcription through the AI Gateway**
(`experimental_streamTranscribe`, experimental), which LUME already uses for
text. Models the Gateway lists today (2026-09-23; re-check at spike time):

| Use | Candidates | Price (Gateway list) | Why it's a candidate |
|---|---|---|---|
| Speech-to-text, streaming | `spacexai/grok-stt` | ~$0.0017/min | **Supports `keyterm` boosting**, interim results, endpointing |
| | `openai/gpt-realtime-whisper` | ~$0.017/min | Low-delay streaming mode |
| | `google/gemini-3.5-transcribe-live` | ~$0.009/min | Live transcription |
| Text-to-speech | `openai/tts-1`, `fish-audio/s2.1-pro`, `spacexai/grok-tts` | ~$15 per 1M characters | Several voices; tts-1-hd at 2× |

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
- **Fallback:** chunked `POST` of short audio segments to a batch transcription
  route. Slower, simpler, and a safe plan B if WebSockets misbehave.
- **Not recommended:** the browser's built-in `SpeechRecognition`. Firefox
  lacks it, Safari is inconsistent, Chrome sends audio to Google outside our
  control, and it offers no keyterm boosting.

### 3.5 Speaking only what LUME said

A text-to-speech endpoint that accepts arbitrary text is a free, billed TTS
service for anyone who finds it. So the chat route emits a `speech` SSE event
per sentence, carrying the sentence and an HMAC token over
`(tenant, turnId, sha256(sentence))`. `/api/voice/speech` verifies the token
before synthesising. It is stateless, so it needs no shared store, and it
caches by hash — templated answers repeat, and a repeated sentence should
cost nothing.

## 4. Drive mode — the concierge takes the wheel

### 4.1 What the visitor experiences

> "Show me your SUVs under forty grand."
>
> The inventory filters. *"I found nine. Let me show you the top three."* The
> first card is softly spotlit. *"A 2022 BMW X5, sixty-two thousand miles… "*
> The second card is spotlit, then the third. *"Want me to open the X5?"*
>
> "Yes, show me."
>
> The detail page opens. The gallery advances. The price is spotlit, then the
> key specs, then the finance calculator. *"If you'd like, I can book a test
> drive."*

At any moment the visitor can say "stop", tap anything, or scroll — and the
concierge lets go immediately.

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
  | { kind: "act"; action: TourSafeAction; say?: SpokenLine }   // existing actions
  | { kind: "spotlight"; anchor: ConciergeAnchorId; say?: SpokenLine }
  | { kind: "gallery"; vehicleId: string; imageIndex: number; say?: SpokenLine }
  | { kind: "pause"; ms: number };                              // ≤ 1500

// Never a tour step: capture_lead, schedule_*, or another tour.
type TourSafeAction =
  | BotInventoryFilterAction | BotNavigateTargetAction
  | BotHighlightVehicleAction | BotCompareVehiclesAction;

type SpokenLine = { text: string; speechToken: string };
```

Rules — enforced on the server, then **again** in the browser:

- Every vehicle id is grounded exactly as actions are today (current result
  set, tenant-scoped, live status).
- Anchors come from a **closed allowlist** (`packages/types/src/conciergeAnchors.ts`),
  never a CSS selector. Same principle as the concierge target registry: the
  server names a registered thing, it never points at arbitrary DOM.
- No step can submit a lead, book an appointment, or mutate data. A tour can
  *open* the lead form as its final step. Submitting stays the visitor's act.
- Narration facts (price, mileage, count) are **rendered from database rows**,
  like the existing deterministic answers. A model never writes a number that
  is spoken.

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
- **Paces to the narration.** Run the step, speak its line, advance when the
  line ends (or after a reading-time estimate in text mode).
- **Yields instantly.** Any pointer, wheel, touch or key event outside the chat
  panel ends the tour and stops audio, with a quiet "You're in control". A
  visible *"LUME is showing you around — Stop"* bar stays up while it drives.
- **Respects reduced motion.** No smooth scrolling, shorter dwell, spotlight
  without animation.
- **Local voice commands.** "Stop", "pause", "next", "go back" are handled in
  the browser during a tour. They are instant, free, and never reach the server.

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
should drive the site too, narrated as text. Build it so; it ships and demos
independently.

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
   stop being the owner's data. Add SD-006 for audio sent to a US processor
   through the Gateway.
5. **Microphone use is explained on first use.** A short line before the
   browser prompt: what is sent, that audio is not kept.
6. **Cost abuse is capped.** 30-second utterance limit, per-session and per-IP
   rate limits (reuse `checkChatRateLimit` with a `voice:` keyspace), and a
   per-tenant `voice_seconds` quota through `quota.server.ts`.

## 6. Latency and cost

**Latency targets** (to be measured, not assumed):

| Stage | Target |
|---|---|
| End of speech → final transcript | 300–500 ms (streaming + endpointing) |
| Deterministic turn, server | ≤ 750 ms p95 (existing target) |
| First sentence synthesised | 200–400 ms |
| **Speech end → first spoken word, deterministic turn** | **~1.2–1.7 s** |
| Same, model turn | ~2.5–4 s — play a short earcon and show "thinking"; do not speak filler |

**Cost per 10-turn voice conversation** (8 s of speech and a ~250-character
reply per turn, Gateway list prices):

| | Low (grok-stt + tts-1) | High (gpt-realtime-whisper + tts-1-hd) |
|---|---|---|
| Speech-to-text | ~$0.002 | ~$0.023 |
| Text-to-speech | ~$0.038 | ~$0.075 |
| **Total, on top of today's text cost** | **~$0.04** | **~$0.10** |

Speech output dominates. Roughly $40–100 per 1,000 voice conversations — fine
at $300–700 per month per tenant, *if* it is capped. Sentence caching cuts it
further, because deterministic answers repeat.

## 7. Plans and entitlements

- Add `chat.voice` to `PLAN_FEATURES` (recommend Pro and Ultra, matching
  `chat.actions`, since Drive mode needs actions).
- The `meta` event gains `capabilities.voice`. The mic button renders only when
  it is true. Enforcement stays server-side in both voice routes.
- Rollout flags mirror the shadow-interpreter pattern: `CONCIERGE_VOICE_ENABLED`
  plus a tenant allowlist, so enabling an environment cannot switch voice on for
  every tenant at once.

## 8. Telemetry and evaluation

**Telemetry.** Extend `recordConciergeTurn` with `inputMode: "text" | "voice"`,
speech-to-text latency and provider, speech latency, tour steps run versus
yielded, and takeover events. PostHog gets operational
`lume_concierge_voice_*` and `lume_concierge_tour_*` events. **No audio ever.**

**Evaluation gate.** Build a voice gold set from the existing
`apps/admin/lib/chatInterpretationGoldSet.ts`:

1. Synthesise each phrase in 2–3 voices and accents, clean and with background
   noise; add a small set of real recordings.
2. Run audio → speech-to-text (with and without keyterms) → the existing
   pipeline.
3. Report, **with denominators**: entity accuracy (makes, models, numbers,
   ordinals), end-to-end intent match, and latency distribution.
4. Voice leaves the allowlist only when entity accuracy with keyterms clears an
   agreed threshold (proposal: ≥ 95% on held-out conversations).

**Tests.**

- Unit: driver state machine, anchor allowlist, tour grounding, HMAC speech
  tokens, sentence chunker, local voice commands.
- Route contract: tours contain no lead or booking steps; speech endpoint
  refuses untokened text; voice routes enforce entitlement and quota.
- Browser: extend `e2e/concierge/` with mocked SSE tours — a tour plays in
  order; a scroll or tap yields; a superseded turn stops its tour; reduced
  motion. Chromium's `--use-fake-device-for-media-stream` and
  `--use-file-for-fake-audio-capture` let Playwright drive the real mic path
  with a recorded file.

## 9. Delivery plan

Estimates are full-time-equivalent weeks, solo with AI assistance.

| Phase | What | Weeks |
|---|---|---|
| **V0 — Foundations and spike** | Permissions-Policy fix. Install `ai` (and `@vercel/functions`) with approval. Benchmark 2–3 speech-to-text models on synthetic gold-set audio with and without keyterms; pick a voice for speech output; prove the WebSocket route on a preview. Output: a decision record. | 1–1.5 |
| **V1 — Voice in, voice out (public)** | Push-to-talk mic in the chat, streaming transcript, sentence speech with tokens, barge-in, captions, contact confirm card, entitlement, quota, rate limits, telemetry. Behind flag and allowlist. | 2–3 |
| **V2 — Drive mode** | Anchor registry and anchors on inventory and vehicle detail; `scroll-to`, spotlight and gallery consumers; the `tour` action; `chatTours.ts` templates; executor with take-back-control; browser tests. Works for typed requests too. | 3–5 |
| **V3 — Admin voice** | Push-to-talk in the Ask LUME panel; navigation, search and proposals by voice; writes stay click-only. | 1–2 |
| **V4 — Optional** | Hands-free (always-listening with VAD), per-tenant persona voice (a `bot_personas` column and migration), more languages only if the product claims them. | — |

**Core path: roughly 7–11 weeks.** V1 and V2 touch disjoint files (voice in
`src/lib/voice/*` and the chat panel; Drive mode in `App.tsx` consumers,
`conciergeDriver.ts` and `chatTours.ts`), so they fit the existing two-lane
Claude/Codex workflow and can run in parallel after V0.

## 10. File map

New:

- `apps/admin/app/api/voice/stream/route.ts` — WebSocket speech-to-text
- `apps/admin/app/api/voice/speech/route.ts` — tokened text-to-speech
- `apps/admin/lib/voice/` — keyterms from facets, speech tokens, voice quota
- `apps/admin/lib/chatTours.ts` (+ tests) — tour templates
- `packages/types/src/conciergeAnchors.ts` — anchor allowlist
- `src/lib/voice/` — mic worklet, VAD, transcript client, audio queue
- `src/lib/conciergeDriver.ts` (+ tests) — tour executor
- `src/lib/useConciergeAnchor.ts` — anchor registration
- `e2e/concierge/voice-drive.spec.ts`

Changed:

- `vercel.json` — `microphone=()` → `microphone=(self)`
- `packages/types/src/bot-actions.ts` — `tour` action, step types
- `packages/types/src/plans.ts` — `chat.voice`
- `apps/admin/app/api/chat/route.ts` — tours, `speech` events, voice capability in `meta`
- `src/App.tsx` — `tour` and `scroll-to` consumers
- `src/components/chat/OllamaChat.tsx` — mic, voice state, captions, driving bar
- Vehicle detail and inventory components — register anchors
- `apps/admin/components/admin-concierge-panel.tsx` — push-to-talk
- `apps/admin/lib/observability.ts` — voice and tour fields
- `docs/security/security-debt.md` — SD-006

## 11. Risks

| Risk | Mitigation |
|---|---|
| Speech-to-text mis-hears makes, trims, numbers, ordinals (the July reason for deferring) | Keyterms from tenant facets; low-confidence echo-back; gold-set gate before wider rollout |
| The concierge fights the visitor for control | Yield on any input, visible Stop, local "stop" command, tours capped at six steps |
| Mobile audio autoplay rules (especially iOS) | One `AudioContext` unlocked by the mic tap; audio queue |
| Cost abuse of voice routes | Entitlement, quota, rate limits, utterance cap, tokened speech |
| Hallucinated tours | Closed step set, server grounding, anchors from an allowlist, templated narration |
| Multi-instance memory | Upstash is still unprovisioned in every environment. Barge-in makes superseded turns more frequent, which raises the value of provisioning it. |
| New dependencies and experimental APIs | `experimental_streamTranscribe` may change; pin the version and keep the chunked-POST fallback |
| The cinematic site plus audio on low-end phones | Spike on a mid-range Android device in V0 |

## 12. Decisions needed from the owner

1. **Push-to-talk first** (recommended) or hands-free from the start.
2. **Providers**, after the V0 benchmark. All current candidates are US
   processors reached through the Gateway.
3. **`chat.voice` on Pro and Ultra** (recommended) or all plans.
4. **A per-tenant voice budget** (seconds per month).
5. **Drive mode for typed requests too** (recommended — it ships and demos
   without voice).
6. **English only** for the first release (recommended — it is all the product
   claims today).

## 13. Why this is worth it now

The July deferral was about risk (speech-to-text errors on exactly the
entities the concierge relies on) and opportunity cost before the first
customer. The risk is now addressable — keyterm boosting through the Gateway
and a gold set to measure it — and it is gated, not assumed away. The
opportunity-cost argument is a product call. One thing works in favour: a
concierge that listens, answers aloud and walks a visitor through the lot is
the most demonstrable thing LUME could show, which suits a plan built on online
content and demos.
