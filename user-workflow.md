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
- A background image from `src/experience/assets/images/lume-homepage-background.png`.
- A feature band section with the Red Bull product image and copy.
- A footer.

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click a showcase card | → `titlecard` (if showcase chapter) or `experience` directly |
| Click "Product" in nav | → `products` |
| Click "Showcase" in nav | → `showcase` |
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

- An **initial preloader** (`variant="pre"`) — shown while 3D and showcase media assets load. Uses `LoaderFive` from [`src/components/ui/loader.tsx`](src/components/ui/loader.tsx), rendered by [`src/experience/loaders/preloader/Loader.tsx`](src/experience/loaders/preloader/Loader.tsx).
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
- Product metadata comes from [`src/experience/products/catalog.json`](src/experience/products/catalog.json).
- Every product card is clickable and opens a product detail page.
- Products without uploaded images intentionally render a brand placeholder.
- Card spotlight effect: mouse position drives a CSS `--spotlight-x/y` gradient on hover.
- Cards blur on hover of siblings (focus-cards behaviour, pure CSS).

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click a product card | → `productDetail` |
| Click "Home" in nav | → `home` |
| Click "Showcase" in nav | → `showcase` |
| Click "Contact" in nav | → `contact` |
| Back button | → `home` |

---

## 6. Product Detail

**Screen key:** `productDetail`
**File:** [`src/experience/ui/ProductDetailPage.tsx`](src/experience/ui/ProductDetailPage.tsx)

Editorial detail page for one product from the central catalog.

- Shows the product image when available.
- Falls back to a brand placeholder if the R2 image is missing or not assigned.
- Shows a showcase CTA when the product has a live `showcase` mapping.

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click "View Showcase" on a live product | → `titlecard` → `experience` |
| Click "Back to Products" | → `products` |
| Click "Home" in nav | → `home` |
| Click "Products" in nav | → `products` |
| Click "Showcase" in nav | → `showcase` |
| Click "Contact" in nav | → `contact` |
| Back button | → `products` |

---

## 7. Showcase Index

**Screen key:** `showcase`
**File:** [`src/experience/ui/ShowcasePage.tsx`](src/experience/ui/ShowcasePage.tsx)

Dedicated index of cinematic showcase entries. It uses the same central product
catalog for preview images as the homepage cards.

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click a showcase card | → `titlecard` → `experience` |
| Click "Home" in nav | → `home` |
| Click "Products" in nav | → `products` |
| Click "Contact" in nav | → `contact` |
| Back button | → `home` |

---

## 8. Contact

**Screen key:** `contact`
**File:** [`src/experience/ui/ContactPage.tsx`](src/experience/ui/ContactPage.tsx)

Static editorial page explaining LUME's invitation-only access philosophy. Three numbered statements describe the access model.

**Navigation available from here:**

| Action | Destination |
|---|---|
| Click "Home" in nav | → `home` |
| Click "Product" in nav | → `products` |
| Click "Showcase" in nav | → `showcase` |
| Back button | → `home` |

---

## 9. Admin *(hidden)*

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
              │      ├─► [Product Detail]
              │      │      └─► [Title Card] ──► [Experience]
              │      ├─► [Showcase]
              │      └─► [Contact]
              ├─► [Showcase] ──► [Title Card] ──► [Experience]
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
| `OllamaChat` | [`src/components/chat/OllamaChat.tsx`](src/components/chat/OllamaChat.tsx) | Optional floating AI chat widget, shown only when `VITE_ENABLE_LOCAL_CHAT=true` |
| `MediaQualitySettings` | [`src/experience/ui/MediaQualitySettings.tsx`](src/experience/ui/MediaQualitySettings.tsx) | Video quality toggle (Normal / High), hidden during showcase |
| `PhoneExperienceNotice` | [`src/experience/ui/PhoneExperienceNotice.tsx`](src/experience/ui/PhoneExperienceNotice.tsx) | Notice shown on mobile devices (gate screen only) |
