# LUME Sound System — Implementation Plan

A plan for a unified, expressive sound system that lets you link any audio file to any action on the website — through a single config file. Sounds can be shared across many actions or made unique per action. Sequences (two sounds played in order) and layers (two sounds played simultaneously) are first-class. Components don't import sounds directly; they fire **action names** that the config translates into sounds. Re-skinning the entire site's audio is editing one file.

The system is purely additive — it ships alongside the existing chatbot sound hook (`useChatSounds.ts`) and the experience-side `UiSoundProvider`, and only replaces them on a per-component basis as you migrate.

---

## Table of Contents

1. [Goals](#1-goals)
2. [Mental Model](#2-mental-model)
3. [Architecture in Three Layers](#3-architecture-in-three-layers)
4. [File Structure](#4-file-structure)
5. [Layer 1 — Sound Library](#5-layer-1--sound-library)
6. [Layer 2 — Action Registry](#6-layer-2--action-registry)
7. [Layer 3 — Public API](#7-layer-3--public-api)
8. [Sequences and Layers](#8-sequences-and-layers)
9. [Sharing vs. Specializing](#9-sharing-vs-specializing)
10. [Variety and Anti-Repetition](#10-variety-and-anti-repetition)
11. [Mute, Volume, and Preferences](#11-mute-volume-and-preferences)
12. [Performance and Audio Pooling](#12-performance-and-audio-pooling)
13. [Worked Examples](#13-worked-examples)
14. [Migration Plan](#14-migration-plan)
15. [What This Doesn't Break](#15-what-this-doesnt-break)
16. [Effort Estimate](#16-effort-estimate)

---

## 1. Goals

**Must-haves:**
- One config file controls every audio link in the site
- Any action can have a sound; any sound can be linked to many actions
- Sequences: action A plays sound X, then sound Y after Nms
- Layers: action A plays sounds X and Y simultaneously
- A single `play("action.name")` call from any component
- External audio files (`.mp3`, `.wav`, `.ogg`) — not synthesized tones
- Easy mute/unmute, with category-level controls (e.g., mute UI but keep ambient)
- Preferences persist across sessions
- Zero risk to existing components — installs in parallel, opt-in adoption

**Nice-to-haves:**
- Slight pitch variation per fire to avoid mechanical repetition
- Per-action volume override
- Cooldowns on rapid-fire actions (no machine-gun sounds)
- Random selection from a sound pool (e.g., 3 click variants, randomly chosen)
- Declarative React component wrapper for "fire this sound on click"

---

## 2. Mental Model

Three concepts. Keep them clearly separated.

| Concept | What it is | Example |
|---|---|---|
| **Sound** | A single audio file with metadata | `click-soft.mp3` at volume 0.6 |
| **Action** | A named event in the app (a *what happened*) | `"navbar.tab.click"` |
| **Trigger** | A line of code fired when an action happens | `play("navbar.tab.click")` |

**The mapping is:** action → 1 or more sounds → audio output.

The action registry is where the magic lives. To share a sound, point two actions at the same sound key. To specialize, give an action its own sound key. To create a sequence, set the action's value to an array. Nothing else has to change.

```
[Component]  →  fires "navbar.tab.click"  →  [Action Registry lookup]  →  plays "click-sharp"
[Component]  →  fires "product.card.click" →  [Action Registry lookup]  →  plays "click-sharp" then "product-reveal" after 150ms
```

---

## 3. Architecture in Three Layers

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: Public API                                        │
│  - useSound() hook                                          │
│  - <SoundOn /> declarative wrapper                          │
│  - Imperative play(action) function                         │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: Action Registry                                   │
│  - actions.ts: action key → sound spec                      │
│  - Specs: single sound, sequence, or layered sounds         │
│  - Per-action volume / pitch / cooldown overrides           │
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Sound Library                                     │
│  - sounds.ts: sound key → audio file + metadata             │
│  - Audio file pool, preload, play, fade                     │
│  - Pitch variation, cooldown enforcement                    │
└─────────────────────────────────────────────────────────────┘
```

**Why three layers, not two:** if action keys mapped directly to file paths, sharing a sound would mean repeating the path string everywhere, and renaming a file would require a global find-and-replace. Going through a sound key gives you a stable indirection — actions never reference files; they reference sound names. Files can move, get reskinned, or become pools without touching the action registry.

---

## 4. File Structure

```
public/
  sounds/                       ← all audio files live here
    ui/
      click-soft.mp3
      click-sharp.mp3
      click-firm.mp3
      hover.mp3
      tab-switch.mp3
    chat/
      send.mp3
      receive.mp3
      copy.mp3
    product/
      reveal.mp3
      hover.mp3
    nav/
      page-transition.mp3
    ...

src/
  lib/
    sound/
      index.ts                  ← public exports
      sounds.ts                 ← Layer 1: SOUND_LIBRARY
      actions.ts                ← Layer 2: ACTION_REGISTRY (you edit this most)
      SoundProvider.tsx         ← React context + initialization
      useSound.ts               ← public hook
      SoundOn.tsx               ← declarative wrapper component
      audioEngine.ts            ← internal: pool, play, fade, cooldown
      preferences.ts            ← internal: mute, volume, localStorage
      types.ts                  ← shared types
```

The folder is self-contained. Every file lives under `src/lib/sound/` or `public/sounds/`. Nothing else in the codebase needs to be aware of how the system works — components only import `useSound` or `<SoundOn>`.

---

## 5. Layer 1 — Sound Library

**File:** `src/lib/sound/sounds.ts`

A flat object mapping **sound keys** to audio file specs. Each sound has a stable name and metadata.

```ts
export type SoundSpec = {
  src: string;                  // path under /public, e.g., "/sounds/ui/click-soft.mp3"
  volume?: number;              // 0–1, default 1
  preload?: boolean;            // preload on init, default true
  cooldownMs?: number;          // minimum time between fires, default 30
  pitchVariation?: number;      // 0–0.2, slight detune per fire, default 0
  pool?: number;                // Audio object pool size for rapid-fire, default 3
};

export const SOUND_LIBRARY = {
  // ─── UI primitives ─────────────────────────────────────────────────
  "click-soft":   { src: "/sounds/ui/click-soft.mp3",   volume: 0.5, pitchVariation: 0.04, pool: 4 },
  "click-sharp":  { src: "/sounds/ui/click-sharp.mp3",  volume: 0.7, pitchVariation: 0.03, pool: 4 },
  "click-firm":   { src: "/sounds/ui/click-firm.mp3",   volume: 0.8 },
  "hover":        { src: "/sounds/ui/hover.mp3",        volume: 0.3, cooldownMs: 200, pool: 2 },
  "tab-switch":   { src: "/sounds/ui/tab-switch.mp3",   volume: 0.5 },

  // ─── Chat ──────────────────────────────────────────────────────────
  "chat-send":    { src: "/sounds/chat/send.mp3",       volume: 0.6 },
  "chat-receive": { src: "/sounds/chat/receive.mp3",    volume: 0.5 },
  "chat-copy":    { src: "/sounds/chat/copy.mp3",       volume: 0.4 },

  // ─── Product ───────────────────────────────────────────────────────
  "product-reveal": { src: "/sounds/product/reveal.mp3", volume: 0.6 },
  "product-hover":  { src: "/sounds/product/hover.mp3",  volume: 0.3, cooldownMs: 250 },

  // ─── Navigation ────────────────────────────────────────────────────
  "page-transition": { src: "/sounds/nav/page-transition.mp3", volume: 0.5 },
} as const satisfies Record<string, SoundSpec>;

export type SoundKey = keyof typeof SOUND_LIBRARY;
```

**Conventions:**
- Sound keys are **lowercase, kebab-case, descriptive** (`click-sharp`, not `BTN_CLICK_1`)
- Metadata defaults are sensible — most entries only need `src` and `volume`
- `pitchVariation` adds tiny random detune (±4% by default) so 10 rapid clicks don't sound identical
- `pool` controls how many simultaneous instances of the same sound can play (Audio elements can't restart while playing — the pool rotates)

---

## 6. Layer 2 — Action Registry

**File:** `src/lib/sound/actions.ts`

This is the file you edit most. Map every named action in the site to a sound, a sequence, or a layered set.

```ts
import type { SoundKey } from "./sounds";

export type ActionSpec =
  | SoundKey                              // play one sound
  | SoundStep[]                            // play a sequence (or layered)
  | null;                                  // explicitly silent

export type SoundStep =
  | SoundKey                               // play this sound immediately
  | { sound: SoundKey; delay?: number; volume?: number; layer?: boolean };

export const ACTION_REGISTRY = {
  // ─── Navbar ────────────────────────────────────────────────────────
  "navbar.tab.hover":  "hover",
  "navbar.tab.click":  "click-sharp",
  "navbar.tab.switch": "tab-switch",
  "navbar.logo.click": "click-firm",

  // ─── Products ──────────────────────────────────────────────────────
  "product.card.hover": "product-hover",
  "product.card.click": [
    "click-sharp",
    { sound: "product-reveal", delay: 150 },
  ],
  "product.filter.click": "click-soft",

  // ─── Chat ──────────────────────────────────────────────────────────
  "chat.open":          "click-sharp",
  "chat.close":         "click-soft",
  "chat.send":          "chat-send",
  "chat.receive":       "chat-receive",
  "chat.copy":          "chat-copy",
  "chat.suggestion":    "click-soft",
  "chat.rate":          "click-soft",
  "chat.reset":         "click-firm",

  // ─── Page transitions ──────────────────────────────────────────────
  "nav.toHome":         "page-transition",
  "nav.toProducts":     "page-transition",
  "nav.toShowcase":     [
    { sound: "click-firm" },
    { sound: "page-transition", delay: 200 },
  ],

  // ─── Generic primitives (cheap defaults) ───────────────────────────
  "button.primary.click":   "click-firm",
  "button.secondary.click": "click-sharp",
  "button.ghost.click":     "click-soft",

  // ─── Explicitly silent (for clarity) ───────────────────────────────
  "form.input.focus":   null,
  "form.input.change":  null,
} as const satisfies Record<string, ActionSpec>;

export type ActionKey = keyof typeof ACTION_REGISTRY;
```

**Conventions:**
- Action keys are **dot-namespaced**: `domain.subdomain.event` (e.g., `navbar.tab.click`)
- Use `null` to explicitly mark an action as silent — clearer than omitting it
- A bare string is a single sound; an array is a sequence
- An array entry can have `delay` (ms before play) and `layer: true` (parallel with the previous step)

This is **the file you edit to re-skin sounds**. Want all primary buttons to share a new click? Change `"click-firm"` once in the sound library, or remap the button actions here. Want the navbar tabs to have their own unique sound? Add a new entry in the sound library and reference it here.

---

## 7. Layer 3 — Public API

Three ways to fire a sound, ordered by ergonomics.

### 7.1 Hook (most common)

```tsx
import { useSound } from "@/lib/sound";

function NavbarTab({ label }: { label: string }) {
  const sound = useSound();

  return (
    <button
      onMouseEnter={() => sound.play("navbar.tab.hover")}
      onClick={() => sound.play("navbar.tab.click")}
    >
      {label}
    </button>
  );
}
```

The hook returns `{ play, mute, unmute, isMuted, setVolume }`. Most components only need `play`.

### 7.2 Declarative wrapper (cleanest)

For simple cases where a sound fires on a single event, wrap the child with `<SoundOn>`:

```tsx
import { SoundOn } from "@/lib/sound";

function NavbarTab({ label }: { label: string }) {
  return (
    <SoundOn click="navbar.tab.click" hover="navbar.tab.hover">
      <button>{label}</button>
    </SoundOn>
  );
}
```

`<SoundOn>` accepts: `click`, `hover`, `focus`, `enter` (mount), `leave` (unmount). Each prop takes an action key. Children are rendered as-is — no extra wrapping markup.

### 7.3 Imperative (one-offs, non-component code)

For places where neither hook nor wrapper fits — async callbacks, services, event handlers attached imperatively:

```ts
import { play } from "@/lib/sound";

async function fetchAndAnnounce() {
  await api.fetchProducts();
  play("data.loaded");
}
```

This is the same `play` function the hook exposes, but importable directly. It works without React context because the audio engine is initialized at app boot.

---

## 8. Sequences and Layers

Two composition patterns, both expressed in the action registry without needing custom scheduler code in components.

### 8.1 Sequence

Two sounds, one after the other.

```ts
"product.card.click": [
  "click-sharp",                              // plays at t=0
  { sound: "product-reveal", delay: 150 },    // plays at t=150ms
],
```

You can chain more than two — the `delay` is relative to the *previous* step's start (not its end), so timing stays predictable even if a sound is short or trimmed.

### 8.2 Layer

Two sounds, simultaneously. Use `layer: true` to play in parallel with the previous step.

```ts
"showcase.enter": [
  "page-transition",
  { sound: "ambient-deep", delay: 0, layer: true },
],
```

Both fire at t=0, layered. You can mix sequences and layers freely:

```ts
"product.featured.unlock": [
  "click-firm",                                       // t=0
  { sound: "product-reveal", delay: 120 },            // t=120ms
  { sound: "ambient-shimmer", delay: 0, layer: true } // t=120ms (layered with reveal)
],
```

### 8.3 Cancellation

When a sequence is mid-playback and a new action fires the same sequence, the old one is cancelled. Prevents pile-up on rapid clicks. Configurable per-action with `cancelPrevious: false` if you actually want overlap.

---

## 9. Sharing vs. Specializing

Sharing is the default. Two actions point at the same sound key:

```ts
"navbar.tab.click":      "click-sharp",
"product.filter.click":  "click-sharp",     // same sound — they share
```

Specializing is just as easy. Add a new sound to the library and reference it:

```ts
// sounds.ts:
"tab-special": { src: "/sounds/ui/tab-special.mp3", volume: 0.6 },

// actions.ts:
"navbar.tab.click":     "tab-special",      // now unique to navbar tabs
"product.filter.click": "click-sharp",      // unchanged
```

**The rule of thumb:** start with shared primitives (`click-soft`, `click-sharp`, `click-firm`, `hover`). Specialize only when a specific action *deserves* its own sonic signature (page transitions, showcase entry, chat send/receive, the moment a card is unlocked). Over-specializing makes the site feel chaotic. Restraint is on-brand.

---

## 10. Variety and Anti-Repetition

Three mechanisms, all opt-in per sound.

### 10.1 Pitch variation

In `sounds.ts`:

```ts
"click-sharp": { src: "/sounds/ui/click-sharp.mp3", pitchVariation: 0.04 },
```

Each fire detunes by ±4% (random within the range). 10 rapid clicks don't sound mechanical. Set `0` to disable.

### 10.2 Sound pools (random selection)

Sometimes a single sound, even with pitch variation, gets old. Provide multiple variants and let the engine pick one randomly:

```ts
// sounds.ts
"click-sharp-1": { src: "/sounds/ui/click-sharp-1.mp3" },
"click-sharp-2": { src: "/sounds/ui/click-sharp-2.mp3" },
"click-sharp-3": { src: "/sounds/ui/click-sharp-3.mp3" },

// actions.ts — use a pool with the special syntax
"navbar.tab.click": { pool: ["click-sharp-1", "click-sharp-2", "click-sharp-3"] },
```

The engine randomly picks one per fire. Repeat-protection ensures the same variant doesn't play twice in a row.

### 10.3 Cooldowns

Prevent machine-gun fires:

```ts
"hover": { src: "/sounds/ui/hover.mp3", cooldownMs: 200 },
```

If `play("navbar.tab.hover")` is called again within 200ms, it's silently skipped. Hovering rapidly across tabs doesn't trigger a stuttering loop.

---

## 11. Mute, Volume, and Preferences

A small preferences module persists user choices across sessions.

```ts
// preferences.ts
{
  master: { muted: false, volume: 1 },
  categories: {
    ui:      { muted: false, volume: 1 },
    chat:    { muted: false, volume: 0.8 },
    ambient: { muted: false, volume: 0.5 },
  }
}
```

Stored at `localStorage["lume-sound-prefs-v1"]`.

Categories are inferred from the action namespace (`chat.*` → chat category; `ambient.*` → ambient; everything else → ui). Allows muting just the chat sounds without killing UI feedback, or vice versa.

A small floating mute button can be added anywhere with:

```tsx
import { SoundMuteToggle } from "@/lib/sound";
<SoundMuteToggle />
```

It uses Lucide's `Volume2` / `VolumeX` icons and matches the chatbot's design tokens (`--lc-*`-style scoping is encouraged so it doesn't bleed app-side styles).

---

## 12. Performance and Audio Pooling

`HTMLAudioElement` has a fundamental limitation: an in-flight Audio can't restart from t=0 while still playing. The naïve solution is to create a new Audio per fire, which leaks memory.

**Solution: per-sound pool of Audio instances.** Each sound spec has a `pool` size (default 3). The engine maintains a small ring buffer of Audio elements per sound, rotating to the next one on each fire. Three concurrent fires of `click-sharp` use three Audio instances and rotate; on the fourth fire, the oldest is interrupted (set `currentTime = 0` and replayed).

**Preloading:** on app boot (or first user gesture, depending on autoplay policy), every sound with `preload: true` is fetched and decoded. Prevents the first-fire delay that would make the sound feel disconnected from the action.

**Autoplay policy:** browsers block audio that fires before any user gesture. The first interaction (gate password, first click) automatically unlocks audio for the session. The engine handles this transparently — calls before unlock are silently dropped, calls after work as expected.

**Memory:** with ~30 sounds at ~50KB each preloaded, total memory cost is ~1.5MB. Negligible.

---

## 13. Worked Examples

### 13.1 Navbar tabs (the example you gave)

**Library:**
```ts
"hover":      { src: "/sounds/ui/hover.mp3",      volume: 0.3, cooldownMs: 200 },
"tab-switch": { src: "/sounds/ui/tab-switch.mp3", volume: 0.5 },
"click-soft": { src: "/sounds/ui/click-soft.mp3", volume: 0.5 },
```

**Actions:**
```ts
"navbar.tab.hover":  "hover",
"navbar.tab.click":  "click-soft",
"navbar.tab.switch": "tab-switch",
```

**Component:**
```tsx
function NavTab({ id, label, isActive, onActivate }) {
  const sound = useSound();

  const handleClick = () => {
    sound.play("navbar.tab.click");
    if (!isActive) sound.play("navbar.tab.switch");  // only if actually switching
    onActivate(id);
  };

  return (
    <button
      onMouseEnter={() => sound.play("navbar.tab.hover")}
      onClick={handleClick}
    >
      {label}
    </button>
  );
}
```

Now: hovering a tab plays `hover`, clicking plays `click-soft`, and *if* the click switches tabs, `tab-switch` plays after.

### 13.2 Product card with sequence

**Actions:**
```ts
"product.card.click": [
  "click-sharp",
  { sound: "product-reveal", delay: 150 },
],
```

**Component:**
```tsx
function ProductCard({ product }) {
  return (
    <SoundOn click="product.card.click" hover="product.card.hover">
      <article onClick={() => navigateTo(product.slug)}>
        ...
      </article>
    </SoundOn>
  );
}
```

Click fires the sequence: `click-sharp` immediately, then `product-reveal` 150ms later. Hover fires `product-hover` (cooldown-protected from spam).

### 13.3 Chat send (replacing the existing useChatSounds hook)

**Actions:**
```ts
"chat.send":    "chat-send",
"chat.receive": "chat-receive",
"chat.copy":    "chat-copy",
```

**Component (in OllamaChat.tsx):**
```tsx
const sound = useSound();

// in sendMessage:
sound.play("chat.send");

// when assistant placeholder is added:
sound.play("chat.receive");

// in handleCopy:
sound.play("chat.copy");
```

This replaces `useChatSounds()` entirely. Once migrated, delete `src/components/chat/useChatSounds.ts`.

### 13.4 Showcase entry (layered sounds)

**Actions:**
```ts
"showcase.enter": [
  "page-transition",
  { sound: "ambient-shimmer", delay: 0, layer: true },
],
```

When the user enters the cinematic showcase, both sounds fire at t=0 — the transition snap and the shimmer pad layered together. Two separate audio files, one logical action.

---

## 14. Migration Plan

The system is built additively. Existing sounds keep working through every step. Migration happens per-component, on your timeline.

### Phase 0 — Build the foundation (no migration yet)

1. Create the folder structure under `src/lib/sound/`
2. Implement `audioEngine.ts` (pool, play, fade, cooldown, mute)
3. Implement `preferences.ts` (localStorage sync)
4. Implement `sounds.ts` with an empty library (or a few placeholder entries)
5. Implement `actions.ts` with an empty registry
6. Implement `useSound`, `<SoundOn>`, `play()` exports
7. Mount `<SoundProvider>` once at app root in `src/main.tsx` (alongside existing providers)
8. Add a couple of test sound files to `/public/sounds/` to verify the pipeline

**Effort: ~1 day. Nothing in the existing app changes.**

### Phase 1 — Replace `useChatSounds`

1. Add chat-related entries to `sounds.ts` and `actions.ts`
2. In `OllamaChat.tsx`, replace `import { useChatSounds }` with `import { useSound }`
3. Swap `sounds.playOpen()` → `sound.play("chat.open")`, etc.
4. Delete `src/components/chat/useChatSounds.ts`

**Effort: ~30 min. The chat behaves identically; the new system is now in production.**

### Phase 2 — Wire the navbar

1. Add navbar entries to the registry
2. Wrap nav buttons in `<SoundOn>` or use `useSound` directly

**Effort: ~30 min. First "new sound" surface.**

### Phase 3 — Wire product cards, page transitions, and primary buttons

1. Add product, page transition, and button entries
2. Use `<SoundOn>` on `ProductCard`, primary buttons, etc.

**Effort: ~1–2 hours, depending on coverage.**

### Phase 4 — Migrate `UiSoundProvider` (the experience-side oscillator system)

This is optional. The existing experience-side system uses Web Audio synthesized tones. It can either:
- **Stay as-is** — it covers experience UI (loaders, gate, scene transitions) and works fine in isolation
- **Be migrated** — replace each oscillator-based sound with an audio file, port the call sites to `useSound`

Recommendation: leave it for now. The experience-side sounds are functioning; migrating is purely for unification. Revisit only if you want one master mute toggle covering both systems.

---

## 15. What This Doesn't Break

**Hard guarantees:**

| Surface | Effect |
|---|---|
| Existing chatbot sound calls (`useChatSounds`) | Continue to work until Phase 1 explicitly removes them |
| Existing experience UI sounds (`UiSoundProvider`, oscillator-based) | Untouched; runs in parallel |
| Components that don't import the new system | Zero impact |
| Component imports / build size | New system adds ~5KB minified (tiny — no audio decoding lib, just `HTMLAudioElement`) |
| Server-side / SSR | All audio is client-only; no SSR concerns |
| Bundle size of audio files | Files are in `/public/`, served separately, lazy-fetched |
| Vite dev experience | No new plugins, no config changes |

**Specifically, you will not see:**
- Component files needing imports they didn't before
- The chat behaving differently after Phase 0
- Any change in CSS, design tokens, or layout
- Any change in the audio that already plays in the experience

The system is **opt-in per call site**. The first time a component fires `sound.play("...")`, that's the moment it joins the new system. Until then, it's invisible.

---

## 16. Effort Estimate

Calibrated for Claude doing the code, with Younes wiring sounds and reviewing.

| Phase | Claude time | Owner time | Calendar |
|---|---|---|---|
| **Phase 0** — foundation | 4–5 hours | 30 min (test files) | 1 day |
| **Phase 1** — migrate chat | 30 min | 15 min (test) | 1–2 hours |
| **Phase 2** — navbar | 30 min | 15 min | 1 hour |
| **Phase 3** — products + buttons + transitions | 1–2 hours | 30 min | 2–3 hours |
| **Phase 4** — (optional) experience UI migration | 3–4 hours | 1 hour | 1 day |

**Phase 0–3 total: roughly 1.5 days of focused work, including all wiring.**

Sound design (recording, editing, choosing files) is *not* in this estimate — it's owner-side creative work. The system is ready for sounds the moment files exist in `/public/sounds/`.

---

## Closing Note

The architecture is a deliberate three-layer separation:

- **Sound library** changes when files change
- **Action registry** changes when you re-skin or specialize
- **Components** change only when behavior changes

Each layer can be edited without touching the others. Want to swap every UI click for a new sound? Edit `sounds.ts`. Want a specific button to have a unique sound? Edit `actions.ts`. Want a new component to make sound? Use `useSound` once and reference an action key.

This is the same discipline as the chatbot's `--lc-*` design system: indirection through stable names, so you can re-skin without re-touching code. Sounds become a configuration concern, not a code concern.
