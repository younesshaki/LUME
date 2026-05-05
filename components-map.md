# LUME — Components Map

All major components in the project, grouped by domain.

---

## App Shell

| Component | File | Purpose |
|---|---|---|
| `App` | [`src/App.tsx`](src/App.tsx) | Root component. Owns the `screen` state machine (`gate → home → titlecard → experience → products → contact → admin`). Composes all providers and persistent UI. |
| `main` | [`src/main.tsx`](src/main.tsx) | Entry point. Mounts `<App />` into the DOM. |

---

## Aceternity UI Components

Installed via the Shadcn CLI with the `@aceternity` registry.

| Component | File | Used On |
|---|---|---|
| `3d-card` (`CardContainer`, `CardBody`, `CardItem`) | [`src/components/ui/3d-card.tsx`](src/components/ui/3d-card.tsx) | Homepage showcase cards — mouse-tracked 3D tilt |
| `flip-words` | [`src/components/ui/flip-words.tsx`](src/components/ui/flip-words.tsx) | Installed, not yet wired |
| `hover-border-gradient` | [`src/components/ui/hover-border-gradient.tsx`](src/components/ui/hover-border-gradient.tsx) | Showcase title card "Play" button border animation |
| `placeholders-and-vanish-input` | [`src/components/ui/placeholders-and-vanish-input.tsx`](src/components/ui/placeholders-and-vanish-input.tsx) | Gate auth form — username + password inputs |
| `loader` (`LoaderFour`, `LoaderFive`) | [`src/components/ui/loader.tsx`](src/components/ui/loader.tsx) | Local Aceternity-compatible loader exports. `LoaderFive` is wired into the initial pre-loader. |

---

## Chat (AI)

| Component | File | Purpose |
|---|---|---|
| `OllamaChat` | [`src/components/chat/OllamaChat.tsx`](src/components/chat/OllamaChat.tsx) | Optional floating AI chat widget. Connects to local Ollama, retrieves LUME context through `ragService`, streams responses, persists local browser history, and only renders when `VITE_ENABLE_LOCAL_CHAT=true`. |

---

## Pages / Screens

Documented in detail in [`user-workflow.md`](user-workflow.md). Quick reference:

| Component | File |
|---|---|
| `PreloadGate` | [`src/experience/ui/PreloadGate.tsx`](src/experience/ui/PreloadGate.tsx) |
| `StoryHomePage` | [`src/experience/ui/StoryHomePage.tsx`](src/experience/ui/StoryHomePage.tsx) |
| `ShowcaseTitleCard` | [`src/experience/ui/ShowcaseTitleCard.tsx`](src/experience/ui/ShowcaseTitleCard.tsx) |
| `ProductsPage` | [`src/experience/ui/ProductsPage.tsx`](src/experience/ui/ProductsPage.tsx) |
| `ContactPage` | [`src/experience/ui/ContactPage.tsx`](src/experience/ui/ContactPage.tsx) |
| `AdminPage` | [`src/experience/ui/AdminPage.tsx`](src/experience/ui/AdminPage.tsx) |

---

## Persistent UI (visible across screens)

| Component | File | Purpose |
|---|---|---|
| `AppBackButton` | [`src/experience/ui/AppBackButton.tsx`](src/experience/ui/AppBackButton.tsx) | Back arrow shown on all screens except the gate. Always returns to `home`. |
| `MediaQualitySettings` | [`src/experience/ui/MediaQualitySettings.tsx`](src/experience/ui/MediaQualitySettings.tsx) | Settings cog (bottom corner). Lets the user switch between Normal and High video quality. Hidden during the showcase experience. Persists selection to `localStorage`. |
| `PhoneExperienceNotice` | [`src/experience/ui/PhoneExperienceNotice.tsx`](src/experience/ui/PhoneExperienceNotice.tsx) | Banner shown to mobile users on the gate screen warning that the experience is desktop-optimised. |

---

## Experience (3D Engine)

| Component | File | Purpose |
|---|---|---|
| `Experience` | [`src/experience/Experience.tsx`](src/experience/Experience.tsx) | The React Three Fiber canvas. Owns the scene loop, camera, loading state, chapter navigation, and loader orchestration. The top-level 3D component. |
| `SceneManager` | [`src/experience/SceneManager.tsx`](src/experience/SceneManager.tsx) | Lazy-loads and renders the active scene chapter inside the R3F canvas. Currently routes to `ShowcaseChapter`. |
| `CameraRig` | [`src/experience/CameraRig.tsx`](src/experience/CameraRig.tsx) | Animates the Three.js `PerspectiveCamera` between scenes. Supports static positions, Catmull-Rom spline paths, and simplex-noise shake. Driven by `cameraConfigs.ts`. |
| `FadeOverlay` | [`src/experience/FadeOverlay.tsx`](src/experience/FadeOverlay.tsx) | Black `div` over the canvas. Opacity driven by the experience fade-in/out state. Used for chapter transitions. |
| `ModelPreloader` | [`src/experience/ModelPreloader.tsx`](src/experience/ModelPreloader.tsx) | Invisible component. Triggers asset preloading for the first scene on mount so assets are warm before the user navigates. |
| `CanvasErrorBoundary` | [`src/experience/CanvasErrorBoundary.tsx`](src/experience/CanvasErrorBoundary.tsx) | Wraps the R3F canvas. Catches render errors and prevents a 3D crash from breaking the whole app. |

---

## Showcase Scenes (Red Bull, 12 scenes)

| Component | File | Purpose |
|---|---|---|
| `ShowcaseChapter` (index) | [`src/experience/scenes/showcase/index.tsx`](src/experience/scenes/showcase/index.tsx) | Root of the Red Bull showcase. Composes all sub-components and manages scene progression. |
| `ShowcaseScene` | [`src/experience/scenes/showcase/ShowcaseScene.tsx`](src/experience/scenes/showcase/ShowcaseScene.tsx) | Renders a single scene within the showcase — layout, timing, narrative, and video sync. |
| `BackgroundVideo` | [`src/experience/scenes/showcase/BackgroundVideo.tsx`](src/experience/scenes/showcase/BackgroundVideo.tsx) | Manages the full-screen background videos. Maps scenes to video files and handles pause points, preloading, and quality switching. |
| `VideoSky` | [`src/experience/components/VideoSky.tsx`](src/experience/components/VideoSky.tsx) | Renders a video texture onto a large sphere inside the R3F scene, creating an immersive 360-style background. |
| `ShowcaseNarrative` | [`src/experience/scenes/showcase/ShowcaseNarrative.tsx`](src/experience/scenes/showcase/ShowcaseNarrative.tsx) | Adapter that feeds scene-specific narrative data into `NarrativeOverlay`. |
| `NarrativeOverlay` | [`src/experience/scenes/shared/NarrativeOverlay.tsx`](src/experience/scenes/shared/NarrativeOverlay.tsx) | Renders the animated text overlays during scenes. Supports highlight phrases rendered with `GradientText`. |
| `ShowcaseLyricsDisplay` | [`src/experience/scenes/showcase/ShowcaseLyricsDisplay.tsx`](src/experience/scenes/showcase/ShowcaseLyricsDisplay.tsx) | Displays per-scene lyric/text lines with a PS2-style bloom flash appear/disappear animation. Uses `BlurText`. |
| `ProductChoiceScene` | [`src/experience/scenes/showcase/ProductChoiceScene.tsx`](src/experience/scenes/showcase/ProductChoiceScene.tsx) | Interactive yes/no choice scene within the showcase. User decision is logged as a `choice_made` event. |
| `SecondaryCtaScene` | [`src/experience/scenes/showcase/SecondaryCtaScene.tsx`](src/experience/scenes/showcase/SecondaryCtaScene.tsx) | CTA scene shown after the product choice — prompts further engagement. |
| `Scene12` | [`src/experience/scenes/showcase/Scene12.tsx`](src/experience/scenes/showcase/Scene12.tsx) | Final scene of the Red Bull showcase. Custom layout distinct from the standard `ShowcaseScene`. |
| `ShowcaseTimeline` | [`src/experience/scenes/showcase/ShowcaseTimeline.ts`](src/experience/scenes/showcase/ShowcaseTimeline.ts) | GSAP timeline configuration for the showcase — controls animation cues per scene. |

---

## In-Experience UI

| Component | File | Purpose |
|---|---|---|
| `ChapterNav` | [`src/experience/ui/ChapterNav.tsx`](src/experience/ui/ChapterNav.tsx) | Navigation bar inside the experience. Lets users jump between parts and chapters. Plays UI sounds on interaction. |
| `ShowcaseChapterProgress` | [`src/experience/ui/ShowcaseChapterProgress.tsx`](src/experience/ui/ShowcaseChapterProgress.tsx) | Circular progress indicator (bottom corner) showing how far through the 12-scene showcase the user is. |
| `ButterflySwarm` | [`src/experience/ui/ButterflySwarm.tsx`](src/experience/ui/ButterflySwarm.tsx) | CSS-animated butterflies spawned on the left and right screen edges. Decorative ambient motion, kept away from centre UI. |
| `CinematicShell` | [`src/experience/ui/CinematicShell.tsx`](src/experience/ui/CinematicShell.tsx) | Wrapper used by `StoryHomePage`, `ProductsPage`, and `ContactPage`. Provides the shared dark background image and fixed-inset layout. |

---

## Loaders

The loader system uses a **variant registry** — `Experience.tsx` selects a variant based on which story part is active, and `LoaderOverlay` renders it.

| Component | File | When shown |
|---|---|---|
| `LoaderOverlay` | [`src/experience/loaders/shared/LoaderOverlay.tsx`](src/experience/loaders/shared/LoaderOverlay.tsx) | Orchestrator. Renders the correct variant, plays associated audio, handles fade-in/out. |
| `LoaderShell` | [`src/experience/loaders/shared/LoaderShell.tsx`](src/experience/loaders/shared/LoaderShell.tsx) | Shared wrapper `div` used by most loader variants. Provides the square card layout. |
| `BirdSvg` | [`src/experience/loaders/shared/BirdSvg.tsx`](src/experience/loaders/shared/BirdSvg.tsx) | Butterfly-wing SVG with CSS 3D flap animation (`balFlapLeft3D` / `balFlapRight3D`). Used by variants a–e and pre. |
| **Pre-loader** (`pre`) | [`src/experience/loaders/preloader/Loader.tsx`](src/experience/loaders/preloader/Loader.tsx) | Shown on initial app/showcase load while 3D and video assets are fetched. Uses `LoaderFive` from [`src/components/ui/loader.tsx`](src/components/ui/loader.tsx) with a stable progress footer. |
| Loader A (`a`) | [`src/experience/loaders/loader-a/Loader.tsx`](src/experience/loaders/loader-a/Loader.tsx) | Part 0 between-scene loader. BirdSvg + sun + wind lines + flowers + clouds. |
| Loader B (`b`) | [`src/experience/loaders/loader-b/Loader.tsx`](src/experience/loaders/loader-b/Loader.tsx) | Part 1 between-scene loader. |
| Loader C (`c`) | [`src/experience/loaders/loader-c/Loader.tsx`](src/experience/loaders/loader-c/Loader.tsx) | Part 2 between-scene loader. |
| Loader D (`d`) | [`src/experience/loaders/loader-d/Loader.tsx`](src/experience/loaders/loader-d/Loader.tsx) | Part 3 between-scene loader. Includes flame particles. |
| Loader E (`e`) | [`src/experience/loaders/loader-e/Loader.tsx`](src/experience/loaders/loader-e/Loader.tsx) | Part 4 between-scene loader. |
| Loader F (`f`) | [`src/experience/loaders/loader-f/Loader.tsx`](src/experience/loaders/loader-f/Loader.tsx) | Part 5+ between-scene loader. Plays `Bat - Halloween.webm` video. Used for the Red Bull showcase chapter. |

---

## Audio

| Component / Service | File | Purpose |
|---|---|---|
| `UiSoundProvider` | [`src/experience/audio/UiSoundProvider.tsx`](src/experience/audio/UiSoundProvider.tsx) | Context provider. Wraps the app and exposes `UiSoundService` via context. Enables/disables sounds based on user preferences. |
| `UiSoundService` | [`src/experience/audio/uiSoundService.ts`](src/experience/audio/uiSoundService.ts) | Class that manages UI sound playback (hover, click, gate). Primed on first pointer/keydown interaction to satisfy browser autoplay rules. |
| `useUiSounds` | [`src/experience/audio/useUiSounds.ts`](src/experience/audio/useUiSounds.ts) | Hook used by every interactive component (`playHover`, `playNavClick`, `playGateClick`). |
| `uiSounds` | [`src/experience/audio/uiSounds.ts`](src/experience/audio/uiSounds.ts) | Static map of generated Web Audio oscillator definitions for hover/click/gate sounds. No sound files are used for UI interaction sounds. |
| `OutsideShowcaseMusic` | [`src/experience/audio/OutsideShowcaseMusic.tsx`](src/experience/audio/OutsideShowcaseMusic.tsx) | Looping ambient background music (`showcase-ambient-loop.mp3`). Plays on all screens outside the 3D showcase. GSAP fade-in/out, auto-resume watchdog. |
| `useAmbientMusic` (showcase) | [`src/experience/scenes/showcase/useAmbientMusic.ts`](src/experience/scenes/showcase/useAmbientMusic.ts) | Hook managing music inside the showcase experience. |
| `useShowcaseSceneMusic` | [`src/experience/scenes/showcase/useShowcaseSceneMusic.ts`](src/experience/scenes/showcase/useShowcaseSceneMusic.ts) | Per-scene music switching logic within the showcase. |
| `soundContext` | [`src/experience/soundContext.tsx`](src/experience/soundContext.tsx) | React context exposing `soundEnabled` and `soundBlocked` to the loader system. |

---

## Story / State

| Component / Service | File | Purpose |
|---|---|---|
| `StoryProvider` | [`src/experience/story/StoryProvider.tsx`](src/experience/story/StoryProvider.tsx) | Context provider wrapping the experience. Holds `StoryState` (progress, preferences, checkpoints). Syncs to Supabase or falls back to local storage. |
| `manifest` | [`src/experience/story/manifest.ts`](src/experience/story/manifest.ts) | Defines the full story structure — all parts, chapters, and scenes. Source of truth for navigation and loader variant selection. |
| `selectors` | [`src/experience/story/selectors.ts`](src/experience/story/selectors.ts) | Pure functions for querying story state (e.g. `getPartDisplayList`). |
| `supabaseStoryService` | [`src/experience/story/service/supabaseStoryService.ts`](src/experience/story/service/supabaseStoryService.ts) | Reads/writes story progress to Supabase when configured. |
| `localStoryService` | [`src/experience/story/service/localStoryService.ts`](src/experience/story/service/localStoryService.ts) | Fallback service using `localStorage` when Supabase is not configured. |

---

## Services / Libraries

| Module | File | Purpose |
|---|---|---|
| `authService` | [`src/lib/authService.ts`](src/lib/authService.ts) | Handles login, registration, and session checks via Supabase. Returns typed `AuthResult`. Validates username format server-side. |
| `eventsService` | [`src/lib/eventsService.ts`](src/lib/eventsService.ts) | Append-only event log to Supabase `story_events` table. Tracks every user action (`session_started`, `scene_entered`, `choice_made`, `navigation_action`, etc.). |
| `supabase` | [`src/lib/supabase.ts`](src/lib/supabase.ts) | Supabase client singleton. Gracefully no-ops when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are not set. |
| `cdn` | [`src/config/cdn.ts`](src/config/cdn.ts) | `mediaUrl()` and `useCdnImage()` helpers. Resolves asset paths via `VITE_R2_PUBLIC_BASE_URL`, with optional Supabase storage fallback via `VITE_SUPABASE_STORAGE_URL`. |
| `utils` | [`src/lib/utils.ts`](src/lib/utils.ts) | `cn()` — Tailwind class merging utility (clsx + tailwind-merge). |
| `ragService` | [`src/lib/ragService.ts`](src/lib/ragService.ts) | Local chatbot retrieval layer. Embeds user queries, scores local knowledge chunks, and builds context-aware system prompts for Ollama. |

---

## Hooks (Experience)

| Hook | File | Purpose |
|---|---|---|
| `useDirectorTimeline` | [`src/experience/hooks/useDirectorTimeline.ts`](src/experience/hooks/useDirectorTimeline.ts) | Drives the GSAP timeline for a scene based on scroll progress. |
| `useLoadingController` | [`src/experience/hooks/useLoadingController.ts`](src/experience/hooks/useLoadingController.ts) | Manages the show/hide logic of the between-scene loader overlay. |
| `useScrollCamera` | [`src/experience/hooks/useScrollCamera.ts`](src/experience/hooks/useScrollCamera.ts) | Moves the camera along a path as the user scrolls. |
| `useSmoothScroll` | [`src/experience/hooks/useSmoothScroll.ts`](src/experience/hooks/useSmoothScroll.ts) | Applies inertia/damping to raw scroll input. |
| `scrollProgressContext` | [`src/experience/hooks/scrollProgressContext.tsx`](src/experience/hooks/scrollProgressContext.tsx) | Context exposing the current scroll progress (0–1) to scene children. |
| `useDisposableGLTF` | [`src/hooks/useDisposableGLTF.ts`](src/hooks/useDisposableGLTF.ts) | Loads a GLTF model and disposes its geometry/materials on unmount to prevent memory leaks. |

---

## Utility Components

| Component | File | Purpose |
|---|---|---|
| `BlurText` | [`src/components/BlurText.tsx`](src/components/BlurText.tsx) | Renders text with a blur-in animation. Used by `ShowcaseLyricsDisplay`. |
| `GradientText` | [`src/components/GradientText.tsx`](src/components/GradientText.tsx) | Wraps text in a gold/white gradient. Used for highlight phrases in `NarrativeOverlay`. |
| `ProgressBarCircle` | [`src/components/base/progress-indicators/progress-circles.tsx`](src/components/base/progress-indicators/progress-circles.tsx) | Circular SVG progress indicator. Used by `ShowcaseChapterProgress`. |
| `DebugOverlay` | [`src/experience/utils/DebugOverlay.tsx`](src/experience/utils/DebugOverlay.tsx) | Dev-only overlay showing scene/camera debug info. Not rendered in production. |
| `ScrollIndicator` | [`src/experience/scenes/shared/ScrollIndicator.tsx`](src/experience/scenes/shared/ScrollIndicator.tsx) | Animated "scroll to continue" hint shown at the start of a scene. |
