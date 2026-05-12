# GPT Routing Plan

## Purpose

LUME is no longer just a cinematic showcase. It is becoming a serious website-building product, and routing is now a necessary part of the architecture.

The goal is to move from the current internal `AppScreen` state machine to real URL-based routing while preserving the cinematic experience, sound triggers, page transitions, and current feature behavior.

This plan focuses on a Vite React app. It does not require migrating to Next.js.

## Current Problem

The app currently uses internal state:

```ts
const [screen, setScreen] = useState<AppScreen>(...)
```

This means the current page is controlled by React state, not by the browser URL.

Current limitations:

- browser back/forward does not map cleanly to app navigation
- product detail pages are not naturally shareable
- vehicle detail pages are not naturally shareable
- only limited hash routes exist, such as `#admin` and `#vehicles`
- navigation behavior is centralized in `App.tsx`
- `App.tsx` must know too much about every page
- global components like `Dock` and `Header` depend on manually passed screen props

This worked for a cinematic prototype. It will not scale well for a website-building product.

## Recommendation

Use real client-side routing.

Recommended router:

```txt
React Router
```

Reason:

- mature
- simple mental model
- works well with Vite
- supports nested routes
- supports lazy route modules
- supports browser history
- supports route params for products and vehicles
- does not require a full framework migration

TanStack Router is also strong, especially for type-safe routes, but React Router is the safer first routing migration for this codebase because it is simpler and more widely understood.

## Target Route Map

Recommended initial route map:

```txt
/                         gate or home depending on access state
/home                     home/story page
/products                 products listing
/products/:productId      product detail
/vehicles                 vehicles listing
/vehicles/:vehicleId      vehicle detail
/showcase                 showcase listing
/showcase/titlecard       showcase titlecard
/experience               cinematic experience
/contact                  contact page
/admin                    admin page
```

Possible later routes:

```txt
/projects
/projects/:projectId
/components
/components/:componentId
/components/:componentId/versions/:versionId
/datasets
/datasets/:datasetId
/ai/sessions/:sessionId
```

The first migration should focus only on existing screens.

## Important Routing Decision

Do not route every tiny cinematic state immediately.

For example, the internal chapter state inside the cinematic `Experience` can remain component state at first:

```txt
/experience
  internal state:
    partIndex
    chapterIndex
    showcaseChapterRevealed
```

Only promote it to route state later if users need deep links to exact chapters:

```txt
/experience/:partId/:chapterId
```

This avoids making the first router migration too large.

## Architecture Direction

Create an app-shell layer around routing:

```txt
src/app-shell/
  routes.tsx
  routePaths.ts
  routeConfig.ts
  NavigationProvider.tsx
  screenConfig.ts
  layoutVariants.ts
```

The router should own browser location.

The app-shell should own:

- route-to-screen mapping
- layout visibility
- header state
- dock state
- back-button behavior
- navigation sound triggers
- analytics events

Pages should not manually know how every other page is routed.

## Route Config

Create a typed route config.

Example:

```ts
export type AppRouteId =
  | "gate"
  | "home"
  | "products"
  | "productDetail"
  | "vehicles"
  | "vehicleDetail"
  | "showcase"
  | "titlecard"
  | "experience"
  | "contact"
  | "admin";
```

```ts
export type RouteConfig = {
  id: AppRouteId;
  path: string;
  section: "home" | "products" | "vehicles" | "showcase" | "contact" | "admin" | "experience";
  showHeader: boolean;
  showDock: boolean;
  showBackButton: boolean;
  dockVariant: "default" | "product" | "vehicle" | "showcase" | "immersive" | "hidden";
};
```

Example:

```ts
export const ROUTE_CONFIG: Record<AppRouteId, RouteConfig> = {
  home: {
    id: "home",
    path: "/home",
    section: "home",
    showHeader: true,
    showDock: true,
    showBackButton: false,
    dockVariant: "default",
  },
  productDetail: {
    id: "productDetail",
    path: "/products/:productId",
    section: "products",
    showHeader: true,
    showDock: true,
    showBackButton: true,
    dockVariant: "product",
  },
};
```

## Navigation API

Create a navigation adapter so components do not call React Router directly everywhere.

Example:

```ts
type NavigateOptions =
  | { route: "home" }
  | { route: "products" }
  | { route: "productDetail"; productId: string }
  | { route: "vehicles" }
  | { route: "vehicleDetail"; vehicleId: string }
  | { route: "showcase" }
  | { route: "contact" }
  | { route: "admin" };
```

```ts
function navigateTo(target: NavigateOptions) {
  // maps route IDs to real paths
}
```

This keeps components stable if routing implementation changes later.

The Dock should use:

```ts
const { currentRoute, navigateTo } = useNavigation();
```

Instead of receiving everything through props.

## Migration Strategy

Do not migrate everything at once.

Use a staged migration where the router is introduced first, then screens are moved one by one.

## Phase 1: Install Router And Add Route Shell

Tasks:

- Install `react-router-dom`.
- Wrap the app in `BrowserRouter`.
- Create `src/app-shell/routes.tsx`.
- Create `src/app-shell/routeConfig.ts`.
- Keep current `App.tsx` behavior as close as possible.

Goal:

- app still renders
- no visual change
- no page behavior change

## Phase 2: Extract AppScreen And Route Mapping

Tasks:

- Move `AppScreen` out of `App.tsx`.
- Add mapping between old screens and new routes.
- Create helpers:

```ts
screenToPath(screen, params)
pathToRoute(location)
```

Goal:

- old screen model and new route model can temporarily coexist
- migration does not need to be big-bang

## Phase 3: Move Static Pages To Routes

Migrate simpler pages first:

```txt
/home
/products
/vehicles
/showcase
/contact
```

Keep product detail, vehicle detail, titlecard, and experience for later.

Tasks:

- Replace top-level ternary rendering for these screens with route elements.
- Keep the same lazy imports.
- Keep the same props temporarily.
- Use route navigation instead of `setScreen` for these pages.

Goal:

- browser back/forward starts working for main pages
- Dock/Header can begin reading location

## Phase 4: Move Product And Vehicle Detail To Param Routes

Routes:

```txt
/products/:productId
/vehicles/:vehicleId
```

Tasks:

- Replace `selectedProductId` state with `useParams().productId`.
- Replace `selectedVehicleId` state with `useParams().vehicleId`.
- Update product card click:

```ts
navigateTo({ route: "productDetail", productId });
```

- Update vehicle card click:

```ts
navigateTo({ route: "vehicleDetail", vehicleId });
```

Goal:

- detail pages become shareable
- browser refresh keeps the selected item
- selected item is URL-owned, not state-owned

## Phase 5: Move Layout Components To Route Context

Tasks:

- Make `SiteHeader` read active section from route config.
- Make `BottomDock` read dock variant from route config.
- Make `AppBackButton` read back behavior from navigation context.
- Remove manual `currentScreen` props where possible.

Goal:

- Dock can shift version depending on page
- Header and Dock are no longer tightly coupled to `App.tsx`

## Phase 6: Preserve Navigation Sound And Analytics

Routing must not break the current feel of the app.

Tasks:

- Add a navigation wrapper that plays sounds before navigation.
- Log route transitions centrally.
- Preserve current `logStoryEvent` behavior.
- Track previous route and duration.

Example:

```ts
navigateTo({ route: "vehicles" }, { sound: "nav.toVehicles" });
```

Goal:

- route migration does not make the site feel less cinematic

## Phase 7: Handle Gate And Admin

Routes:

```txt
/
/admin
```

Decision:

- `/` can show the gate until the user enters.
- After entry, navigate to `/home`.
- `/admin` replaces `#admin`.

Tasks:

- remove hash-only admin behavior
- support direct `/admin`
- preserve admin exit behavior

Goal:

- no more hash routing for real pages

## Phase 8: Handle Experience And Titlecard

Routes:

```txt
/showcase/titlecard
/experience
```

Keep internal part/chapter state for now.

Tasks:

- Route to titlecard when a showcase chapter is selected.
- Route to experience when user presses play.
- Pass entry part/chapter state through navigation state or query params.

Recommended first approach:

```ts
navigate("/experience", {
  state: { partIndex, chapterIndex }
});
```

Possible later approach:

```txt
/experience/:partIndex/:chapterIndex
```

Goal:

- preserve current cinematic flow without over-routing internal scene state

## Phase 9: Remove Old Screen State

Once routes own all screens:

- remove `screen` state from `App.tsx`
- remove `navigateToScreen`
- remove hash change listener
- remove selected product/vehicle state
- simplify `App.tsx`

Goal:

- `App.tsx` becomes app shell, not app router

## Phase 10: Update Vercel SPA Fallback

Because the app is still Vite, Vercel must serve `index.html` for all frontend routes.

Keep SPA fallback:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Important:

- `/api/*` rewrite must come before SPA fallback.
- direct visits to `/products/red-bull-special-edition` must return the app.
- client router then renders the correct page.

## Back Button Strategy

Use browser history where possible.

Recommended rules:

- If there is meaningful browser history, use `navigate(-1)`.
- If user lands directly on a detail page, fallback to parent route.
- Product detail fallback: `/products`.
- Vehicle detail fallback: `/vehicles`.
- Admin fallback: `/home`.
- Experience fallback: `/home` or `/showcase` depending on entry source.

This is better than hardcoding every back path in `App.tsx`.

## Dock Routing Behavior

The Dock should become route-aware.

Example:

```ts
type DockVariant =
  | "default"
  | "product"
  | "vehicle"
  | "showcase"
  | "immersive"
  | "hidden";
```

Route config decides the variant:

```ts
/products/:productId -> product
/vehicles/:vehicleId -> vehicle
/showcase -> showcase
/experience -> hidden
```

This enables:

```txt
default dock on normal pages
product-specific dock on product detail
vehicle-specific dock on vehicle detail
hidden dock during immersive experience
```

No page should manually tell the Dock what version to render.

## Testing Checklist

- `npm run typecheck`
- `npm test`
- `npm run build`
- direct visit `/home`
- direct visit `/products`
- direct visit `/products/:productId`
- direct visit `/vehicles`
- direct visit `/vehicles/:vehicleId`
- direct visit `/showcase`
- direct visit `/contact`
- direct visit `/admin`
- browser back from product detail returns correctly
- browser back from vehicle detail returns correctly
- refresh on product detail preserves product
- refresh on vehicle detail preserves vehicle
- Dock active state matches route
- Header active state matches route
- gate flow still works
- showcase titlecard flow still works
- experience flow still works
- sound triggers still fire on intentional navigation

## Risks

### Cinematic Flow Regression

Routing can make transitions feel more mechanical if navigation sound/state is not preserved.

Mitigation:

- use a navigation adapter
- keep sound triggers centralized
- migrate the immersive experience last

### Detail Page Refresh Bugs

Product and vehicle detail pages currently depend on selected state.

Mitigation:

- move IDs into route params
- load detail data from catalog/API by param

### Over-Routing Internal Experience State

Trying to route every chapter immediately would make the first migration too large.

Mitigation:

- route only major pages first
- keep chapter state internal until needed

### Vercel Rewrite Issues

Direct route visits can fail if SPA fallback is wrong.

Mitigation:

- keep API rewrite before fallback
- test direct route refreshes before deploy

## Success Criteria

Routing migration is successful when:

- real URLs exist for all major pages
- product detail pages are shareable
- vehicle detail pages are shareable
- browser back/forward works
- Dock variants are driven by route config
- Header active state is driven by route config
- `App.tsx` no longer owns every screen transition
- current cinematic flows still work
- no major visual regressions occur

## Final Recommendation

Routing should now be treated as a core product requirement.

Do not jump to Next.js just for routing. The correct next step is:

```txt
Vite + React Router + app-shell route config
```

That gives LUME real website navigation while preserving the current frontend and keeping the future backend-only plan intact.
