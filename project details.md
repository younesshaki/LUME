# LUME Project Details

This document is the handoff map for developers and AI agents. It explains what the project is, how the code is organized, how the app runs, and where to make common changes without rediscovering the architecture.

## Product Summary

LUME is a cinematic React/Vite web experience for a fictional invitation-only luxury hotel in Monaco. The site combines:

- A gated entry flow with lightweight auth/session handling.
- A cinematic home and navigation shell.
- Product collaboration pages and product detail views.
- A full-screen Three.js/R3F showcase experience.
- Story progress, checkpoints, analytics, and admin reporting.
- A local Ollama-powered chatbot with embedded RAG knowledge.
- A global UI sound system.

The brand rules are important: LUME is a luxury hotel, not a consumer product or personal-care brand. The tone is restrained, premium, minimal, dark/gold, cinematic, and invitation-only.

## Runtime Stack

- App framework: React 18 + Vite.
- Language: TypeScript.
- 3D/rendering: Three.js, `@react-three/fiber`, `@react-three/drei`, postprocessing.
- Animation: GSAP, Motion.
- Styling: CSS/Sass files colocated with components; Tailwind Vite plugin exists, but most app styling is handwritten CSS.
- Backend services: Supabase for auth, profiles, story state, admin/event logs.
- Chatbot: Ollama proxied through Vite, with local embedded vector data.
- Tests: Vitest + Testing Library + jsdom.
- Deployment helpers: Vercel analytics/speed insights and `vercel.json`.

## Commands

```bash
npm run dev              # Vite dev server
npm run typecheck        # TypeScript check
npm run test             # Vitest suite
npm run build            # TypeScript + Vite production build
npm run check:assets     # Validate referenced product/CDN assets
npm run embed            # Regenerate chatbot embeddings
```

If dependency install hits peer conflicts, this repo has previously used:

```bash
npm install --legacy-peer-deps
```

## Current Worktrees And Ports

There are two active local worktrees:

| Port | Directory | Branch | Purpose |
| --- | --- | --- | --- |
| `5173` | `/Users/younesshaki/Documents/LUME` | `codex-max` | Main integrated worktree. |
| `5174` | `/Users/younesshaki/Documents/LUME-chatbot-design` | `opus-max-sound-system` | Parallel worktree, currently containing `codex-max` plus a branch-local port config commit. |

`5174` intentionally has one extra commit to keep `vite.config.ts` on port `5174`. Otherwise it should contain the latest `5173` work.

## Environment

Primary local env file: `.env.local`.

Important variables:

```env
VITE_R2_PUBLIC_BASE_URL=...
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_ACCESS_PASSWORD=...
VITE_ENABLE_LOCAL_CHAT=true
VITE_OLLAMA_HOST=http://192.168.11.118:11434
```

Ollama is reached through the Vite proxy:

- Browser calls `/ollama/api/chat` and `/ollama/api/embeddings`.
- `vite.config.ts` rewrites `/ollama/*` to the configured `VITE_OLLAMA_HOST`.
- If `VITE_OLLAMA_HOST` is missing, `5173` defaults to `127.0.0.1:11434`, which may fail if Ollama is running elsewhere.

## Top-Level App Flow

Entry point:

- `src/main.tsx` mounts React, wraps the app in `SoundProvider`, and enables Vercel Analytics/Speed Insights.
- `src/App.tsx` is the main screen router. It does not use React Router; it manages a local `screen` state.

Main screens in `src/App.tsx`:

- `gate`: entry/preload/login screen.
- `home`: cinematic landing/story home.
- `products`: product grid.
- `productDetail`: selected product page.
- `showcase`: showcase chapter listing.
- `titlecard`: pre-experience showcase title card.
- `experience`: full R3F cinematic experience.
- `contact`: access/contact page.
- `admin`: admin dashboard, opened by `#admin`.

Most heavy screens are lazy-loaded in `App.tsx` via `React.lazy` and `Suspense`.

Navigation behavior:

- `handleNavigateToProducts`, `handleNavigateToShowcase`, `handleNavigateToContact`, `handleGoHome`, and `handleBack` live in `App.tsx`.
- These handlers also fire named sound actions through `playSound(...)`.
- Showcase chapters route through `handleEnterExperience(partIndex, chapterIndex)`.

## Source Map

### App Shell

- `src/main.tsx`: React mount, global sound provider, Vercel analytics.
- `src/App.tsx`: screen router, top-level navigation, media quality, lazy loading, chat visibility.
- `src/App.scss`, `src/index.css`: global styling, font declarations, root-level CSS.

### Page/UI Layer

Located in `src/experience/ui/`:

- `PreloadGate.tsx`: initial gate/start flow.
- `StoryHomePage.tsx`: home/brand entry and showcase cards.
- `ProductsPage.tsx`: product grid/filter page.
- `ProductDetailPage.tsx`: single product detail page.
- `ShowcasePage.tsx`: list of cinematic showcase chapters.
- `ShowcaseTitleCard.tsx`: title card before entering showcase experience.
- `ContactPage.tsx`: access/contact copy.
- `AdminPage.tsx`: Supabase-backed admin dashboard.
- `AppBackButton.tsx`, `MediaQualitySettings.tsx`, `ChapterNav.tsx`: global controls.
- `CinematicShell.tsx`: shared page shell wrapper.

Each page usually has a matching `.css` file in the same folder.

### 3D Experience

Located in `src/experience/`:

- `Experience.tsx`: main R3F experience controller. Handles part/chapter state, loaders, transitions, media quality, story progress, URL hash sync, showcase video preload, and debug toggles.
- `SceneManager.tsx`: currently lazy-loads the showcase chapter into the R3F scene.
- `CameraRig.tsx`, `cameraConfigs.ts`, `CameraConfigTypes.ts`: camera behavior/config.
- `ModelPreloader.tsx`, `sceneAssets.ts`: 3D/model preload helpers.
- `CanvasErrorBoundary.tsx`, `FadeOverlay.tsx`: rendering safety/transition helpers.
- `hooks/`: scroll, timeline, loading, smooth-scroll controller utilities.
- `loaders/`: multiple loader variants and shared loader shell.

Showcase-specific code:

- `src/experience/scenes/showcase/index.tsx`: main `ShowcaseChapter` component.
- `src/experience/scenes/showcase/data.ts`: showcase chapter configs and scene lists.
- `src/experience/scenes/showcase/data/sceneAssets.ts`: model/video asset URLs and quality variants.
- `src/experience/scenes/showcase/scenes/scene-*/content.ts`: authored scene copy/content.
- `ShowcaseTimeline.ts`: GSAP/timeline logic.
- `ShowcaseNarrative.tsx`, `ShowcaseScene.tsx`, `BackgroundVideo.tsx`: visual/narrative rendering.
- `ProductChoiceScene.tsx`, `Scene12.tsx`, `SecondaryCtaScene.tsx`: final choice/product CTA phases.

Debug shortcuts in development:

- `Q`: toggle debug overlay.
- `W`: toggle sync preview panel.

### Story State

Located in `src/experience/story/`:

- `manifest.ts`: canonical parts, chapters, scenes, ids, titles, modes, durations.
- `selectors.ts`: derives chapter display states, resume target, progress status.
- `StoryProvider.tsx`: context provider for story state and service methods.
- `types.ts`: `StoryState`, chapter/scene definitions, service contract.
- `service/localStoryService.ts`: localStorage-backed implementation.
- `service/supabaseStoryService.ts`: Supabase-backed implementation.
- `service/storyDefaults.ts`: default state, versioning, normalization, storage keys.

`StoryProvider` uses local storage by default. It switches to Supabase when:

```env
VITE_USE_BACKEND=true
```

Story state tracks:

- Current part/chapter/scene.
- Visited and completed scene IDs.
- Completed chapter IDs.
- Choices.
- Analytics and scene durations.
- Preferences such as `soundEnabled`.
- Resume checkpoint.

### Products And Catalog

Product data lives in:

- `src/experience/products/catalog.json`: product source data.
- `src/experience/products/catalog.ts`: typed catalog loader, image URL derivation, helpers.
- `src/experience/data/products.ts`: compatibility re-export.

Key helpers:

- `PRODUCTS`
- `PRODUCT_CATEGORIES`
- `getProductById(productId)`
- `getShowcasePreviewForChapter(chapterId, fallbackIndex)`

Product images use CDN keys and are converted by `mediaUrl(...)`.

### CDN And Assets

CDN helper:

- `src/config/cdn.ts`

Core functions:

- `mediaUrl(path)`: builds URLs from `VITE_R2_PUBLIC_BASE_URL`.
- `fallbackMediaUrl(path)`: optional Supabase fallback.
- `useCdnImage(path)`: probes R2 image and falls back if needed.

Tracked local assets:

- Fonts: `src/experience/assets/fonts/`
- Home background: `src/experience/assets/images/lume-homepage-background.png`
- Draco decoder files: `public/draco/`
- UI sound files: `public/sounds/`

`.gitignore` broadly ignores heavy media types, but `public/sounds/**` and selected font/image assets are explicitly unignored because the app references them directly.

### Sound System

Located in `src/lib/sound/`.

Mount:

- `src/main.tsx` wraps `<App />` in `<SoundProvider>`.

Main files:

- `SoundProvider.tsx`: initializes the module-global audio engine.
- `useSound.ts`: hook used by UI components.
- `audioEngine.ts`: audio pools, cooldowns, pitch variation, sequences, autoplay unlock.
- `sounds.ts`: maps sound keys to files in `public/sounds/`.
- `actions.ts`: maps UI action names to sound keys/sequences.
- `preferences.ts`: localStorage-backed mute/volume/category prefs.
- `SoundMuteToggle.tsx`, `SoundOn.tsx`: optional UI controls.

How to add a sound:

1. Put the audio file under `public/sounds/<category>/`.
2. Add a sound key in `src/lib/sound/sounds.ts`.
3. Map one or more action keys in `src/lib/sound/actions.ts`.
4. Trigger from components with `const { play } = useSound(); play("action.key")`.

Common actions:

- `nav.toShowcase`
- `chat.close`
- `product.card.click`
- `showcase.enter`
- `chapter.nav.click`

Important runtime behavior: the engine does not play until a user gesture unlocks browser audio policy.

### Chatbot And RAG

UI:

- `src/components/chat/OllamaChat.tsx`
- `src/components/chat/OllamaChat.css`

RAG:

- `src/lib/ragService.ts`
- `src/lib/knowledge/chunks.ts`
- `src/lib/knowledge/embeddings.json`

Flow:

1. User sends a message in `OllamaChat`.
2. `getSystemPromptWithContext(query)` embeds the query via `/ollama/api/embeddings`.
3. The query embedding is compared against `embeddings.json` by cosine similarity.
4. Top chunks are inserted into a strict system prompt.
5. Chat request streams from `/ollama/api/chat`.
6. Messages persist in localStorage under `lume-chat-v1`.

Default models:

- Chat: `llama3.1:8b`
- Embeddings: `nomic-embed-text`

Regenerate embeddings after editing `src/lib/knowledge/chunks.ts`:

```bash
npm run embed
```

Chat is shown only when:

```env
VITE_ENABLE_LOCAL_CHAT=true
```

### Supabase/Auth/Admin

Supabase client:

- `src/lib/supabase.ts`

Auth:

- `src/lib/authService.ts`
- Username is sanitized to lowercase `[a-z0-9_]`, 2-30 chars.
- Email is derived as `<username>@lume-users.com`.
- If Supabase env is missing, auth falls back to local preview mode.

Event logging:

- `src/lib/eventsService.ts`
- App-level and showcase actions write append-only events to `story_events`.

Admin:

- `src/experience/ui/AdminPage.tsx`
- Accessed via `#admin`.
- Requires a logged-in Supabase session and `am_i_admin` RPC returning true.
- Reads `profiles` and latest `story_events`, supports filtering and CSV export.

Expected Supabase concepts:

- `profiles`
- `story_states`
- `story_events`
- RPC: `username_exists`
- RPC: `am_i_admin`

## Tests

Tests currently cover:

- CDN URL behavior: `src/config/cdn.test.ts`
- Product catalog integrity: `src/experience/products/catalog.test.ts`
- Product page rendering: `src/experience/ui/ProductsPage.test.tsx`
- Auth helpers: `src/lib/authService.test.ts`

Vitest config:

- `vitest.config.ts`
- `src/test/setup.ts`

Run:

```bash
npm run typecheck
npm run test
npm run build
```

## How To Add A Product Collaboration

1. Add product data in `src/experience/products/catalog.json`.
2. Add/upload the image asset to the CDN and set `imageKey`.
3. If it has a showcase, set `showcase.partIndex`, `showcase.chapterIndex`, `showcase.chapterId`, and `label`.
4. Optionally add `showcasePreviewChapterId` so `ShowcasePage` can map a chapter to a product preview.
5. Run:

```bash
npm run check:assets
npm run typecheck
npm run test
```

## How To Add A Showcase Chapter

1. Add chapter definition to `src/experience/story/manifest.ts`.
2. Add chapter config to `src/experience/scenes/showcase/data.ts`.
3. Add scene content files under `src/experience/scenes/showcase/scenes/`.
4. Add video/model references in `src/experience/scenes/showcase/data/sceneAssets.ts` if needed.
5. Add product preview mapping in `catalog.json` if the chapter belongs to a product.
6. Verify `isShowcaseChapterId(...)` and `getShowcaseChapterConfig(...)` resolve the new chapter.

## How To Add Or Change Brand Knowledge For The Chatbot

1. Edit `src/lib/knowledge/chunks.ts`.
2. Run `npm run embed`.
3. Confirm `src/lib/knowledge/embeddings.json` updates.
4. Test through the local chatbot.

The chatbot system prompt intentionally forbids using outside knowledge. If the answer is not in chunks, the assistant should say it does not have that information.

## Common Failure Modes

- Chat returns `500`: check `VITE_OLLAMA_HOST`, restart Vite, and probe `/ollama/api/tags`.
- Chat does not appear: check `VITE_ENABLE_LOCAL_CHAT=true`.
- Sounds do not play: ensure user has clicked/tapped once, files exist under `public/sounds`, and action keys exist in `actions.ts`.
- A referenced sound 404s: check `sounds.ts` path and `.gitignore` unignore rules for `public/sounds/**`.
- Product images do not load: verify CDN key in `catalog.json` and run `npm run check:assets`.
- Typecheck fails after branch sync: run `npm install --legacy-peer-deps` in that worktree.
- 5174 starts on wrong port after syncing from 5173: restore `vite.config.ts` port to `5174` for that worktree.

## Git/Branch Notes

At the time this handoff was written:

- `codex-max` is the main integrated local branch for port `5173`.
- `opus-max-sound-system` has been fast-forwarded to include `codex-max` and has one branch-local commit keeping it on `5174`.
- Backup/integration branches may exist from the sound-system merge:
  - `backup/codex-max-before-sound-merge-20260509-020431`
  - `backup/opus-sound-system-before-merge-20260509-020431`
  - `integrate/sound-system-into-codex-max-20260509-020431`

Do not assume `.env.local` is shared between worktrees. It is ignored by Git and must be copied/edited per worktree.

## Practical Orientation For New Work

Start here:

1. Read `src/App.tsx` to understand screens and navigation.
2. Read `src/experience/products/catalog.json` before changing product content.
3. Read `src/experience/story/manifest.ts` before changing story/showcase structure.
4. Read `src/experience/scenes/showcase/data.ts` and `src/experience/scenes/showcase/index.tsx` before changing the cinematic flow.
5. Read `src/lib/sound/actions.ts` before changing sound triggers.
6. Read `src/lib/ragService.ts` and `src/lib/knowledge/chunks.ts` before changing chatbot behavior.
7. Run `npm run typecheck`, `npm run test`, and `npm run build` before considering the work complete.

