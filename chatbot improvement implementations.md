# LUME Chatbot — Improvement Implementations

A living record of every deliberate design decision, implementation detail, and architectural rule for the LUME chat widget. Written to be the single source of truth for anyone working on the chatbot going forward.

---

## Table of Contents

1. [RAG System](#1-rag-system)
2. [Streaming Responses](#2-streaming-responses)
3. [localStorage Persistence](#3-localstorage-persistence)
4. [Aceternity UI Components](#4-aceternity-ui-components)
5. [Shadcn AI Components](#5-shadcn-ai-components)
6. [Isolated Design System](#6-isolated-design-system)
7. [Sound System](#7-sound-system)

---

## 1. RAG System

### What it is

Retrieval-Augmented Generation. Before every user message is sent to the language model, the chatbot retrieves the most relevant pieces of LUME brand knowledge and injects them directly into the system prompt. This grounds the model's responses in real, curated facts rather than its training data.

### Why it matters

Without RAG, `llama3.1:8b` has no knowledge of LUME and will either refuse to answer or hallucinate — including confusing LUME with unrelated brands (e.g. Lume Deodorant). With RAG, every response is anchored to content we control.

### Architecture

**Pre-computed embeddings (build-time)**

All 19 knowledge chunks are embedded once using Ollama's `nomic-embed-text` model and committed to the repo as a static JSON file. This means:
- Zero new infrastructure — uses the same Ollama server already on the network
- Embeddings are bundled by Vite at build time, available instantly with no runtime DB
- To update knowledge, edit `chunks.ts`, re-run `npm run embed`, commit the new JSON

**Runtime flow**

1. User sends a message
2. The query text is embedded via `POST /ollama/api/embeddings` (same Vite proxy as chat)
3. Cosine similarity is computed in-browser against all 19 pre-computed chunk embeddings
4. Top 7 chunks by score are selected
5. Their text is injected into the system prompt as numbered context blocks
6. The unique knowledge categories retrieved (brand / product / experience / access) are captured and attached to the assistant message for the Sources UI

**Files**

| File | Role |
|---|---|
| `src/lib/knowledge/chunks.ts` | 19 hand-authored knowledge chunks in prose form |
| `src/lib/knowledge/embeddings.json` | Generated 768-dimensional float vectors — committed to repo |
| `src/lib/ragService.ts` | Browser-side logic: embed, score, retrieve, build system prompt |
| `scripts/generateEmbeddings.ts` | Node script run once to produce `embeddings.json` |

**To regenerate embeddings**

```bash
# Ollama server must be reachable (LAN or proxy)
npm run embed
```

Progress prints per chunk. Commit `embeddings.json` after.

### Knowledge chunks

19 chunks across 4 categories. Each is 100–250 words of prose (not bullets — prose scores better with embedding models).

| Category | Chunks |
|---|---|
| `brand` | Concept, hotel, products philosophy, voice, design |
| `product` | Red Bull (live), Starbucks, Moët, YSL Femme, YSL Homme, Hermès, Rolex, future roadmap, product summary |
| `experience` | Showcase structure (2 chunks) |
| `access` | Philosophy, website structure, contact/booking |

The `product-summary` chunk is a critical anti-hallucination anchor: it explicitly states the exact count of collaborations, which ones are live vs coming soon, and — critically — that LUME is a luxury hotel and not a personal care brand.

### System prompt hardening

The base system prompt in `ragService.ts` contains 4 CRITICAL RULES enforced in language:

1. LUME is a luxury hotel in Monaco — not a personal care brand
2. Answer ONLY using the provided context — not training data
3. If the answer is not in context, say: "I don't have that information — please visit lume.com or contact us directly."
4. Never invent, guess, or extrapolate

**topK = 7** — retrieves 7 chunks per query to ensure all relevant product/brand context is included for broad questions.

### Return shape

`getSystemPromptWithContext` returns `{ prompt: string, sourceCategories: string[] }` — both the enriched system prompt and the list of unique knowledge categories retrieved, used to render the Sources UI component.

---

## 2. Streaming Responses

### What it is

Ollama supports NDJSON streaming over a standard HTTP response body. Instead of waiting for the full response before displaying it, tokens are appended to the message in real time as they arrive.

### Implementation

```
POST /ollama/api/chat  { stream: true }
→ ReadableStream of NDJSON lines
→ TextDecoder with { stream: true } for multi-byte safety
→ Buffer split on "\n" — partial final line held for next chunk
→ Each complete line: JSON.parse → append message.content token to state
→ chunk.done === true → break
```

**Two-phase send:**

- **Phase A (isRetrieving):** RAG embedding call — EncryptedText "Searching knowledge base…" shown
- **Phase B (isSending):** Ollama streaming call — streaming cursor blinks on the live message

Both phases disable the input and send button. Either can be aborted cleanly.

**Streaming cursor**

A blinking block cursor (▋) is shown on the actively-streaming message via `.ollamaChat__streamingCursor::after`. It disappears as soon as streaming completes.

---

## 3. localStorage Persistence

Chat history survives page reloads. Key: `lume-chat-v1` (versioned — bump the suffix if a knowledge base update makes old history incompatible).

**Rules:**
- History is saved after every state change, but only when no active send or retrieval is in progress (to avoid persisting partial streaming messages)
- On load, if stored history is missing or malformed, falls back to the welcome message only
- Reset clears localStorage immediately

The `sourceCategories` field on each message is also persisted, so Sources labels are restored on reload.

---

## 4. Aceternity UI Components

Three Aceternity components are used in the chatbot. All were installed manually (fetching the registry JSON directly) because the project uses npm with a pnpm lockfile, which breaks the shadcn CLI's package manager detection.

### GlowingEffect

A reactive gold glow that tracks cursor proximity around the chat panel border. Implemented in `src/components/ui/glowing-effect.tsx`.

Default Aceternity colors (pink/green/teal) were replaced with a LUME gold/amber gradient directly in the component source.

Usage: wraps the inside of `.ollamaChat__panel`. Disabled on the toggle button.

### EncryptedText

A character-scramble animation that reveals text by flipping through random characters. Used for the "Searching knowledge base…" indicator during RAG retrieval.

The `key={retrievalKey}` prop re-mounts the component on every new query, so the animation re-triggers each time.

Custom charset: `"ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%*/-+"` — no lowercase, matching LUME's uppercase-heavy brand voice.

### TypewriterEffect

Character-by-character fade-in animation for the welcome message. Uses `useAnimate` from `motion/react` with staggered `opacity: 0 → 1` on individual character `<span>` elements.

A module-level flag (`let welcomeHasAnimated = false`) ensures the animation plays exactly once per browser session, even if the panel is closed and reopened.

---

## 5. Shadcn AI Components

Three UI patterns from the shadcn AI component library, implemented natively in LUME's CSS style rather than importing their full dependency chain (Collapsible, ScrollArea, Button).

### Suggestion

Four pill buttons shown above the composer before any user message has been sent. Each fires its text as a message when clicked.

**Current suggestions:**
- "What is LUME?"
- "What products does LUME have?"
- "How do I get access to LUME?"
- "Tell me about the Red Bull collab"

Suggestions disappear permanently once the user sends their first message and do not reappear. To edit suggestions, update the `SUGGESTIONS` array in `OllamaChat.tsx`.

### Actions

Three ghost icon buttons rendered below every completed (non-streaming) assistant message:

| Button | Icon | Behavior |
|---|---|---|
| Copy | `Copy` / `Check` | Copies message text to clipboard, shows checkmark for 1.8s |
| Thumbs Up | `ThumbsUp` | Toggles gold highlight — visual feedback only |
| Thumbs Down | `ThumbsDown` | Toggles gold highlight — visual feedback only |

Ratings and copy state are held in component state and are not persisted.

### Sources

A collapsible "Used X sources" disclosure below each RAG-backed assistant response. Shows which knowledge categories were consulted (Brand / Products / Experience / Access) as small uppercase tags.

The category data flows directly from `ragService.ts` → `getSystemPromptWithContext` → stored on the `ChatMessage` object → rendered in the message. No second retrieval call.

Sources are hidden on: the welcome message, any actively-streaming message, and messages with no source categories (which would only occur if RAG failed silently).

---

## 6. Isolated Design System

### The principle

The chatbot widget is designed to be visually self-sufficient. It does not reference any CSS variables from the rest of the app. It does not inherit typography, color, or spacing from parent components beyond the browser's default `inherit` cascade — and that cascade is explicitly overridden at the root.

**Isolation through copying, not blocking.** Today the chatbot uses the same font as the app. But rather than referencing the app's `--experience-font-family` variable, the font name is copied into the chatbot's own token. The app can change its font tomorrow with zero effect on the chatbot. Divergence happens independently, at will.

### Token system

All design values live as `--lc-*` (lume-chat) CSS custom properties defined at `.ollamaChat { }` root. No rule in the CSS file references a hardcoded color, size, or timing value — only `--lc-*` tokens.

**Token categories:**

| Prefix | Controls |
|---|---|
| `--lc-font-*` | Font family, size scale |
| `--lc-line-height`, `--lc-letter-spacing-*` | Typography rhythm |
| `--lc-gold-*` | Full gold/amber palette (border, glow, tint, bg variants) |
| `--lc-text-*` | Text color scale (muted, dim, faint, ghost, near, strong…) |
| `--lc-bg-*` | Surface and background colors |
| `--lc-error-*` | Error state colors |
| `--lc-radius-*` | Border radius for each element type |
| `--lc-*-size` | Pixel dimensions for interactive elements |
| `--lc-panel-*` | Panel width, height, min-height |
| `--lc-shadow-*`, `--lc-blur-*` | Depth and glass effects |
| `--lc-transition-*` | Transition durations per speed tier |
| `--lc-*-duration` | Keyframe animation durations |

### Inheritance break

At `.ollamaChat` root, four CSS properties are declared explicitly to prevent cascade from the parent app:

```css
font-family: var(--lc-font-family);
font-size: var(--lc-font-size-base);
color: var(--lc-text);
line-height: var(--lc-line-height);
```

### Changing the chatbot font

Find this line in `OllamaChat.css`:

```css
--lc-font-family: "Instrument Serif", Georgia, serif;
```

Replace the value. The entire chatbot — all text, inputs, buttons, labels — updates. Nothing else in the app is affected.

---

## 7. Sound System

### File

`src/components/chat/useChatSounds.ts`

### Design intent

A thin, file-based sound hook. Each action in the chatbot has a named sound slot. You wire a sound by dropping an audio file into `/public/sounds/` and setting its path in the `SOUNDS` map. Setting a slot to `null` silences it with no other changes needed.

### Sound map

```ts
const SOUNDS: SoundMap = {
  open:       null,   // Fired when the chat panel opens
  close:      null,   // Fired when the chat panel closes
  send:       null,   // Fired when the user sends a message
  receive:    null,   // Fired when the assistant begins streaming a response
  copy:       null,   // Fired when the copy button is clicked
  rate:       null,   // Fired when thumbs up or thumbs down is clicked
  suggestion: null,   // Fired when a suggestion pill is clicked
  reset:      null,   // Fired when the chat is reset
};
```

### Wiring a sound

1. Add your audio file: `public/sounds/chat-open.mp3`
2. Update the map: `open: "/sounds/chat-open.mp3"`
3. Done — the sound plays on that action immediately

Supported formats: `.mp3`, `.wav`, `.ogg`, `.webm` — anything `HTMLAudioElement` can decode.

### Behavior

- Files are preloaded (`audio.preload = "auto"`) and cached in a module-level Map on first play, so there is no delay after the first trigger
- If a file path is set but the file is missing, the browser silently fails — no error in the UI
- If the browser blocks autoplay (e.g. before any user gesture), the play call resolves silently
- `audio.currentTime = 0` before each play ensures rapid re-triggering works correctly (e.g. sending multiple messages quickly)

### Hook usage in OllamaChat.tsx

```ts
const sounds = useChatSounds();

// Examples of callsites:
sounds.playOpen();         // on panel open button click
sounds.playClose();        // on panel close button click
sounds.playSend();         // after user message is added to state
sounds.playReceive();      // when assistant placeholder message is added
sounds.playCopy();         // inside clipboard.writeText().then()
sounds.playRate();         // on thumbs up/down click
sounds.playSuggestion();   // on suggestion pill click
sounds.playReset();        // at end of resetChat()
```

### How to integrate your own sounds — step by step

This is the complete process for wiring an external audio file to any chatbot action. No code changes are needed beyond what is described here.

**Step 1 — Prepare your audio file**

Keep files short. Interaction sounds should be 0.3–1.5 seconds. Longer than that and they will feel like notifications rather than feedback. Recommended format is `.mp3` for broadest browser compatibility, though `.wav`, `.ogg`, and `.webm` are all supported.

Recommended naming convention (not enforced, just consistent):

```
chat-open.mp3
chat-close.mp3
chat-send.mp3
chat-receive.mp3
chat-copy.mp3
chat-rate.mp3
chat-suggestion.mp3
chat-reset.mp3
```

**Step 2 — Place the file in `/public/sounds/`**

The `/public/` folder in Vite is served as static assets at the root of the site. A file at `public/sounds/chat-send.mp3` becomes available at `/sounds/chat-send.mp3` in the browser. Create the `sounds/` folder inside `public/` if it does not exist yet.

```
public/
  sounds/
    chat-send.mp3       ← place your file here
```

**Step 3 — Open `useChatSounds.ts` and update the SOUNDS map**

The file is at `src/components/chat/useChatSounds.ts`. At the top, find the `SOUNDS` constant:

```ts
const SOUNDS: SoundMap = {
  open:       null,
  close:      null,
  send:       null,
  receive:    null,
  copy:       null,
  rate:       null,
  suggestion: null,
  reset:      null,
};
```

Replace `null` with the file path for the action you want to wire. Example — wiring a send sound:

```ts
const SOUNDS: SoundMap = {
  open:       null,
  close:      null,
  send:       "/sounds/chat-send.mp3",   // ← path relative to /public/
  receive:    null,
  copy:       null,
  rate:       null,
  suggestion: null,
  reset:      null,
};
```

That is the only change needed. The hook automatically preloads the file and plays it when the user sends a message.

**Step 4 — Test in the browser**

Open the chat, trigger the action, and verify the sound plays. If nothing happens:

- Check the browser console for a 404 — the path may be wrong or the file may not be in `/public/sounds/`
- Check that a user gesture has occurred before the sound fires. Browsers block audio that plays before any click or keypress on the page. The first open/send/suggestion action will always have had a user gesture, so this should not be an issue in practice.
- Check the file itself is valid and not corrupted by opening it directly in the browser tab: `http://localhost:5173/sounds/chat-send.mp3`

**Wiring all 8 actions at once**

A fully wired SOUNDS map looks like this:

```ts
const SOUNDS: SoundMap = {
  open:       "/sounds/chat-open.mp3",
  close:      "/sounds/chat-close.mp3",
  send:       "/sounds/chat-send.mp3",
  receive:    "/sounds/chat-receive.mp3",
  copy:       "/sounds/chat-copy.mp3",
  rate:       "/sounds/chat-rate.mp3",
  suggestion: "/sounds/chat-suggestion.mp3",
  reset:      "/sounds/chat-reset.mp3",
};
```

You do not need to wire all slots at once. Any slot left as `null` stays silent with no side effects.

**Silencing a sound you previously wired**

Set it back to `null`. The cached Audio object is abandoned silently — no cleanup needed.

---

## File Map

```
src/
  components/
    chat/
      OllamaChat.tsx          — main widget component
      OllamaChat.css          — isolated design system (--lc-* tokens + all rules)
      useChatSounds.ts        — sound system (wire sounds here)
    ui/
      glowing-effect.tsx      — Aceternity gold border glow
      encrypted-text.tsx      — Aceternity character scramble
      typewriter-effect.tsx   — custom typewriter animation
  lib/
    ragService.ts             — RAG logic: embed, retrieve, prompt builder
    knowledge/
      chunks.ts               — 19 LUME knowledge chunks
      embeddings.json         — pre-computed 768d vectors (committed)
scripts/
  generateEmbeddings.ts       — run once with `npm run embed` to regenerate vectors
public/
  sounds/                     — drop audio files here to wire into useChatSounds.ts
```
