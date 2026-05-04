# LUME — User Workflow

A linear map of every screen a user passes through, in order, with the file responsible for each one.

---

## 1. Gate (Auth)

**Screen key:** `gate`
**File:** [`src/experience/ui/PreloadGate.tsx`](src/experience/ui/PreloadGate.tsx)

The first thing every user sees. Two sub-states managed inside the same component:

- **`checking`** — silently verifies whether an existing session cookie is valid (instant, no UI flash).
- **`auth`** — if no session, shows a username + password form (Aceternity `PlaceholdersAndVanishInput`). The access password is set via `VITE_ACCESS_PASSWORD`. On success, creates or logs in the user via Supabase and transitions to `ready`.
- **`ready`** — shows the animated "Play" button. Clicking it calls `onStart`, which moves the app to `home`.

**Exits to:** `home`

---

## 2. Home

**Screen key:** `home`
**File:** [`src/experience/ui/StoryHomePage.tsx`](src/experience/ui/StoryHomePage.tsx)

The main landing page inside the experience. Contains:

- A hero section with the LUME headline and the three showcase cards (3D-card Aceternity component).
- A feature band section with the Red Bull product image and copy.
- A footer.

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click a showcase card | → `titlecard` (if showcase chapter) or `experience` directly |
| Click "Product" in nav | → `products` |
| Click "Contact" in nav | → `contact` |

---

## 3. Showcase Title Card *(conditional)*

**Screen key:** `titlecard`
**File:** [`src/experience/ui/ShowcaseTitleCard.tsx`](src/experience/ui/ShowcaseTitleCard.tsx)

Only shown when the selected chapter is a showcase chapter (e.g. the Red Bull experience). Acts as a cinematic intro screen before entering the 3D experience.

- Displays the LUME logo, "Cinematic Product Showcase" eyebrow, and a **Play** button (Aceternity `HoverBorderGradient`).
- Clicking Play fades the card out and transitions to `experience`.

**Exits to:** `experience`
**Back button exits to:** `home`

---

## 4. Experience (3D)

**Screen key:** `experience`
**File:** [`src/experience/Experience.tsx`](src/experience/Experience.tsx)

The core 3D cinematic experience powered by React Three Fiber. Contains:

- An **initial preloader** (`variant="pre"`) — shown while 3D assets load. Uses the `BirdSvg` (flapping wings) with sunbeams and rising flowers. File: [`src/experience/loaders/preloader/Loader.tsx`](src/experience/loaders/preloader/Loader.tsx)
- **Between-scene loaders** (`variant` a–f) — shown when navigating between chapters. The active variant depends on which story part is loaded (Red Bull showcase = variant `f`, the bat video).
- **Chapter navigation** — `ChapterNav` lets users scrub between the 12 scenes.
- **Showcase progress bar** — `ShowcaseChapterProgress` shows progress through the showcase.
- A **back button** always visible, returning to `home`.

**Exits to:** `home` (back button)

---

## 5. Products

**Screen key:** `products`
**File:** [`src/experience/ui/ProductsPage.tsx`](src/experience/ui/ProductsPage.tsx)

A filterable grid of all LUME product collaborations (drinks, fragrances, fashion). 

- Category filter tabs: All / Drink / Fragrance / Fashion.
- Each live product card (currently only Red Bull) is clickable and leads into the experience via the same `titlecard → experience` flow.
- Coming-soon cards are display-only.
- Card spotlight effect: mouse position drives a CSS `--spotlight-x/y` gradient on hover.
- Cards blur on hover of siblings (focus-cards behaviour, pure CSS).

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click a live product card | → `titlecard` → `experience` |
| Click "Home" in nav | → `home` |
| Click "Contact" in nav | → `contact` |
| Back button | → `home` |

---

## 6. Contact

**Screen key:** `contact`
**File:** [`src/experience/ui/ContactPage.tsx`](src/experience/ui/ContactPage.tsx)

Static editorial page explaining LUME's invitation-only access philosophy. Three numbered statements describe the access model.

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click "Home" in nav | → `home` |
| Click "Product" in nav | → `products` |
| Back button | → `home` |

---

## 7. Admin *(hidden)*

**Screen key:** `admin`
**File:** [`src/experience/ui/AdminPage.tsx`](src/experience/ui/AdminPage.tsx)

Accessed via `window.location.hash = "#admin"`. Not reachable through the normal UI. Used for internal tooling.

**Exits to:** `home` (back button)

---

## Full Flow Diagram

```
[Gate]
  └─ auth passed
       └─► [Home]
              ├─► [Products]
              │      ├─► [Contact]
              │      └─► [Title Card] ──► [Experience]
              ├─► [Contact]
              │      └─► [Products]
              └─► [Title Card] ──► [Experience]

(#admin hash) ──► [Admin]
```

---

## Persistent UI (all screens except gate)

| Component | File | Purpose |
|---|---|---|
| `AppBackButton` | [`src/experience/ui/AppBackButton.tsx`](src/experience/ui/AppBackButton.tsx) | Back arrow, always returns to `home` |
| `OutsideShowcaseMusic` | [`src/experience/audio/OutsideShowcaseMusic.tsx`](src/experience/audio/OutsideShowcaseMusic.tsx) | Ambient music outside the 3D experience |
| `OllamaChat` | [`src/components/chat/OllamaChat.tsx`](src/components/chat/OllamaChat.tsx) | Floating AI chat widget |
| `HeadphonesIcon` | inline in `App.tsx` | Reminder to use headphones, fixed bottom-right |
| `MediaQualitySettings` | [`src/experience/ui/MediaQualitySettings.tsx`](src/experience/ui/MediaQualitySettings.tsx) | Video quality toggle (Normal / High), hidden during showcase |
| `PhoneExperienceNotice` | [`src/experience/ui/PhoneExperienceNotice.tsx`](src/experience/ui/PhoneExperienceNotice.tsx) | Notice shown on mobile devices (gate screen only) |
