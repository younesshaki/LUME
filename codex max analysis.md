# Codex Max Analysis

Detailed project analysis and execution plan for the LUME cinematic product showcase.

Last reviewed from branch: `aceternity-updates`

## Implementation Progress

Current implementation branch: `codex-max`

### Completed In First P0 Pass

- Created `codex-max` from `aceternity-updates`.
- Added this analysis file to the project as `codex max analysis.md`.
- Added GitHub Actions CI at `.github/workflows/ci.yml`.
- Added `npm run typecheck`.
- Added `npm run check:assets`.
- Added `scripts/check-r2-assets.mjs` to verify required R2 media keys.
- Added missing Vite environment typings in `src/vite-env.d.ts`.
- Feature-flagged the local Ollama chat widget with `VITE_ENABLE_LOCAL_CHAT`.
- Removed an admin-page debug `console.log` that printed session/profile details.
- Updated stale docs:
  - `README.md`
  - `components-map.md`
  - `user-workflow.md`
  - `chatbot details.md`
  - `.github/agents/code-navigator.agent.md`
- Verified the first pass with:
  - `node --check scripts/check-r2-assets.mjs`
  - `npm run typecheck`
  - `npm run build`

### Completed After First P0 Pass

- Merged `chatbot-design` into `codex-max`.
- Brought in the newer chatbot work:
  - streaming Ollama responses
  - RAG context retrieval
  - persistent local chat history
  - local knowledge chunks and embeddings
  - chatbot UI motion/encryption/glow components
- Confirmed the local chat still remains production-guarded by `VITE_ENABLE_LOCAL_CHAT`.

### Next Recommended Work After Merge

1. Re-run `npm run typecheck` and `npm run build`.
2. Continue with the remaining P0 items:
   - normalize product image R2 paths
   - finish product asset upload/check workflow
   - clean any remaining stale docs
   - decide package manager source of truth

### Not Done Yet

- Full product image path normalization.
- Bundle splitting / route-level lazy loading.
- Font conversion/subsetting.
- Vitest or Playwright setup.
- UI sound preference rewiring.
- Centralized product catalog.
- Admin dashboard improvements.
- Mobile strategy improvements.
- Production security/cache headers.
- Package-manager cleanup.
- New showcase template system.

## Executive Summary

LUME is already a strong cinematic prototype: it has a gated entry, product/home/contact pages, a Red Bull showcase path, R2-hosted media, Supabase auth/event tracking, admin analytics, a local Ollama chat widget, Aceternity/shadcn UI pieces, and a complex React Three Fiber experience layer.

The next phase should focus less on adding random visual polish and more on making the project production-ready:

1. Finish the product/media system so every product card has a reliable R2 asset and a clear naming convention.
2. Reduce load time and bundle weight, especially the 1.6 MB JavaScript bundle and 1.8 MB font asset.
3. Clean up stale docs and stale comments so future AI/dev agents do not follow outdated instructions.
4. Harden auth, admin, analytics, and production configuration.
5. Add basic test and verification coverage around the user journey.
6. Turn the Red Bull showcase implementation into a repeatable template for future product showcases.

The highest-value next work is not one big rewrite. It is a set of targeted stabilization passes.

## Current Project Shape

### App Structure

Main files:

- `src/App.tsx` owns the screen state machine: `gate`, `home`, `products`, `contact`, `titlecard`, `experience`, `admin`.
- `src/experience/Experience.tsx` owns the R3F canvas, loader orchestration, chapter navigation, video preloading, sound state, story persistence, and showcase progress.
- `src/experience/scenes/showcase/` contains the Red Bull cinematic showcase system.
- `src/experience/ui/` contains the gate, home, product, contact, admin, navigation, title card, and overlay UI.
- `src/components/ui/` contains imported or locally recreated Aceternity/shadcn components.
- `src/lib/` contains Supabase, auth, event logging, and utilities.
- `src/config/cdn.ts` centralizes R2 and Supabase media URL handling.

### Current Strengths

- The project has a clear cinematic identity and a specific product/story direction.
- The app already has a full user flow from gate to home to title card to experience.
- Supabase migrations show real thinking around profiles, story states, events, admin access, and Discord notifications.
- R2 media loading is centralized through `mediaUrl()`, which makes future media changes manageable.
- The Red Bull showcase has dedicated preload logic and quality switching.
- UI sound is generated via Web Audio rather than fragile audio files.
- The admin page has useful live analytics foundations.
- The project already documents workflow, components, Aceternity usage, R2 upload workflow, and chatbot details.

### Current Weak Spots

- Documentation is drifting from code in several places.
- There is no automated test suite.
- There is no GitHub Actions build check.
- The main production bundle is too large.
- The local Ollama chatbot is always included on non-gate screens, even though it depends on local infrastructure.
- Some production config still assumes local development values.
- Several product image paths still point to expected future R2 keys that may not exist yet.
- The showcase is highly custom and not yet a reusable template for other product chapters.
- Some files contain debug logging that should be gated or removed before production.

## Evidence From Current Repo

### Build And Tooling

`package.json` has only:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview"
}
```

Originally missing:

- `test`
- `lint`
- `format`
- `e2e`

Implemented in the first `codex-max` pass:

- `typecheck` separate from build
- CI workflow
- `check:assets` R2 verification script

Current build output shows:

- Main JS bundle around `1.6 MB`.
- `Higher Jump` font around `1.8 MB`.
- Vite warns that chunks exceed `500 kB`.

### Documentation Drift

Files that originally had stale or partially incorrect statements and were updated in the first `codex-max` pass:

- `components-map.md`
- `user-workflow.md`
- `.github/agents/code-navigator.agent.md`
- `README.md`
- `chatbot details.md`

Remaining documentation risk:

- Keep these docs in sync as `chatbot-design`/RAG and future product showcase work continue to evolve.

### Media And Asset Flow

Central files:

- `src/config/cdn.ts`
- `src/experience/scenes/showcase/data/sceneAssets.ts`
- `src/experience/ui/ProductsPage.tsx`
- `r2-upload/products/README.md`

Current product card R2 paths:

- `blackredbullcycles.png`
- `starbucksLUME.png`
- `YSLfemmeLUME.png`
- `YSLmenLUME.png`
- `products/moet.webp`
- `products/hermes.webp`
- `products/rolex.webp`

Risk:

- Product paths are split between root-level R2 keys and `products/` folder keys.
- The remaining product images may not exist at those expected paths yet.
- There is no manifest or validation script to verify media exists before deployment.

### Performance Risk

Potential contributors:

- Heavy Three/R3F code in the main bundle.
- Local chat and admin included in app bundle.
- Font asset `Higher Jump.ttf` is very large.
- No manual chunking in `vite.config.ts`.
- No route-level lazy loading for top-level screens.
- Showcase preloading grabs videos aggressively, especially high quality.

### Production Config Risk

`vite.config.ts` default:

```ts
const ollamaHost = env.VITE_OLLAMA_HOST ?? 'http://192.168.11.118:11434';
```

Risk:

- This is useful locally but should not be a silent production default.
- The chat widget is rendered on every non-gate screen.
- On production, a local Ollama host is not reachable unless a real backend/proxy exists.

`PreloadGate.tsx` default:

```ts
VITE_ACCESS_PASSWORD ?? "lume"
```

Risk:

- Any `VITE_*` value is client-visible.
- The gate is a UX/access layer, not a secure secret.
- True security must be enforced server-side by Supabase policies and admin gates.

### State And Sound Architecture

`UiSoundProvider` tries to read `StoryContext`, but in `App.tsx` it wraps `StoryProvider`.

Current structure:

```tsx
<UiSoundProvider>
  ...
  <StoryProvider>
    ...
  </StoryProvider>
</UiSoundProvider>
```

Effect:

- `UiSoundProvider` cannot actually see story preferences.
- UI sounds default to enabled.
- `Experience` sound toggle controls showcase/audio preferences, but UI hover/click sound preference may not follow it.

### Security And Analytics

Good foundations:

- Supabase RLS policies exist.
- Admin checks use `am_i_admin()` security definer function.
- Username lookup avoids exposing profile details.
- Events are append-only.
- Last seen is updated server-side.

Risks:

- Admin page has `console.log` with session/profile details.
- No visible error states for failed admin data fetches.
- Admin access by `#admin` is hidden but still public route entry; it relies on Supabase auth, which is correct, but UX should make this explicit.
- Event logging is fire-and-forget, which is correct for UX but means missing analytics are easy to miss unless monitored.

## Priority Roadmap

## P0: Stabilize Current Product Before Adding More

These are the next tasks that should happen first.

### 1. Update Stale Documentation

Files to update:

- `components-map.md`
- `user-workflow.md`
- `.github/agents/code-navigator.agent.md`
- `README.md`

Required changes:

- Replace old preloader description with current `LoaderFive` implementation.
- Remove `HeadphonesIcon` references.
- Correct `uiSounds` description: generated oscillator sounds, not sound files.
- Correct CDN env var references to `VITE_R2_PUBLIC_BASE_URL`.
- Document the current product image paths.
- Document that Aceternity registry may require auth and local fallback is used.
- Update code navigator agent with current `src/experience/ui`, `src/experience/scenes/showcase`, and product page structure.

Acceptance criteria:

- A developer can read docs and correctly find current implementation files.
- No docs say `LoaderFour` is pending if `LoaderFive` is live.
- No docs describe removed UI.

### 2. Finish Product Image Wiring

Current completed product assets:

- Red Bull
- Starbucks
- YSL femme
- YSL men

Remaining expected assets:

- Moët
- Hermès
- Rolex

Recommended convention:

Put all product cards under:

```text
products/<product-id>.webp
```

Suggested final R2 keys:

```text
products/red-bull.webp
products/starbucks.webp
products/moet.webp
products/ysl-femme.webp
products/ysl-homme.webp
products/hermes.webp
products/rolex.webp
```

Then update `ProductsPage.tsx` to use only the folder convention.

Why:

- Current keys are mixed between R2 root and `products/`.
- Future contributors will guess wrong.
- R2 upload instructions already assume a `products/` folder.

Acceptance criteria:

- Every product card has an image or intentional placeholder.
- All image keys follow one naming convention.
- Product cards still fall back cleanly if an image fails.
- R2 upload docs match actual code.

### 3. Add Minimal CI

Create GitHub Actions workflow:

```text
.github/workflows/ci.yml
```

Run:

```sh
npm ci --legacy-peer-deps
npm run build
```

Optional later:

```sh
npm run lint
npm run test
npm run e2e
```

Acceptance criteria:

- Every push/PR to `main` and `aceternity-updates` runs a build.
- Build failures are visible before deploy.

### 4. Add Basic Test Setup

Add Vitest for unit/component-level tests:

```sh
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

Start with tests for:

- `mediaUrl()` and fallback URL behavior.
- `ProductsPage` image fallback behavior.
- `authService.sanitize` behavior through login/register inputs if exposed or refactored.
- `StoryProvider` local fallback behavior.
- `UiSoundService.canPlay` cooldown behavior if made testable.

Acceptance criteria:

- `npm test` exists.
- At least critical pure logic has coverage.
- Tests do not require Supabase or R2.

### 5. Fix UI Sound Preference Wiring

Problem:

- `UiSoundProvider` cannot read `StoryContext` because it is outside `StoryProvider`.

Options:

1. Move `StoryProvider` above `UiSoundProvider` where needed.
2. Split sound preference into a top-level provider/local storage setting.
3. Pass `soundEnabled` directly into `UiSoundProvider`.

Recommended:

- Keep `UiSoundProvider` top-level for all screens, but let it read from a top-level local preference first.
- Sync story preference into that top-level preference when the story provider is active.

Acceptance criteria:

- If sound is disabled, hover/click UI sounds stop everywhere.
- Preference persists between visits.
- The showcase music toggle and UI sound toggle do not contradict each other.

## P1: Performance And Loading Improvements

### 6. Split The Main Bundle

Current issue:

- Main JS bundle is around `1.6 MB`.
- Vite warns about chunk size.

Recommended changes:

- Lazy-load admin page.
- Lazy-load local chat.
- Lazy-load `Experience`.
- Lazy-load heavy R3F/showcase modules.
- Use `manualChunks` for vendor libraries:
  - `three`
  - `@react-three/fiber`
  - `@react-three/drei`
  - `gsap`
  - `supabase`
  - `motion`

Example target:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        three: ["three", "@react-three/fiber", "@react-three/drei"],
        animation: ["gsap", "motion"],
        supabase: ["@supabase/supabase-js"],
      },
    },
  },
}
```

Acceptance criteria:

- Initial non-experience screens load without pulling the full 3D/showcase stack.
- Vite chunk warning is reduced or intentionally managed.
- No visual regressions.

### 7. Optimize Fonts

Current issue:

- `Higher Jump.ttf` is around `1.8 MB`.

Recommended:

- Convert large TTF/OTF fonts to WOFF2.
- Subset fonts to only the glyphs actually used.
- Review font licenses before production use.
- Prefer `font-display: swap`.

Acceptance criteria:

- Font payload is significantly reduced.
- No visual layout jump that hurts the cinematic look.
- License status is documented.

### 8. Make Showcase Video Preloading Configurable

Current behavior:

- High quality preloads first two videos as blobs.
- Normal quality warms first two streams and hints the rest.
- Initial gate waits at least `7800ms`.

Potential issue:

- On slower networks, the user may wait too long.
- On memory-limited devices, high-quality blob storage may be heavy.

Recommended:

- Add network-aware defaults using `navigator.connection` where available.
- Default to `normal` quality for mobile or low-memory devices.
- Add a visible fallback if video preload errors repeatedly.
- Track preload duration in analytics.

Acceptance criteria:

- Slow network users still enter a usable experience.
- High quality remains available by user choice.
- Preloader progress feels honest and does not stall silently.

### 9. Add Asset Existence Verification

Add a script like:

```text
scripts/check-r2-assets.mjs
```

It should:

- Read known media paths from product and showcase manifests.
- HEAD request each R2 URL.
- Fail if required assets return non-200.
- Warn for optional assets.

Acceptance criteria:

- Before launch, one command verifies product images, videos, audio, and models exist.
- Missing assets are caught before users see placeholders.

## P1: Product And Showcase Expansion

### 10. Turn Showcase Data Into A Product Template

Current state:

- Red Bull showcase is strong but tightly coupled.
- `showcase-chapter-2` and `showcase-chapter-3` are placeholder chapters.
- Product page has several coming-soon cards but only Red Bull is live.

Recommended:

- Create a product/showcase manifest:

```ts
type ProductShowcase = {
  productId: string;
  brand: string;
  title: string;
  category: string;
  cardImage: string;
  chapterId: string;
  status: "live" | "coming-soon";
  media: {
    videos: string[];
    models?: string[];
    audio?: string[];
  };
};
```

Then derive:

- product card grid
- title card
- showcase chapter routing
- R2 asset check list

Acceptance criteria:

- Adding a new product does not require editing multiple unrelated files.
- Product card and showcase chapter stay in sync.
- Coming-soon/live state is data-driven.

### 11. Finish Product Cards As A Premium Product Catalog

Improvements:

- Make coming-soon cards visually intentional, not merely disabled.
- Add image treatment consistency: same crop ratio, same center composition.
- Add optional product detail overlay or quick view.
- Add "view concept" or "request access" CTA for coming soon products if desired.

Acceptance criteria:

- All cards look finished, even when not clickable.
- Visual quality does not depend on one asset looking better than others.

### 12. Define The Next Live Showcase

Pick one next product:

- Starbucks
- YSL femme
- YSL men

Recommended next:

- Starbucks if the goal is broader audience/product ritual.
- YSL femme if the goal is luxury/fragrance atmosphere.

Work needed:

- final copy
- 6-12 scene plan
- video/media list
- title card text
- product choice or CTA
- analytics IDs
- R2 upload plan

Acceptance criteria:

- One non-Red Bull product can be clicked from Products and enters its own polished flow.

## P1: UX And Accessibility

### 13. Keyboard And Focus Pass

Review:

- Gate auth form.
- Product filters/cards.
- Title card play button.
- Chapter navigation.
- Admin list rows.
- Chat widget.

Known issue:

- Some clickable list rows are `li` with `onClick` rather than buttons.
- Some hover-only effects need focus equivalents.

Acceptance criteria:

- All interactive controls are keyboard reachable.
- Focus states are visible.
- Non-button clickable elements become buttons or get correct role/key handlers.

### 14. Mobile Strategy

Current state:

- `PhoneExperienceNotice` warns mobile users that the experience is desktop optimized.

Need decide:

1. Desktop-only premium experience with a polished mobile notice.
2. Mobile-compatible reduced experience.

Recommended:

- For near-term, keep desktop-first but improve mobile fallback:
  - show product/catalog pages well on mobile
  - keep 3D experience opt-in
  - use normal quality by default on mobile
  - make chat not cover key controls

Acceptance criteria:

- Mobile users are not trapped or confused.
- Product pages remain usable.
- Heavy 3D path is clearly marked.

### 15. Audio UX Cleanup

Current state:

- UI sounds are generated by oscillator.
- Outside showcase music plays outside the showcase.
- Experience has a sound toggle.
- UI sound preference is not fully connected to story preference.

Recommended:

- Split controls:
  - Music on/off
  - UI sounds on/off
- Or intentionally combine them and make the implementation follow that.
- Add a first-interaction sound unlock state that is visually clear.

Acceptance criteria:

- User understands what "Sound On" controls.
- Preference persists.
- Browser autoplay restrictions do not create silent broken states.

## P1: Admin And Analytics

### 16. Clean Admin Debug Logging

Remove or gate:

```ts
console.log("[admin] session.user.id:", ...)
```

Keep warnings for failed auth/data loading, but avoid logging private identifiers in normal use.

Acceptance criteria:

- Production console does not print user IDs/profile details.
- Admin errors are shown in UI where useful.

### 17. Improve Admin Dashboard

Current admin page is useful but basic.

Add:

- filter by event type
- export CSV
- user detail drawer
- session duration summary
- choice conversion rate
- completion funnel
- "last 24 hours / 7 days / all time" range
- loading and error states for Supabase fetches

Acceptance criteria:

- Admin can answer: who entered, who finished, who chose yes/no, and where users drop off.

### 18. Add Analytics Health Checks

Because event logging is fire-and-forget:

- Add a small admin indicator showing last event received.
- Add warnings if events are not arriving.
- Track preload errors and media fallback events.

Acceptance criteria:

- You can detect broken analytics without inspecting Supabase manually.

## P1: Local Chat / AI Widget

### 19. Feature Flag The Chat Widget

Current:

- `OllamaChat` renders on every non-gate screen.
- It assumes an Ollama host/proxy exists.

Recommended:

- Add `VITE_ENABLE_LOCAL_CHAT=true`.
- Only render the widget when enabled.
- In production, default disabled unless a real backend is deployed.

Example:

```ts
const chatEnabled = import.meta.env.VITE_ENABLE_LOCAL_CHAT === "true";
{chatEnabled && screen !== "gate" && <OllamaChat />}
```

Acceptance criteria:

- Production users do not see a broken local AI widget.
- Local developers can enable it easily.

### 20. Keep Chat Streaming And RAG Docs Accurate

Current:

- `chatbot-design` has been merged into `codex-max`.
- The chatbot now streams responses with `stream: true`.
- The chatbot uses `ragService` for local context retrieval.
- Chat history persists locally in `localStorage`.

Next:

- Keep `chatbot details.md`, `components-map.md`, and README aligned with future chatbot changes.
- If the chatbot moves server-side, document the production API and rate-limit model.

Acceptance criteria:

- Docs match behavior.
- If streaming is added, UI updates token-by-token and handles cancellation.

### 21. Production AI Strategy

Decide:

- local-only developer assistant
- hidden admin-only assistant
- public LUME assistant
- no production assistant

If public:

- do not proxy directly to a local LAN IP
- create a real backend route
- add rate limits
- define system prompt and data boundaries

Acceptance criteria:

- The chat has a clear product purpose and infrastructure model.

## P2: Code Quality And Architecture

### 22. Break Up `Experience.tsx`

`Experience.tsx` currently owns too many responsibilities:

- R3F canvas setup
- loader state
- media preloading
- story persistence
- URL hash sync
- sound state
- chapter transitions
- showcase progress
- debug toggles

Refactor into hooks/components:

- `useExperienceRouting`
- `useExperienceLoaderState`
- `useShowcasePreloadGate`
- `useStoryCheckpointSync`
- `useExperienceTransition`
- `ExperienceCanvas`
- `ExperienceOverlays`

Acceptance criteria:

- `Experience.tsx` becomes orchestration, not implementation detail.
- Loader and media preload logic can be tested separately.

### 23. Centralize Product Data

Current:

- Product data lives inside `ProductsPage.tsx`.
- Showcase data lives elsewhere.

Recommended:

- Create `src/experience/products/catalog.ts`.
- Use it from `ProductsPage`, `StoryHomePage`, showcase routing, and R2 asset checks.

Acceptance criteria:

- Product changes happen in one file.
- Product card path and showcase chapter path cannot drift.

### 24. Remove Or Update Unused Legacy Components

Review:

- `LoginScreen.tsx` and `LoginScreen.css`
- `NomadHomePage.css`
- older loader variants if no longer used
- stale agent docs
- unused Aceternity components like `flip-words`

Acceptance criteria:

- Unused files are removed or explicitly documented as retained.
- New agents do not waste time reading dead paths.

### 25. Make Environment Types Complete

`src/vite-env.d.ts` should include all env vars used:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ACCESS_PASSWORD`
- `VITE_R2_PUBLIC_BASE_URL`
- `VITE_SUPABASE_STORAGE_URL`
- `VITE_USE_BACKEND`
- `VITE_OLLAMA_HOST`
- `VITE_OLLAMA_CHAT_URL`
- `VITE_OLLAMA_MODEL`
- future `VITE_ENABLE_LOCAL_CHAT`

Acceptance criteria:

- TypeScript knows every project env variable.
- README and env types match.

## P2: Deployment And Operations

### 26. Production Environment Checklist

Before launch, verify:

- R2 bucket is public or routed through intended CDN.
- `VITE_R2_PUBLIC_BASE_URL` points to final bucket/domain.
- Supabase URL and anon key are set.
- Supabase migrations are applied.
- Admin user is marked `is_admin=true`.
- Discord webhook setting is configured outside git if notifications are desired.
- `VITE_ACCESS_PASSWORD` is set, while understanding it is client-visible.
- Local chat is disabled or backed by production infrastructure.

Acceptance criteria:

- A fresh deployment works without local machine assumptions.

### 27. Vercel Config Review

Current `vercel.json` is simple and valid for SPA rewrites.

Potential additions:

- Cache headers for static assets.
- Security headers:
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
- CSP only after auditing R2/Supabase/media requirements.

Acceptance criteria:

- Static assets cache well.
- Basic security headers exist.
- No CSP breaks media playback.

### 28. Dependency Hygiene

Current:

- Both `package-lock.json` and `pnpm-lock.yaml` exist.
- `package.json` scripts use npm.
- `pnpm-workspace.yaml` exists.

Risk:

- Mixed package manager locks create confusion and inconsistent installs.

Recommended:

- Choose npm or pnpm.
- If npm, remove `pnpm-lock.yaml` and `pnpm-workspace.yaml`.
- If pnpm, update scripts/docs and remove `package-lock.json`.

Acceptance criteria:

- One package manager is the documented source of truth.
- CI uses the same package manager.

## P2: Content And Brand Polish

### 29. Content Review

Review:

- Gate copy.
- Product descriptions.
- Showcase scene text.
- Contact/access philosophy.
- Admin event labels.
- Loader text.

Acceptance criteria:

- Copy sounds intentional and consistent.
- Placeholder text is removed from live experiences.

### 30. Visual Consistency Pass

Targets:

- Product card image crops.
- Loader styling.
- Chat widget location and overlap.
- Back button position relative to chat/settings.
- Admin page density.
- Contact page typography.

Acceptance criteria:

- Persistent UI controls do not collide.
- Product and editorial pages share a coherent visual system.

### 31. Future Product Showcase System

For every new product, define:

- product card image
- title card image/logo
- 6 or 12 scene script
- scene videos
- audio track
- model/product detail asset if needed
- final CTA
- analytics event IDs
- R2 keys

Create a template file:

```text
docs/new-showcase-template.md
```

Acceptance criteria:

- Creating a new product showcase is a repeatable workflow.

## Suggested Execution Order

### Sprint 1: Stabilization

1. Update stale docs.
2. Normalize product image R2 paths.
3. Add CI build workflow.
4. Add env var typing and README updates.
5. Feature flag local chat.
6. Remove admin console logging.

### Sprint 2: Performance

1. Lazy-load `Experience`, `AdminPage`, and `OllamaChat`.
2. Add manual chunks.
3. Convert/subset large fonts.
4. Add media existence check script.
5. Tune video preload behavior for mobile/slow networks.

### Sprint 3: Product System

1. Create centralized product catalog.
2. Finish all product images.
3. Create showcase template.
4. Build the next live product flow.

### Sprint 4: Reliability

1. Add Vitest.
2. Add Playwright smoke test:
   - gate auth
   - home
   - products
   - title card
   - experience preloader
   - admin denied state
3. Add analytics health checks.
4. Add deployment checklist.

## High-Impact Quick Wins

These can be done fast and will improve the project immediately:

1. Fix documentation drift in `components-map.md` and `user-workflow.md`.
2. Add `VITE_ENABLE_LOCAL_CHAT` and default the chat off in production.
3. Add GitHub Actions build workflow.
4. Remove `console.log` from `AdminPage.tsx`.
5. Convert `Higher Jump.ttf` to WOFF2 or remove it from critical load if not necessary.
6. Normalize all product image paths under `products/`.
7. Add a `scripts/check-r2-assets.mjs` HEAD checker.
8. Add `npm run typecheck` as an explicit script.

## Risks To Watch

### User Experience Risks

- Long initial preload may feel broken without enough progress feedback.
- Mobile users may bounce if the desktop warning is too blunt or the page is still heavy.
- Chat widget can cover UI or look broken if local Ollama is unavailable.

### Technical Risks

- Large bundle slows first load.
- Mixed package managers can cause install drift.
- Docs drift can mislead AI/developers into changing wrong files.
- Supabase event logging can silently fail.
- Product media paths can break if R2 names are inconsistent.

### Production Risks

- `VITE_ACCESS_PASSWORD` is not secret.
- Local Ollama IP fallback must not be treated as production infra.
- Admin path is hidden, not secret; Supabase auth/RLS must remain correct.
- Large fonts and media can create poor performance on slower networks.

## Recommended Definition Of Done For Future Changes

Every meaningful change should include:

1. `npm run build` passes.
2. Relevant docs are updated if behavior changed.
3. R2 paths are verified if media changed.
4. Mobile layout is checked if UI changed.
5. Keyboard/focus behavior is checked if interaction changed.
6. Supabase/RLS assumptions are documented if auth/admin changed.
7. No debug console logs are left in production paths.

## Final Recommendation

The project should next move from "cinematic prototype with many good systems" to "production-ready product showcase platform." The highest leverage work is:

1. Make the current Red Bull path stable and fast.
2. Make product media and showcase data repeatable.
3. Add CI/testing so future visual changes do not quietly break the app.
4. Clean documentation so future AI agents and developers can confidently modify the codebase.

Do those before building the next large cinematic chapter.
