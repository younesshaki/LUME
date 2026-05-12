# Routing Migration Plan — Combined

This document merges the Claude and GPT routing plans into a single authoritative migration plan, taking the strongest pieces of each.

> **Updated to align with `docs/vision/product-vision.md`.** LUME is becoming a multi-tenant business management SaaS, not just a cinematic site. The routing architecture must support a public site **and** an admin dashboard sub-app, with auth, tenant isolation, and a navigation API that the bot can call. The migration phases below remain valid, but the **target architecture is bigger than originally scoped**. See "Vision Alignment" below before reading the rest.

---

## Vision Alignment — What This Plan Now Must Account For

The routing migration is no longer just about replacing `screen` state with URLs on the existing public site. It is the foundation for two distinct apps under one codebase:

1. **The public site** (current) — cinematic, deep-linkable, customer-facing
2. **The admin dashboard** (future) — multi-page SaaS app where LUME's paying customers run their site

These two apps will share infrastructure (auth, design tokens, sound system, the navigation adapter itself) but must be cleanly separated in terms of routes, bundles, and access control.

### Five Things The Original Plan Missed

| Concern | Why It Matters Now |
|---|---|
| **Multi-tenancy** | Every customer has their own site. URLs may need to encode tenant context. |
| **Real auth** | The session-flag gate is fine for the public site. The admin dashboard needs real login, sessions, roles. |
| **Admin as a sub-app** | `/admin` will not be one page — it will be dozens of routes under `/admin/*`. Plan for the tree, not the leaf. |
| **Bundle isolation** | Admin code must never ship to public-site visitors. Public-site code does not need to ship to admin users. |
| **Bot as a navigation actor** | The typed `NavigateOptions` adapter is exactly what the bot will call. Design it as a public contract, not a private helper. |

### Updated Architectural Goals

- The public site and admin are routed as **two top-level trees** under one `<Routes>` block: `/*` for public, `/admin/*` for admin (or eventually a separate subdomain — see Multi-Tenancy below).
- All `/admin/*` routes are protected by an auth gate and rendered inside an `AdminShell` with its own layout (no cinematic dock, no public header).
- The admin tree is **lazy-loaded as a single chunk** and never enters the public-site bundle.
- The `NavigateOptions` adapter is a typed, programmatic API — callable by components, by the bot, by future automation.
- Customer-configurable, data-driven pages and components are a future requirement. The route system must be extensible enough to support routes that are defined in a database, not just hardcoded.

---

## Why This Is Needed Now

LUME has grown beyond a cinematic prototype. The single `screen` state in `App.tsx` is no longer enough.

Current limitations that hurt real users:
- No shareable URLs — a user cannot link directly to a product, vehicle, or showcase chapter
- Browser back/forward does not work — users expect this and are confused when it does not
- Refreshing any page drops the user back to the gate screen
- `#admin` and `#vehicles` hash routes are workarounds, not a routing system
- `selectedProductId` and `selectedVehicleId` live in React state, not in the URL where they belong
- `App.tsx` owns all navigation logic and has become the bottleneck for every future feature

Limitations that block the upcoming admin product:
- No auth-protected route boundary
- No place for an admin sub-app to live cleanly
- No code-splitting boundary between public and admin
- No tenant context in URLs or in the navigation API

---

## Library Choice — React Router v6

**React Router v6** is the right choice.

- Industry standard, mature, large community
- Works with Vite out of the box
- Supports `React.lazy` for route-level code splitting (already in use)
- `useNavigate`, `useParams`, `useLocation`, `useSearchParams` replace the current callbacks
- Does not dictate how transitions, sounds, or animations work — those stay under full control
- Designed as a migration path, not a rewrite

TanStack Router is more typed and powerful, but adds complexity that is not justified here yet. This decision can be revisited later.

**No move to Next.js.** Routing alone is not a reason to change frameworks. Stay on Vite + React.

---

## Target Route Map

| Current Screen | URL | Notes |
|---|---|---|
| `gate` | `/` | Preload gate overlay — not a route |
| `home` | `/home` | Story home |
| `products` | `/products` | Products catalog |
| `productDetail` | `/products/:productId` | `selectedProductId` becomes a URL param |
| `vehicles` | `/vehicles` | Vehicles catalog |
| `vehicleDetail` | `/vehicles/:vehicleId` | `selectedVehicleId` becomes a URL param |
| `showcase` | `/showcase` | Showcase landing |
| `titlecard` | `/showcase/intro` | Titlecard before experience |
| `experience` | `/showcase/experience` | Cinematic player — entry state via search params |
| `contact` | `/contact` | Contact page |
| `admin` | `/admin` | Replaces `#admin` |

### Future admin routes (planned, not part of this migration)

The current `/admin` is a placeholder. In the vision, it becomes an entire sub-app:

```
/admin                                  admin dashboard home
/admin/login                            auth entry
/admin/site/pages                       page list + add/remove/reorder
/admin/site/pages/:pageId               page editor
/admin/site/components                  component library + variants
/admin/site/components/:componentId     component config
/admin/site/design                      theme tokens (colors, fonts, dock variants)
/admin/site/assets                      uploaded media (images, 3D, video)
/admin/inventory/vehicles               vehicles table + CSV import
/admin/inventory/vehicles/:vehicleId    vehicle editor
/admin/inventory/products               products table + CSV import
/admin/inventory/products/:productId    product editor
/admin/bot/persona                      bot persona + tone config
/admin/bot/rag                          RAG knowledge base management
/admin/bot/actions                      bot action allowlist + config
/admin/bot/conversations                conversation logs
/admin/analytics                        visitor analytics + funnels
/admin/leads                            lead inbox
/admin/team                             team members + roles
/admin/billing                          plan + invoices
/admin/settings                         tenant settings + integrations
```

This tree is not built in the current migration — but the **route structure, auth boundary, layout, and bundle split must be set up** so it can be built into a clean foundation.

---

## What Moves Where

### Moves to the URL

| Current State | Becomes |
|---|---|
| `selectedProductId` | `/products/:productId` path param |
| `selectedVehicleId` | `/vehicles/:vehicleId` path param |
| `entryPartIndex` | `?part=` search param on `/showcase/experience` |
| `entryChapterIndex` | `?chapter=` search param on `/showcase/experience` |
| `screen` | URL path — owned by the router |
| `#admin` hash | `/admin` route |
| `#vehicles` hash | `/vehicles` route |

### Stays in React state

| State | Why |
|---|---|
| `mediaQuality` | User preference — already persisted in localStorage |
| `showcaseChapterRevealed` | Ephemeral cinematic state — not meaningful in a URL |
| Gate completion | Session-level flag — stored in `sessionStorage` |
| Internal experience scene state | Not meaningful as a URL until users need to deep-link to a chapter |

**Do not over-route.** Promote internal cinematic state to the URL only when users actually need to deep-link to it.

---

## Multi-Tenancy Strategy

The vision is multi-tenant: every business that pays for LUME has their own site. The URL strategy needs to be decided early because it cascades into auth, data scoping, and asset paths.

**Three viable approaches:**

| Approach | URL Shape | When To Pick |
|---|---|---|
| **Subdomain-based** | `acme.lume.app` for the customer site, `app.lume.app` for admin | Recommended long-term — clean tenant isolation, no path noise, customers can later upgrade to custom domains (`shop.acme.com`) |
| **Path-prefix** | `lume.app/t/acme/...` and `lume.app/admin/...` | Simpler short-term, no DNS work, but every route gains a prefix and breaks if you want custom domains later |
| **Single-tenant for now** | No tenancy in URLs yet; first customer is the only customer | Right answer for **right now** — defer the choice until the second customer is real |

**Recommended path:**
1. **Now (this migration):** Build single-tenant. No tenant prefix in URLs. The routing plan as written is correct for single-tenant.
2. **When the second customer arrives:** Move to subdomain-based tenancy. Public site lives at `{tenant}.lume.app`, admin lives at `app.lume.app`. The route paths inside each subdomain do not change. Tenant context comes from the subdomain, parsed once at app boot and made available via a `TenantProvider`.
3. **Custom domains (later):** Customers map `shop.acme.com` → `acme.lume.app` via CNAME. Tenant resolution checks both subdomain and host header.

This lets us avoid scope creep now while not painting into a corner. The `NavigationProvider` and `ROUTE_CONFIG` are tenant-agnostic by design — they care about paths, not hosts — so the subdomain migration later does not require rewriting them.

---

## Authentication & Protected Routes

The current `gateCompleted` session flag is fine for the public site's preload gate. **It is not auth.** The admin dashboard requires real authentication.

### Recommendation: Supabase Auth

Supabase is already used in this codebase. Supabase Auth gives us:
- Email + password, magic links, OAuth providers out of the box
- Row-level security tied to authenticated users (essential for multi-tenant data)
- A session model that integrates naturally with React (`onAuthStateChange`)
- Free tier covers early customers

### The Protected Route Pattern

```tsx
// src/app-shell/RequireAuth.tsx
function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoadingScreen />;
  if (!session) return <Navigate to="/admin/login" state={{ from: location }} replace />;
  return <>{children}</>;
}
```

```tsx
<Routes>
  <Route path="/*" element={<PublicShell />}>
    {/* public routes */}
  </Route>

  <Route path="/admin/login" element={<AdminLogin />} />
  <Route path="/admin/*" element={
    <RequireAuth>
      <AdminShell />
    </RequireAuth>
  } />
</Routes>
```

### Auth-Aware Navigation

The `NavigationProvider` already wraps `useNavigate`. Extend it to read the auth state and:
- Redirect unauthenticated `navigateTo({ route: "admin*" })` calls to `/admin/login`
- Persist the intended destination so login redirects the user back where they were trying to go

---

## The Admin Sub-App

`/admin/*` is **not a route**. It is a **sub-application** with its own shell, its own routing tree, its own layout, and its own bundle.

### File Structure

```
src/admin/
  AdminShell.tsx              admin layout (sidebar + topbar + content)
  AdminRouter.tsx             <Routes> for /admin/*
  AdminSidebar.tsx
  AdminTopbar.tsx
  routes/
    Dashboard.tsx
    site/
      PagesList.tsx
      PageEditor.tsx
      ComponentLibrary.tsx
      DesignTokens.tsx
      AssetLibrary.tsx
    inventory/
      VehiclesTable.tsx
      VehicleEditor.tsx
      ProductsTable.tsx
      ProductEditor.tsx
    bot/
      PersonaConfig.tsx
      RagManagement.tsx
      ActionsAllowlist.tsx
      ConversationLogs.tsx
    analytics/
      Overview.tsx
    leads/
      LeadInbox.tsx
    team/
      TeamMembers.tsx
    billing/
      Plan.tsx
    settings/
      TenantSettings.tsx
  components/                 admin-only UI primitives (tables, forms, etc.)
  hooks/
  lib/
```

### AdminShell Layout

The admin shell has nothing in common with the public site's cinematic shell:
- **No** cinematic dock, no scroll-velocity backdrop, no 3D viewer
- **Sidebar** for primary nav (Pages, Inventory, Bot, Analytics, Leads, Team, Billing, Settings)
- **Topbar** with breadcrumbs, current tenant indicator, user menu
- **Content area** that renders the matched admin route

The admin can reuse design tokens, but its component library is different.

### Bundle Isolation

```tsx
const AdminRouter = lazy(() => import("./admin/AdminRouter"));

<Route path="/admin/*" element={
  <RequireAuth>
    <Suspense fallback={<AdminLoading />}>
      <AdminRouter />
    </Suspense>
  </RequireAuth>
} />
```

Vite's code splitter will produce a separate chunk for everything reachable from `AdminRouter`. Public-site visitors never download admin code. This is a critical performance and security property.

**Conversely:** the admin should not pull in the heavy public-site code (3D viewer, cinematic scenes, ambient music). Any shared code lives in `src/shared/` or `src/lib/`. Public-site features under `src/experience/` are off-limits to admin imports.

A lint rule or import boundary check (`eslint-plugin-boundaries` or a TS path restriction) is worth adding once both sides exist.

---

## The Bot As A Navigation Actor

In the vision, the bot can perform actions on the visitor's behalf:
- "Take me to the BMW M4" → navigate to `/vehicles/bmw-m4`
- "Show me cars under $50k" → navigate to `/vehicles?maxPrice=50000`
- "Open the contact form" → navigate to `/contact` with pre-filled state

The typed `NavigateOptions` adapter from this migration is **the bot's action API**. It must be designed as a public contract from day one:

- **Discriminated union** — every action is typed and validated at the call site
- **Whitelist-only** — the bot can only call routes the customer has allowed (`/admin/bot/actions` configures this)
- **Auditable** — every bot-initiated navigation is logged via the same analytics path as user clicks, with a `source: "bot"` marker
- **Reversible where it matters** — opening a filter is fine; submitting a form is not. The action API distinguishes navigation from mutation.

### Implementation Sketch

```ts
type BotAction =
  | { kind: "navigate"; target: NavigateOptions }
  | { kind: "filter"; route: "vehicles" | "products"; filters: Record<string, unknown> }
  | { kind: "open-form"; form: "contact" | "lead"; prefill?: Record<string, string> };

function executeBotAction(action: BotAction, ctx: { tenant: TenantConfig }) {
  if (!ctx.tenant.botActionsAllowlist.includes(action.kind)) {
    return { ok: false, reason: "not-allowed" };
  }
  // dispatch...
}
```

The customer's bot configuration (`/admin/bot/actions`) edits the allowlist. The same `NavigationProvider` that powers human navigation powers bot navigation — there is only one source of truth for "how to get to a page."

---

## Bundle Isolation & Code Splitting

Three top-level chunks should be visible in `dist/`:

| Chunk | Contents | Loaded When |
|---|---|---|
| `public` (main) | Public site routes, layout, 3D viewer, cinematic scenes | Visiting `/`, `/products`, etc. |
| `admin` | Admin sub-app, sidebar, all admin routes | Visiting `/admin/*` after auth |
| `shared` | Design tokens, auth, navigation adapter, sound system, supabase client | Always |

Verify with `npm run build` after Phase 3 and after the admin sub-app skeleton lands. A visitor to `/products` should not download `admin.*.js`.

---

## Data-Driven Routes (Future)

Once customers can add and configure their own pages, some routes become data-driven:

```ts
// fetched from the database per tenant
const customPages = [
  { slug: "events", title: "Upcoming Events", components: [...] },
  { slug: "team",   title: "Our Team",        components: [...] },
];
```

These become a single dynamic route in React Router:

```tsx
<Route path="/:customSlug" element={<CustomPage />} />
```

`CustomPage` reads `useParams().customSlug`, fetches the page config, and renders the configured components. This must be the **last** matched route in the public tree, so it does not shadow `/products`, `/vehicles`, etc.

This is not built in the current migration, but the structure (catch-all dynamic route at the end of the public tree) needs to be anticipated.

---

## The Gate Screen

The gate is not a destination — it is a one-time entry overlay. It should not be a route.

**Pattern:** keep a `gateCompleted` flag in `sessionStorage`. While unset, show the gate overlay on top of `/` (and optionally on direct URL visits, but recommended to bypass after the first session). Once set, the overlay unmounts and the underlying route renders normally.

This is the right behavior for a real product — users sharing a link should not be forced through a preloader every time.

---

## Architecture — App Shell Layer

Create three top-level structural directories:

```
src/app-shell/                         shared infrastructure
  AppRouter.tsx                        top-level <Routes> — splits public vs admin
  routeConfig.ts                       typed config per public route
  routePaths.ts                        path constants + builders (public + admin)
  AppRouteId.ts                        AppRouteId type
  NavigationProvider.tsx               sound-aware, auth-aware navigation adapter
  navigationAdapter.ts                 navigateTo() with typed options
  layoutVariants.ts                    DockVariant, HeaderVariant
  RequireAuth.tsx                      auth gate for protected route trees
  AuthProvider.tsx                     Supabase Auth wrapper
  TenantProvider.tsx                   (deferred) tenant resolution

src/public-shell/                      public-site shell
  PublicShell.tsx                      layout (header + dock + back button)
  PublicRouter.tsx                     <Routes> for public tree

src/admin/                             admin sub-app (lazy-loaded)
  AdminShell.tsx                       sidebar + topbar layout
  AdminRouter.tsx                      <Routes> for /admin/*
  ... (full structure in "The Admin Sub-App" section above)
```

The router owns browser location. `app-shell` owns the cross-cutting concerns (auth, tenant, navigation adapter). `public-shell` and `admin` own their respective UI trees.

Pages do not know how other pages are routed — they call `navigateTo()` with a typed target.

---

## Typed Route Config

```ts
export type AppRouteId =
  | "gate" | "home" | "products" | "productDetail"
  | "vehicles" | "vehicleDetail" | "showcase"
  | "titlecard" | "experience" | "contact" | "admin";

export type DockVariant =
  | "default" | "product" | "vehicle"
  | "showcase" | "immersive" | "hidden";

export type RouteConfig = {
  id: AppRouteId;
  path: string;
  section: "home" | "products" | "vehicles" | "showcase" | "contact" | "admin" | "experience";
  showHeader: boolean;
  showDock: boolean;
  showBackButton: boolean;
  backFallback: AppRouteId | null;
  dockVariant: DockVariant;
};

export const ROUTE_CONFIG: Record<AppRouteId, RouteConfig> = {
  home:          { id: "home",          path: "/home",                  section: "home",       showHeader: true,  showDock: true,  showBackButton: false, backFallback: null,       dockVariant: "default" },
  products:      { id: "products",      path: "/products",              section: "products",   showHeader: true,  showDock: true,  showBackButton: true,  backFallback: "home",     dockVariant: "default" },
  productDetail: { id: "productDetail", path: "/products/:productId",   section: "products",   showHeader: true,  showDock: true,  showBackButton: true,  backFallback: "products", dockVariant: "product" },
  vehicles:      { id: "vehicles",      path: "/vehicles",              section: "vehicles",   showHeader: true,  showDock: true,  showBackButton: true,  backFallback: "home",     dockVariant: "default" },
  vehicleDetail: { id: "vehicleDetail", path: "/vehicles/:vehicleId",   section: "vehicles",   showHeader: true,  showDock: true,  showBackButton: true,  backFallback: "vehicles", dockVariant: "vehicle" },
  showcase:      { id: "showcase",      path: "/showcase",              section: "showcase",   showHeader: true,  showDock: true,  showBackButton: true,  backFallback: "home",     dockVariant: "showcase" },
  titlecard:     { id: "titlecard",     path: "/showcase/intro",        section: "showcase",   showHeader: false, showDock: false, showBackButton: true,  backFallback: "showcase", dockVariant: "hidden" },
  experience:    { id: "experience",    path: "/showcase/experience",   section: "experience", showHeader: false, showDock: false, showBackButton: true,  backFallback: "showcase", dockVariant: "hidden" },
  contact:       { id: "contact",       path: "/contact",               section: "contact",    showHeader: true,  showDock: true,  showBackButton: true,  backFallback: "home",     dockVariant: "default" },
  admin:         { id: "admin",         path: "/admin",                 section: "admin",      showHeader: false, showDock: false, showBackButton: true,  backFallback: "home",     dockVariant: "hidden" },
  gate:          { id: "gate",          path: "/",                      section: "home",       showHeader: false, showDock: false, showBackButton: false, backFallback: null,       dockVariant: "hidden" },
};
```

---

## Typed Navigation Adapter

Components should not call React Router directly everywhere. A typed adapter keeps the navigation API stable even if the underlying router changes.

```ts
export type NavigateOptions =
  // Public routes
  | { route: "home" }
  | { route: "products" }
  | { route: "productDetail"; productId: string }
  | { route: "vehicles" }
  | { route: "vehicleDetail"; vehicleId: string }
  | { route: "showcase" }
  | { route: "titlecard" }
  | { route: "experience"; partIndex?: number; chapterIndex?: number }
  | { route: "contact" }
  // Admin entry
  | { route: "adminLogin" }
  | { route: "adminDashboard" }
  // Future admin routes are added here as the admin app grows.
  // Each admin route is its own typed variant so the bot, components,
  // and tests can navigate to them safely.
  ;

export type NavigateMeta = {
  sound?: SoundKey;
  source?: "user" | "bot" | "system";  // for analytics
};
```

The discriminated union encodes param requirements at the type level — `productDetail` cannot be called without `productId`.

### NavigationProvider

```tsx
function NavigationProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const navigateTo = useCallback((target: NavigateOptions, meta?: NavigateMeta) => {
    if (meta?.sound) play(meta.sound);

    switch (target.route) {
      case "home":          return navigate("/home");
      case "products":      return navigate("/products");
      case "productDetail": return navigate(`/products/${target.productId}`);
      case "vehicles":      return navigate("/vehicles");
      case "vehicleDetail": return navigate(`/vehicles/${target.vehicleId}`);
      case "showcase":      return navigate("/showcase");
      case "titlecard":     return navigate("/showcase/intro");
      case "experience": {
        const params = new URLSearchParams();
        if (target.partIndex    !== undefined) params.set("part",    String(target.partIndex));
        if (target.chapterIndex !== undefined) params.set("chapter", String(target.chapterIndex));
        return navigate(`/showcase/experience?${params}`);
      }
      case "contact":       return navigate("/contact");
      case "admin":         return navigate("/admin");
    }
  }, [navigate]);

  return <NavigationContext.Provider value={{ navigateTo, currentPath: location.pathname }}>
    {children}
  </NavigationContext.Provider>;
}
```

Components consume it as:

```ts
const { navigateTo } = useNavigation();
navigateTo({ route: "productDetail", productId: "red-bull" }, { sound: "product.card.click" });
```

---

## Migration Phases

### Phase 1 — Install and Wrap (zero behavior change)

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

Add a catch-all route that renders the existing `App` unchanged. **Verify:** app behaves identically.

---

### Phase 2 — Extract Types and Config

- Move `AppScreen` → `src/app-shell/AppScreen.ts` (rename to `AppRouteId` for clarity)
- Create `routePaths.ts` with path constants and path builders
- Create `routeConfig.ts` with the typed `ROUTE_CONFIG` record above
- Create coexistence helpers for the migration window:

```ts
screenToPath(screen: AppRouteId, params?: object): string;
pathToRouteId(pathname: string): AppRouteId | null;
```

These let old screen state and new route state coexist during the migration. **No behavior change yet.**

---

### Phase 3 — Move Static Pages to Routes

Migrate the simple pages first (no dynamic params):

```tsx
<Routes>
  <Route path="/home"     element={<StoryHomePage />} />
  <Route path="/products" element={<ProductsPage />} />
  <Route path="/vehicles" element={<VehiclesPage />} />
  <Route path="/showcase" element={<ShowcasePage />} />
  <Route path="/contact"  element={<ContactPage />} />
</Routes>
```

Replace `navigateToScreen("products")` with `navigate("/products")`. Keep sound triggers wired the same way for now.

**Outcome:** Browser back/forward works for top-level pages. URLs are shareable. `selectedProductId` and `selectedVehicleId` still in state temporarily.

---

### Phase 4 — Move Detail Pages to Param Routes

```tsx
<Route path="/products/:productId" element={<ProductDetailPage />} />
<Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />} />
```

Inside `ProductDetailPage`:
```ts
const { productId } = useParams();
```

Remove `selectedProductId` and `selectedVehicleId` from `App.tsx` state entirely. Card clicks become:
```ts
navigateTo({ route: "productDetail", productId }, { sound: "product.card.click" });
```

**Outcome:** Detail pages are deep-linkable. Refresh preserves the selected item. Selected item is URL-owned.

---

### Phase 5 — Handle Gate, and Set Up Admin Shell + Auth

This phase is bigger than originally scoped because the admin sub-app foundation lands here.

**Gate:**
- Gate stays as a session overlay (not a route), gated by `sessionStorage`
- Remove the `#admin` and `#vehicles` hash listeners

**Admin shell + auth foundation:**
- Install Supabase Auth (already have Supabase in the project)
- Create `AuthProvider` in `src/app-shell/` exposing `{ session, user, loading, signIn, signOut }`
- Create `RequireAuth` wrapper
- Create the **admin shell skeleton** in `src/admin/`:
  - `AdminShell.tsx` — sidebar + topbar layout
  - `AdminRouter.tsx` — lazy-loaded `<Routes>` for `/admin/*`
  - `routes/Dashboard.tsx` — placeholder landing
  - `routes/AdminLogin.tsx` — email + password (or magic link)
- Wire `/admin/login` (public) and `/admin/*` (protected) into the top-level router
- Verify bundle isolation: `npm run build` and confirm `admin.*.js` is a separate chunk

**Why this happens now:** Before the layout refactor in Phase 7, the public `BottomDock` and `SiteHeader` need to know they should not render on `/admin/*` routes. Setting up the admin shell first makes the layout split explicit.

**Outcome:** No more hash routing. Admin is a real sub-app with its own auth-gated tree and its own bundle. The actual admin features inside it are still placeholders — they get built as separate workstreams later.

---

### Phase 6 — Showcase Titlecard and Experience

```tsx
<Route path="/showcase/intro"       element={<ShowcaseTitleCard />} />
<Route path="/showcase/experience"  element={<Experience />} />
```

Recommended initial approach for entry state: **search params** (shareable):

```ts
navigateTo({ route: "experience", partIndex: 0, chapterIndex: 2 }, { sound: "showcase.enter" });
// → /showcase/experience?part=0&chapter=2
```

Inside `Experience`:
```ts
const [params] = useSearchParams();
const partIndex    = Number(params.get("part")    ?? "0");
const chapterIndex = Number(params.get("chapter") ?? "0");
```

Keep internal chapter state (`partIndex` / `chapterIndex` after entry, `showcaseChapterRevealed`) as component state. Only promote to URL later if needed.

**Outcome:** Showcase entry is deep-linkable. Cinematic flow preserved.

---

### Phase 7 — Layout Components Read From Route Context

Refactor `BottomDock`, `SiteHeader`, `AppBackButton` to consume the navigation context instead of props.

Before:
```tsx
<BottomDock currentScreen={layoutCurrentScreen} onNavigate={handleSiteNavigate} />
```

After:
```tsx
<BottomDock />
```

`BottomDock` reads `currentPath` and the dock variant from `ROUTE_CONFIG` matched against the location. Same pattern for `SiteHeader`.

**Outcome:** Prop drilling for navigation is gone. The Dock can now ship different variants per route — the original motivating example finally has a clean home.

---

### Phase 8 — Back Button Strategy

Use browser history where it exists, fall back to route config otherwise:

```ts
function goBack() {
  play("nav.back");
  if (window.history.length > 1) {
    navigate(-1);
  } else {
    const fallback = ROUTE_CONFIG[currentRouteId].backFallback;
    if (fallback) navigate(ROUTE_CONFIG[fallback].path);
  }
}
```

This handles the case where a user lands directly on a detail page via a shared link — back goes to the parent route, not to a blank history entry.

---

### Phase 9 — Remove Old Screen State

Once routes own all screens:
- Remove `screen` state from `App.tsx`
- Remove `navigateToScreen`, all `handleNavigateTo*` callbacks, `handleBack`
- Remove `selectedProductId`, `selectedVehicleId`, `entryPartIndex`, `entryChapterIndex` state
- Remove the hash-change listener
- Remove the ternary screen renderer

`App.tsx` becomes a thin shell: `<NavigationProvider>` + `<AppShell>` + `<AppRouter>`.

---

### Phase 10 — Vercel SPA Fallback

Add to `vercel.json`:

```json
{
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Critical:** `/api/*` rewrite must come **before** the SPA fallback. Otherwise API routes get swallowed by `index.html`.

Test direct URL visits (`/products/red-bull`, `/vehicles/bmw-m4`) before deploy.

---

## Sound Triggers

Sound is preserved end-to-end via the navigation adapter:

```ts
navigateTo({ route: "vehicles" }, { sound: "nav.toVehicles" });
```

All existing sound keys (`nav.toHome`, `nav.toProducts`, `nav.toVehicles`, `nav.toShowcase`, `nav.toContact`, `nav.back`, `showcase.enter`, `product.card.click`) stay valid. The migration does not touch the sound system.

---

## Analytics

The current `logStoryEvent({ type: "navigation_action", ... })` call inside `logNavigationAction` must be preserved. Move it into `NavigationProvider` so it fires on every `navigateTo()` call. Track `previousPath`, `currentPath`, and `durationMs` centrally — no page needs to know about analytics.

---

## Testing Checklist

Before merging each phase:
- `npm run typecheck`
- `npm test`
- `npm run build`

Manual verification after Phase 10:
- Direct visit to `/home`, `/products`, `/vehicles`, `/showcase`, `/contact`, `/admin`
- Direct visit to `/products/:productId` and `/vehicles/:vehicleId`
- Browser back from product detail → returns to products
- Browser back from vehicle detail → returns to vehicles
- Refresh on product detail → preserves product
- Refresh on vehicle detail → preserves vehicle
- Dock active state matches current route
- Header active state matches current route
- Gate flow still works on first visit
- Showcase titlecard → experience flow still works
- Experience entry from `?part=0&chapter=2` lands on the right chapter
- All navigation sounds still fire
- Browser back from a direct-landed detail page falls back to parent route

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Cinematic flow feels mechanical after migration | Sound triggers stay centralized via the navigation adapter. Migrate experience last (Phase 6). |
| Detail page refresh breaks because state was lost | Move IDs into route params (Phase 4). Detail pages load data by param, not by previously selected state. |
| Over-routing internal experience state | Keep internal chapter state in components. Only promote to URL when users need deep links. |
| Vercel rewrites swallow API calls | Order matters — `/api/*` rewrite must come before SPA fallback. Test direct route refreshes before deploy. |
| Large App.tsx changes break unrelated things | Phased migration. Each phase is independently shippable. Coexistence helpers from Phase 2 let old and new systems run side by side. |

---

## Success Criteria

### Public-Site Routing (existing scope)
- Every major page has a real URL
- Product and vehicle detail pages are shareable and refresh-safe
- Browser back/forward works on every route
- Dock variant is driven by `ROUTE_CONFIG`, not by props from `App.tsx`
- Header active state is driven by `ROUTE_CONFIG`
- `App.tsx` no longer owns screen state or navigation callbacks
- All current cinematic flows still work
- All navigation sounds still fire
- No visual regressions

### Foundation For The Admin Product (vision-aligned scope)
- `/admin/*` is a separate route tree gated by `RequireAuth`
- The admin sub-app is lazy-loaded as its own bundle (`admin.*.js` visible in build output)
- A visitor to `/products` does **not** download admin code
- Supabase Auth is wired in and a working `/admin/login` exists
- `AdminShell` renders without any cinematic / public-site chrome
- The `NavigateOptions` adapter accepts admin routes and can be extended without touching components
- Bot-initiated navigation is possible through the same adapter (with a `source: "bot"` marker for analytics)
- A path exists for adding multi-tenant subdomain routing later without rewriting the navigation layer

---

## What Not To Do

- **Do not migrate everything at once.** Each phase is independently deployable.
- **Do not put `mediaQuality` or `showcaseChapterRevealed` in the URL.** They are not navigation state.
- **Do not recreate the hash-based approach.** No `#products`, no `#vehicles`. Use real paths.
- **Do not let the gate become a route.** It is a session overlay.
- **Do not over-route internal cinematic state.** Promote to URL only when users need it.
- **Do not use `HashRouter`.** Vercel handles SPA fallback correctly — use `BrowserRouter`.
- **Do not migrate to Next.js for routing alone.** Vite + React Router is the right fit.
- **Do not remove sound triggers during the migration.** They are independent of routing.

---

## Estimated Effort

| Phases | Scope | Effort |
|---|---|---|
| 1–2 | Setup, types, config | 2–3 hours |
| 3 | Static routes | 2–3 hours |
| 4 | Detail param routes | 3–4 hours |
| 5 | Gate + admin shell + Supabase Auth + bundle split | **1–2 days** (expanded scope) |
| 6 | Showcase + experience | 3–4 hours |
| 7 | Layout context | 3–4 hours |
| 8 | Back button | 1 hour |
| 9 | App.tsx cleanup | 1–2 hours |
| 10 | Vercel config + verification | 1 hour |

**Total: 4–5 focused days** with the admin foundation included. The original 2–3 day estimate covered only the public-site routing.

Each phase is still independently shippable. Phase 5 is the largest because it lays the groundwork for the entire future admin product — but it can be split further (gate cleanup → auth provider → admin shell skeleton → bundle verification) if shipping in smaller increments is preferred.

---

---

## Implementation Addendum (Read Before Coding)

This section captures concrete details from the existing codebase that an implementer needs to know. Without these, any implementer will either duplicate existing functionality or break it.

### A. Existing `vercel.json` Already Has The SPA Rewrite

**Do not overwrite the file.** It already contains the rewrite block, plus a headers block for security and caching that must be preserved.

Current state (already in repo):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

If an `/api/*` rewrite is ever added (e.g. for Vercel Functions), it must be inserted **before** the catch-all SPA rule.

**Phase 10 is therefore a verification step, not a creation step.** No edit needed unless API routes are introduced.

---

### B. Existing Auth Must Be Reused, Not Replaced

`src/lib/authService.ts` already exists and already integrates with Supabase Auth. Its surface:

```ts
sanitizeUsername(input: string): string | null
checkExistingSession(): Promise<AuthUser | null>
loginOrRegister(username, password, accessPassword): Promise<AuthResult>
// AuthResult includes `isNew: boolean` — auto-creates account on first login
```

It already:
- Uses `supabase.auth` for session management
- Reads/writes a `profiles` table for username mapping
- Has a `LOCAL_AUTH_KEY` localStorage fallback when Supabase is not configured (preview mode)

**Implementation rules:**
- The new `AuthProvider` is a **thin React Context wrapper** around the existing `authService` functions — not a rewrite.
- `RequireAuth` calls `checkExistingSession()` once on mount and subscribes to `supabase.auth.onAuthStateChange` for live updates.
- Do not introduce a new `signIn` path. Reuse `loginOrRegister`.
- Do not introduce a new auth table. The `profiles` table is the source of truth.
- The new `/admin/login` route renders a form that calls `loginOrRegister`. It can reuse `PlaceholdersAndVanishInput` for visual consistency.

### C. The Gate Already Contains Auth

`src/experience/ui/PreloadGate.tsx` is **not just a preload screen** — it is also where users currently log in via username/password. It has three phases: `checking`, `auth`, `ready`.

This means the "gate as session overlay" decision has a subtlety: **the gate currently gates both preload completion AND authentication**. The current behavior is:
1. Open site → gate shows
2. If session exists → skip auth, go to `ready`
3. If not → show username/password form
4. Submit credentials → if valid, go to `ready`
5. User clicks "Start" → app proceeds

**For this migration, do not change the gate's auth behavior.** The public site stays gated by the existing auth/preload flow. The new `/admin/login` is a *separate* entry point with the same backing auth — admins log in via either route and the session is shared.

A future cleanup can decouple "preload" from "auth," but it is **out of scope for this migration**.

---

### D. First User Creation

`loginOrRegister` auto-creates a user on first attempt with valid credentials (the `isNew: true` flag in `AuthResult`). **No signup route is needed.** The first admin user is created by visiting `/admin/login` and entering chosen credentials — the access password (`VITE_ACCESS_PASSWORD`) gates registration.

For early development, set `VITE_ACCESS_PASSWORD` in `.env.local` and the Vercel project env to a value only the team knows.

---

### E. Tenant Column Is Deferred

The plan keeps multi-tenancy out of scope for the routing migration. **Do not add a `tenant_id` column to `profiles` or anywhere else yet.** When the second customer arrives, a separate migration will introduce tenancy.

Acceptable assumption during implementation: **single-tenant**. All routes, all data, all assets belong to one tenant. The `NavigationProvider`, `RequireAuth`, and `AdminShell` are tenant-agnostic by design and will not need to be rewritten when tenancy lands.

---

### F. Environment Variables (Already Present)

The following must exist in `.env.local` and in Vercel project settings — both confirmed present:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ACCESS_PASSWORD` (used by `PreloadGate` and will be reused by `/admin/login`)

No new env vars are required for the routing migration.

---

### G. Concrete Code Snippets

#### G1. Gate As Overlay (Not A Route)

The gate is rendered as a fullscreen overlay above `<Outlet />`, controlled by session state — not by the router:

```tsx
// src/app-shell/PublicShell.tsx
export function PublicShell() {
  const { gatePassed, setGatePassed } = useGate();

  return (
    <>
      <Outlet />
      {!gatePassed && (
        <PreloadGate onStart={() => setGatePassed(true)} />
      )}
    </>
  );
}
```

`useGate` is a tiny hook that holds the flag in React state with a `sessionStorage` shadow:

```tsx
export function useGate() {
  const [gatePassed, set] = useState(() =>
    sessionStorage.getItem("lume.gate-passed") === "1"
  );
  const setGatePassed = (v: boolean) => {
    sessionStorage.setItem("lume.gate-passed", v ? "1" : "0");
    set(v);
  };
  return { gatePassed, setGatePassed };
}
```

This preserves the gate's current behavior end-to-end. Direct URL visits (`/products/red-bull`) still get gated on first session, then bypass on subsequent visits.

#### G2. Where `logStoryEvent` Fires In `NavigationProvider`

`logStoryEvent({ type: "navigation_action", ... })` already exists and is called from `App.tsx`. Move that call into the `navigateTo` function in `NavigationProvider`:

```tsx
const previousPathRef = useRef<string>(location.pathname);
const enteredAtRef = useRef<number>(Date.now());

const navigateTo = useCallback((target: NavigateOptions, meta?: NavigateMeta) => {
  if (meta?.sound) play(meta.sound);

  const fromPath = previousPathRef.current;
  const toPath = resolvePath(target);
  const durationMs = Math.max(0, Date.now() - enteredAtRef.current);

  void logStoryEvent({
    type: "navigation_action",
    payload: {
      action: meta?.source === "bot" ? "bot_navigate" : "navigate",
      fromScreen: fromPath,
      toScreen: toPath,
      durationMs,
      occurredAt: new Date().toISOString(),
    },
  });

  previousPathRef.current = toPath;
  enteredAtRef.current = Date.now();

  navigate(toPath);
}, [navigate, location.pathname]);
```

This preserves the analytics surface byte-for-byte and adds the `bot_navigate` distinction the vision requires.

#### G3. `vercel.json` Merge Note

Already covered in section A. **Do not create or overwrite `vercel.json`.** It is already correct.

---

### H. Minimum Test Coverage

The migration must add at least these tests. Each is small and high-value:

```ts
// tests/navigationAdapter.test.ts
test("navigateTo productDetail builds /products/:productId", () => {
  const path = resolvePath({ route: "productDetail", productId: "red-bull" });
  expect(path).toBe("/products/red-bull");
});

test("navigateTo experience encodes part and chapter as search params", () => {
  const path = resolvePath({ route: "experience", partIndex: 0, chapterIndex: 2 });
  expect(path).toBe("/showcase/experience?part=0&chapter=2");
});

// tests/routeConfig.test.ts
test("every AppRouteId has a ROUTE_CONFIG entry", () => {
  const ids: AppRouteId[] = [/* ... full list ... */];
  for (const id of ids) expect(ROUTE_CONFIG[id]).toBeDefined();
});

// tests/RequireAuth.test.tsx
test("RequireAuth redirects unauthenticated users to /admin/login", async () => {
  // render <RequireAuth><div>secret</div></RequireAuth> with no session
  // assert <Navigate to="/admin/login" /> rendered
});
```

This is the floor, not the ceiling. Page-level component tests can come later — these three protect the routing primitives that everything else depends on.

---

### I. Dual-Mode (Experience vs Normal) — Layout Variant, Not Route

The vision adds a future "experience mode vs normal mode" toggle — heavy cinematic experience vs lightweight browsing.

**Decision: this is a user preference, not a route.**

- URLs stay identical across modes (a shared link works for both)
- The mode is persisted in `localStorage` under `lume.viewing-mode.v1` with values `"experience" | "normal"`
- Layout components read the mode and adjust their variant: heavy 3D viewer vs static image, scroll-velocity backdrop vs plain background, animated transitions vs instant, etc.
- The mode plugs into the existing `DockVariant` / `LayoutVariant` system — no new routing concept is needed

**Implementation hook:** add a `ViewingMode` context alongside `NavigationProvider` in Phase 7 (layout context). The context exposes `{ mode, setMode }` and is read by any component that has a heavy/lite split. Pages do not need to be aware of mode — only the components that actually differ.

**Out of scope for this migration:** building the actual lite variants of components. That is a follow-up workstream. The migration only needs to put the context in place so those follow-ups have a clean home.

---

## Final Recommendation

Treat routing as the foundation of the entire product going forward, not as a public-site improvement.

```
Vite
+ React Router v6
+ app-shell route config
+ typed navigation adapter (NavigateOptions)
+ Supabase Auth + RequireAuth boundary
+ split route trees: /* (public) and /admin/* (admin sub-app, lazy)
+ bundle isolation between public and admin
+ tenant-agnostic now, subdomain-tenancy-ready later
```

This gives LUME:
- Real website navigation, deep linking, browser history (public-site needs)
- A foundation the admin product can be built on top of, without revisiting routing
- A navigation API the bot can call as a first-class actor
- A bundle structure that protects performance and security as the admin grows
- A path to multi-tenant subdomain routing that does not require rewriting any component code

The cinematic experience is preserved end-to-end. None of the existing features regress. Every phase is shippable on its own.
