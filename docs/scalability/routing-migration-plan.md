# Routing Migration Plan — React Router v6

## Why This Is Needed Now

The app started as a cinematic prototype where a single `screen` state in `App.tsx` was sufficient.
It has grown beyond that. The current system has real product limitations:

- No shareable URLs — a user cannot link directly to a product, vehicle, or showcase page
- Browser back/forward does not work — users are trained to expect this
- Refreshing any page drops the user back to the gate screen
- The `#admin` and `#vehicles` hacks are workarounds, not a routing system
- `selectedProductId` and `selectedVehicleId` live in React state, not in the URL where they belong
- `App.tsx` owns all navigation logic, making it the bottleneck for every future feature

---

## Library Choice — React Router v6

**React Router v6** is the right choice for this project.

- Industry standard, well-documented, large community
- Works with Vite + React out of the box
- Supports lazy loading via `React.lazy` (already in use)
- `useNavigate`, `useParams`, `useLocation` hooks replace the current callbacks
- Does not dictate how transitions, sounds, or animations work — those stay under full control
- Designed as a migration path, not a rewrite requirement

TanStack Router is fully typed and powerful but adds complexity that is not yet justified here.

---

## Target URL Structure

| Current Screen | URL | Notes |
|---|---|---|
| `gate` | `/` | Preload gate overlay — does not need its own route |
| `home` | `/home` | Or redirect `/` → `/home` after gate completes |
| `products` | `/products` | Products catalog |
| `productDetail` | `/products/:productId` | `selectedProductId` becomes a URL param |
| `vehicles` | `/vehicles` | Vehicles catalog |
| `vehicleDetail` | `/vehicles/:vehicleId` | `selectedVehicleId` becomes a URL param |
| `showcase` | `/showcase` | Showcase landing |
| `titlecard` | `/showcase/intro` | Titlecard before cinematic experience |
| `experience` | `/showcase/experience` | Cinematic player |
| `contact` | `/contact` | Contact page |
| `admin` | `/admin` | Admin panel (was `#admin`) |

### Experience Deep Linking

The cinematic experience requires `entryPartIndex` and `entryChapterIndex`.
These should become search params, not path segments, since they are optional entry state:

```
/showcase/experience?part=0&chapter=2
```

This keeps the URL clean while making the entry point shareable and bookmarkable.

---

## What Moves Where

### State that moves to the URL

| Current | Becomes |
|---|---|
| `selectedProductId` | `/products/:productId` param |
| `selectedVehicleId` | `/vehicles/:vehicleId` param |
| `entryPartIndex` | `?part=` search param on `/showcase/experience` |
| `entryChapterIndex` | `?chapter=` search param on `/showcase/experience` |
| `screen` (navigation) | URL path — owned by the router |
| `#admin` hash | `/admin` route |
| `#vehicles` hash | `/vehicles` route |

### State that stays in React

| State | Why |
|---|---|
| `mediaQuality` | User preference, persisted in localStorage — not a navigation concept |
| `showcaseChapterRevealed` | Ephemeral cinematic state — not meaningful in a URL |
| Gate completion | Session-level flag — stored in memory or sessionStorage |

---

## The Gate Screen

The gate (preload screen) is a special case — it is not a navigable destination, it is a one-time entry flow.

**Recommended approach:** Keep the gate as a fullscreen overlay driven by a `gateCompleted` state flag, not a route. Once the user passes the gate, the flag is set (in memory or `sessionStorage`) and the overlay unmounts. Direct URL visits bypass the gate after the first session, which is the correct behavior for a real product — users sharing links should not be forced through the preloader every time.

---

## Sound Triggers

Navigation sounds are currently fired imperatively inside each `handleNavigateTo*` callback in `App.tsx`. With React Router, navigation is triggered via `useNavigate()` — the callback approach still works, it just calls `navigate('/products')` instead of `setScreen('products')`.

The cleanest pattern is a thin `useNavigateWithSound` hook:

```ts
function useNavigateWithSound() {
  const navigate = useNavigate();

  return {
    toHome:     () => { play("nav.toHome");     navigate("/home"); },
    toProducts: () => { play("nav.toProducts"); navigate("/products"); },
    toVehicles: () => { play("nav.toVehicles"); navigate("/vehicles"); },
    toShowcase: () => { play("nav.toShowcase"); navigate("/showcase"); },
    toContact:  () => { play("nav.toContact");  navigate("/contact"); },
    back:       () => { play("nav.back");       navigate(-1); },
  };
}
```

This keeps sound logic co-located with navigation and keeps it out of every page component.

---

## Migration Phases

### Phase 1 — Install and wrap (no behavior change)

Install React Router and wrap the app in `<BrowserRouter>`. Add a single catch-all route that renders the current `App` component unchanged. The app still works exactly as before. This is a zero-risk first step that proves the setup works.

```
npm install react-router-dom
```

```tsx
// main.tsx
import { BrowserRouter } from "react-router-dom";

<BrowserRouter>
  <App />
</BrowserRouter>
```

**Outcome:** App works identically. Router is in place.

---

### Phase 2 — Move screen types and screen config out of App.tsx

Before touching routing logic, extract the types that routing depends on.

Create `src/app-shell/AppScreen.ts`:
```ts
export type AppScreen =
  | "gate" | "home" | "products" | "productDetail"
  | "vehicles" | "vehicleDetail" | "showcase"
  | "contact" | "titlecard" | "experience" | "admin";
```

Create `src/app-shell/screenConfig.ts` — a typed record that centralizes all layout rules currently scattered across `App.tsx`:

```ts
type ScreenConfig = {
  showHeader: boolean;
  showDock: boolean;
  showBackButton: boolean;
  backDestination: AppScreen | null;
};

export const SCREEN_CONFIG: Record<AppScreen, ScreenConfig> = {
  home:          { showHeader: true,  showDock: true,  showBackButton: false, backDestination: null },
  products:      { showHeader: true,  showDock: true,  showBackButton: true,  backDestination: "home" },
  productDetail: { showHeader: true,  showDock: true,  showBackButton: true,  backDestination: "products" },
  vehicles:      { showHeader: true,  showDock: true,  showBackButton: true,  backDestination: "home" },
  vehicleDetail: { showHeader: true,  showDock: true,  showBackButton: true,  backDestination: "vehicles" },
  showcase:      { showHeader: true,  showDock: true,  showBackButton: true,  backDestination: "home" },
  contact:       { showHeader: true,  showDock: true,  showBackButton: true,  backDestination: "home" },
  titlecard:     { showHeader: false, showDock: false, showBackButton: true,  backDestination: "home" },
  experience:    { showHeader: false, showDock: false, showBackButton: true,  backDestination: "home" },
  admin:         { showHeader: false, showDock: false, showBackButton: true,  backDestination: "home" },
  gate:          { showHeader: false, showDock: false, showBackButton: false, backDestination: null },
};
```

**Outcome:** Layout rules are centralized. App.tsx gets shorter. No user-facing change.

---

### Phase 3 — Add real routes for static pages

Wire up routes for the pages that have no dynamic params first. These are the safest to migrate.

```tsx
// App.tsx or a new AppRouter.tsx
<Routes>
  <Route path="/home"     element={<StoryHomePage ... />} />
  <Route path="/products" element={<ProductsPage ... />} />
  <Route path="/vehicles" element={<VehiclesPage ... />} />
  <Route path="/showcase" element={<ShowcasePage ... />} />
  <Route path="/contact"  element={<ContactPage ... />} />
  <Route path="/admin"    element={<AdminPage ... />} />
  <Route path="/"         element={<GateOverlay ... />} />
</Routes>
```

Replace `navigateToScreen("products")` calls with `navigate("/products")` and fire sounds before navigating.

**Outcome:** Browser back/forward works for top-level pages. URLs are shareable. `selectedProductId` and `selectedVehicleId` still in state temporarily.

---

### Phase 4 — Add dynamic routes for detail pages

```tsx
<Route path="/products/:productId" element={<ProductDetailPage />} />
<Route path="/vehicles/:vehicleId"  element={<VehicleDetailPage />} />
```

Inside `ProductDetailPage`:
```ts
const { productId } = useParams();
```

`selectedProductId` and `selectedVehicleId` are removed from `App.tsx` state entirely. Navigating to a product becomes:
```ts
navigate(`/products/${productId}`);
```

**Outcome:** Product and vehicle pages are fully deep-linkable. Sharing a URL takes the recipient directly to that product or vehicle.

---

### Phase 5 — Add showcase experience routes

```tsx
<Route path="/showcase/intro"       element={<ShowcaseTitleCard />} />
<Route path="/showcase/experience"  element={<Experience />} />
```

The experience entry point reads part/chapter from search params:
```ts
const [params] = useSearchParams();
const partIndex  = Number(params.get("part")  ?? "0");
const chapterIndex = Number(params.get("chapter") ?? "0");
```

Navigating into the experience:
```ts
navigate(`/showcase/experience?part=${partIndex}&chapter=${chapterIndex}`);
```

**Outcome:** `entryPartIndex` and `entryChapterIndex` leave `App.tsx`. The experience is deep-linkable. Sharing a link to a specific showcase chapter works.

---

### Phase 6 — Introduce NavigationContext

Once routes are in place, introduce a thin `NavigationContext` that wraps `useNavigate` and `useLocation` and exposes the sound-aware navigation functions. Layout components (`BottomDock`, `SiteHeader`, `AppBackButton`) consume this context instead of receiving callbacks as props.

```tsx
// src/app-shell/NavigationContext.tsx
const NavigationContext = createContext(...);

export function NavigationProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const value = {
    currentPath: location.pathname,
    toHome:     () => { play("nav.toHome");     navigate("/home"); },
    toProducts: () => { play("nav.toProducts"); navigate("/products"); },
    // ...
    back:       () => { play("nav.back");       navigate(-1); },
  };

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
```

`BottomDock` and `SiteHeader` go from:
```tsx
<BottomDock currentScreen={layoutCurrentScreen} onNavigate={handleSiteNavigate} />
```
to:
```tsx
<BottomDock />
```

**Outcome:** Prop drilling for navigation is eliminated. `App.tsx` sheds most of its callback logic. Components are isolated and self-sufficient.

---

### Phase 7 — Clean up App.tsx

By Phase 6, `App.tsx` should own only:
- The gate overlay logic
- `mediaQuality` state and `showcaseChapterRevealed` state
- The `<Routes>` block
- The shell layout (header, dock, back button) driven by `screenConfig`

All navigation callbacks, all `handleNavigateTo*` functions, all `selectedProductId` / `selectedVehicleId` / `entryPartIndex` / `entryChapterIndex` state should be gone.

---

## What Not To Do

- **Do not migrate everything at once.** Each phase is independently deployable and safe to ship.
- **Do not put `mediaQuality` or `showcaseChapterRevealed` in the URL.** They are not navigation state.
- **Do not recreate the hash-based approach.** No `#products`, no `#vehicles`. Use real paths.
- **Do not let the gate become a route.** It is a session overlay, not a destination.
- **Do not remove sound triggers during the migration.** They are independent of routing — they stay.
- **Do not use `HashRouter`.** The app is deployed on Vercel which handles SPA fallback correctly via `vercel.json`. Use `BrowserRouter`.

---

## Vercel Configuration

Vercel needs a rewrite rule so that direct URL visits (e.g. `/products/red-bull`) serve `index.html` instead of returning 404. Add to `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This is a one-line addition and is required before Phase 3 ships to production.

---

## Summary

| Phase | What Changes | Risk |
|---|---|---|
| 1 | Install React Router, wrap app | Zero — no behavior change |
| 2 | Extract AppScreen + screenConfig types | Zero — no behavior change |
| 3 | Route static pages, real URLs | Low — back/forward starts working |
| 4 | Route detail pages, remove selectedId state | Low — products/vehicles deep-linkable |
| 5 | Route showcase/experience, remove entry state | Medium — test cinematic flows carefully |
| 6 | NavigationContext, remove prop drilling | Medium — all layout components updated |
| 7 | Clean up App.tsx | Low — mostly deletion |

Total estimated effort across all phases: **2–3 focused days**, done incrementally with a deployable result after each phase.
