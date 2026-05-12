# Component Scalability Architecture Assessment

## Purpose

This document evaluates the current LUME frontend architecture from the perspective of future component scalability.

The specific future goal is:

- Work on components in isolation.
- Let components still react to global website state.
- Allow components such as the Dock to shift versions depending on the current page.
- Avoid making every page manually wire every global behavior.

Example future requirement:

```txt
The Dock should shift to a different version depending on which page the user is on.
```

## Current Assessment

The project is currently moving in the right visual direction, but its software architecture is still closer to a single cinematic app shell than a mature component system.

That is acceptable for the current phase. The app is still relatively contained, and most global behavior is controlled from `App.tsx`.

The main scalability issue is that global behavior is currently passed through many manual props:

```ts
onGoHome
onNavigateToProducts
onNavigateToVehicles
onNavigateToShowcase
onNavigateToContact
onSelectProduct
onSelectVehicle
```

This works today, but it becomes harder as the app grows. Every new global behavior forces changes across multiple pages.

## Current Strengths

- The app has a clear top-level shell in `App.tsx`.
- Navigation is centralized enough that screen transitions are still understandable.
- The Dock and Header already receive a shared current screen value.
- The app has clear feature areas: products, vehicles, showcase, contact, story.
- The current approach is simple and easy to debug.

## Current Scalability Risks

### 1. Prop Drilling

Many pages receive navigation callbacks manually. As new layout behaviors are added, this can spread quickly.

Example:

```tsx
<ProductsPage
  onGoHome={handleGoHome}
  onSelectProduct={handleSelectProduct}
  onNavigateToShowcase={handleNavigateToShowcase}
  onNavigateToContact={handleNavigateToContact}
  onNavigateToVehicles={handleNavigateToVehicles}
/>
```

This is fine for a few pages, but it becomes noisy when multiple global components need the same state.

### 2. Component Variants Are Not Yet Formalized

The Dock currently knows the current screen and navigation callback, but there is no formal concept of:

```ts
DockVariant
HeaderVariant
LayoutVariant
PageMode
```

Without these contracts, future page-specific component changes may become ad hoc.

### 3. App State And Layout State Are Mixed

`App.tsx` currently owns:

- screen state
- selected product
- selected vehicle
- media quality
- navigation handlers
- back behavior
- header visibility
- dock visibility
- music behavior
- lazy page loading

That is manageable today, but it will become crowded as more component-level systems are added.

### 4. Components May Become Page-Aware In The Wrong Way

The Dock should not directly know how `ProductsPage`, `VehiclesPage`, or `ShowcasePage` work.

Instead, the Dock should know only:

```ts
currentScreen
navigationItems
dockVariant
activeEntity
```

That keeps the component reusable and isolated.

## Recommended Direction

Do not rewrite the app.

Instead, gradually introduce an app-shell layer that separates global state from page rendering.

Recommended direction:

```txt
App.tsx
  -> AppShell
  -> NavigationProvider
  -> LayoutStateProvider
  -> page renderer
  -> shared layout components
```

The goal is that global components like Dock, Header, Footer, Back Button, and Settings can read stable context instead of receiving many manually threaded props.

## Recommended Future Structure

```txt
src/app-shell/
  AppShell.tsx
  AppScreen.ts
  NavigationProvider.tsx
  LayoutStateProvider.tsx
  layoutVariants.ts
  screenConfig.ts

src/components/layout/
  SiteHeader/
  BottomDock/
  SiteFooter/
  AppBackButton/
  MediaQualitySettings/

src/features/products/
  ProductDetailPage.tsx
  ProductsPage.tsx
  productCatalog.ts
  productTypes.ts

src/features/vehicles/
  VehiclesPage.tsx
  VehicleDetailPage.tsx
  vehicleTypes.ts

src/features/showcase/
  ShowcasePage.tsx
```

This does not need to happen all at once. It can be done gradually as files are touched.

## Navigation Provider

The first useful improvement is a `NavigationProvider`.

It should own:

```ts
currentScreen
currentSection
selectedProductId
selectedVehicleId
navigate
goBack
goHome
```

The Dock could then use:

```ts
const { currentScreen, navigate } = useNavigation();
```

Instead of:

```tsx
<BottomDock currentScreen={layoutCurrentScreen} onNavigate={handleSiteNavigate} />
```

The long-term target is:

```tsx
<BottomDock />
```

The Dock can still be tested in isolation by mocking the provider or by passing optional override props in Storybook/test environments.

## Layout Variant Provider

The second useful improvement is a `LayoutStateProvider`.

It should expose:

```ts
headerVariant
dockVariant
footerVariant
backButtonMode
settingsMode
showHeader
showDock
showFooter
```

This lets layout components respond to page state without importing page components.

## Dock Variant System

For the Dock specifically, define an explicit variant contract.

Recommended type:

```ts
type DockVariant =
  | "default"
  | "product"
  | "vehicle"
  | "showcase"
  | "immersive"
  | "hidden";
```

Then define rules in one central place:

```ts
function getDockVariant(screen: AppScreen): DockVariant {
  if (screen === "productDetail") return "product";
  if (screen === "vehicleDetail") return "vehicle";
  if (screen === "showcase") return "showcase";
  if (screen === "experience") return "hidden";
  if (screen === "titlecard") return "hidden";
  if (screen === "gate") return "hidden";
  return "default";
}
```

The Dock should not decide these rules by itself. It should receive or read the variant.

## Example Dock Behavior

### Default Dock

Used on:

```txt
home
products
vehicles
contact
```

Items:

```txt
Home
Products
Vehicles
Showcase
Contact
```

### Product Dock

Used on:

```txt
productDetail
```

Possible behavior:

```txt
Back to Products
Home
Showcase
Contact
```

Or keep the same default items but visually emphasize Products.

### Vehicle Dock

Used on:

```txt
vehicleDetail
```

Possible behavior:

```txt
Back to Vehicles
Products
Compare
Contact
```

### Showcase Dock

Used on:

```txt
showcase
```

Possible behavior:

```txt
Home
Products
Vehicles
Contact
```

With a quieter visual treatment.

### Hidden Dock

Used on:

```txt
gate
titlecard
experience
admin
```

The cinematic or admin experience should not be interrupted by a bottom dock unless explicitly designed.

## Screen Config

Create one central screen config file.

Example:

```ts
type ScreenConfig = {
  screen: AppScreen;
  section: "home" | "products" | "vehicles" | "showcase" | "contact" | "admin" | "experience";
  showHeader: boolean;
  showDock: boolean;
  showBackButton: boolean;
  dockVariant: DockVariant;
};
```

Example config:

```ts
export const SCREEN_CONFIG: Record<AppScreen, ScreenConfig> = {
  home: {
    screen: "home",
    section: "home",
    showHeader: true,
    showDock: true,
    showBackButton: false,
    dockVariant: "default",
  },
  productDetail: {
    screen: "productDetail",
    section: "products",
    showHeader: true,
    showDock: true,
    showBackButton: true,
    dockVariant: "product",
  },
};
```

This prevents layout rules from being scattered across many components.

## Component Isolation Rules

Each scalable component should have:

- Clear props.
- Optional context access for app-level state.
- Documented variants.
- Isolated styles.
- No direct imports from unrelated page components.
- Predictable fallback behavior.
- A default version that works without page-specific logic.

For example, the Dock should know:

```txt
variant
currentScreen
items
activeItem
onNavigate
```

It should not know:

```txt
how ProductsPage renders
how VehiclesPage filters data
how ProductDetailPage chooses images
how VehicleDetailPage loads inventory
```

## How This Helps Future Work

With this structure, future component changes become smaller.

Example future request:

```txt
Make the Dock use a product-specific version on product detail pages.
```

Instead of editing multiple pages, the work becomes:

1. Add `"product"` variant to the Dock.
2. Update `getDockVariant()`.
3. Add variant-specific styles/items.
4. Verify product detail pages.

The page itself does not need to know how the Dock changes.

## Recommended Implementation Order

### Phase 1: Extract Screen Types

- Move `AppScreen` out of `App.tsx`.
- Create `src/app-shell/AppScreen.ts`.
- Export screen-related types from one place.

### Phase 2: Add Screen Config

- Create `screenConfig.ts`.
- Move `showSiteHeader`, current section mapping, and visibility rules into config.
- Keep behavior identical.

### Phase 3: Add Layout Variants

- Create `layoutVariants.ts`.
- Define `DockVariant`, `HeaderVariant`, and related helpers.
- Use `getDockVariant(screen)`.

### Phase 4: Refactor Dock To Variant Contract

- Let `BottomDock` accept or read `variant`.
- Keep current default behavior.
- Add support for future variant-specific item sets.

### Phase 5: Introduce Navigation Provider

- Move navigation handlers into a provider or app-shell hook.
- Let Header and Dock consume navigation from context.
- Gradually reduce prop drilling.

### Phase 6: Feature Folder Cleanup

- Move products into `src/features/products`.
- Move vehicles into `src/features/vehicles`.
- Keep shared layout components in `src/components/layout`.

This phase is optional and should happen gradually.

## What Not To Do

Do not rewrite everything immediately.

Avoid:

- Moving all files at once.
- Creating a complex global store before it is needed.
- Making every component depend on global context.
- Letting the Dock import page-specific components.
- Adding variants without a central naming system.

The right path is incremental.

## Bottom Line

The project is scalable enough for the next few features, but it needs an app-shell architecture before component behavior becomes heavily page-aware.

The most important next improvement is not a full rewrite. It is introducing stable contracts:

```txt
AppScreen
ScreenConfig
DockVariant
LayoutState
NavigationProvider
```

Once those exist, components like the Dock can evolve independently while still responding to the rest of the website.
