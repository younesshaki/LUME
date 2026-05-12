# Code Organization Plan — Isolated Components, Harmonious System

## The Core Problem With The Current Structure

Right now files are organized by **type**:

```
src/components/
  Dock.tsx
  Dock.css
  layout/
    BottomDock.tsx
    BottomDock.css
```

When you work on the Dock, you touch files in multiple directories. When you delete a component, you hunt for orphaned CSS files. When a component grows (tests, animations, sound config, types), there is no natural home for those files — they scatter.

More critically: when the Compare panel pops up and the Dock needs to react, there is no clean system for that communication. The Dock ends up either importing the Compare feature directly (coupling), or App.tsx becomes the glue that knows about both (God component problem again).

This plan solves both problems.

---

## The Two Organizing Principles

### 1. Each Component Owns Its Folder

Every non-trivial component is a folder. Everything related to that component — markup, styles, animations, sound actions, types, hooks, tests — lives inside that folder. The folder exposes a clean public API via `index.ts`. Consumers import from the folder, not from internal files.

### 2. UIState Is The Harmony Layer

Components do not import each other. Instead, they communicate through a shared **UIState** — a lightweight, centralized store of cross-component awareness. When the Compare panel opens, it does not call the Dock. It updates the UIState: "compare panel is now active." The Dock reads that signal and decides — using its own animation code, inside its own folder — how to respond.

Neither knows the other exists. They are isolated. But they are in harmony.

---

## Target Folder Structure

```
src/
│
├── app-shell/                        routing, navigation, layout config
│   ├── NavigationProvider.tsx
│   ├── navigationAdapter.ts
│   ├── routeConfig.ts
│   ├── routeIds.ts
│   └── routePaths.ts
│
├── lib/                              cross-cutting infrastructure
│   ├── sound/                        centralized audio engine (stays here)
│   │   ├── audioEngine.ts
│   │   ├── sounds.ts                 global sound library
│   │   ├── actions.ts                global action → sound mappings
│   │   ├── SoundProvider.tsx
│   │   ├── useSound.ts
│   │   └── index.ts
│   │
│   ├── ui-state/                     ← NEW: the harmony layer
│   │   ├── UIStateProvider.tsx
│   │   ├── useUIState.ts
│   │   ├── uiStateTypes.ts
│   │   └── index.ts
│   │
│   ├── supabase.ts
│   ├── authService.ts
│   ├── eventsService.ts
│   ├── ragService.ts
│   └── utils.ts
│
├── components/                       reusable UI components
│   │
│   ├── Dock/                         ← component folder
│   │   ├── index.ts                  public API: export { Dock } from "./Dock"
│   │   ├── Dock.tsx                  markup and state
│   │   ├── Dock.css                  styles
│   │   ├── Dock.types.ts             DockItem, DockVariant, DockProps
│   │   ├── Dock.sounds.ts            sound actions owned by this component
│   │   ├── Dock.animations.ts        ← animation reactions to UIState (compare, filter, etc.)
│   │   └── Dock.test.tsx
│   │
│   ├── layout/
│   │   ├── BottomDock/
│   │   │   ├── index.ts
│   │   │   ├── BottomDock.tsx
│   │   │   ├── BottomDock.css
│   │   │   └── BottomDock.test.tsx
│   │   │
│   │   ├── SiteHeader/
│   │   │   ├── index.ts
│   │   │   ├── SiteHeader.tsx
│   │   │   ├── SiteHeader.css
│   │   │   └── SiteHeader.types.ts
│   │   │
│   │   └── nav/
│   │       ├── DesktopNav/
│   │       ├── MobileNav/
│   │       └── NavLink/
│   │
│   ├── three/
│   │   └── DetailModelViewer/
│   │       ├── index.ts
│   │       ├── DetailModelViewer.tsx
│   │       ├── DetailModelViewer.css
│   │       ├── ModelAsset.tsx
│   │       ├── ModelStage.tsx
│   │       └── modelTypes.ts
│   │
│   ├── ui/                           shadcn primitives — kept flat (no complex behavior)
│   │   ├── button.tsx
│   │   ├── separator.tsx
│   │   └── ...
│   │
│   └── magicui/                      magic ui primitives — kept flat
│       └── striped-pattern.tsx
│
├── experience/                       domain features (public site)
│   │
│   ├── vehicles/
│   │   ├── catalog.ts
│   │   ├── catalog.test.ts
│   │   ├── urlState.ts
│   │   └── compare/                  ← the Compare feature
│   │       ├── index.ts
│   │       ├── ComparePanel.tsx
│   │       ├── ComparePanel.css
│   │       ├── ComparePanel.types.ts
│   │       ├── ComparePanel.sounds.ts
│   │       └── compare.state.ts      registers "compare active" in UIState
│   │
│   ├── products/
│   │   └── ...
│   │
│   ├── ui/                           page-level components
│   │   ├── VehiclesPage/
│   │   │   ├── index.ts
│   │   │   ├── VehiclesPage.tsx
│   │   │   └── VehiclesPage.css
│   │   └── ...
│   │
│   └── scenes/
│       └── ...
│
└── admin/                            admin sub-app (separate bundle)
    └── ...
```

---

## The UIState System — How Harmony Works

This is the centerpiece of the plan. It is a lightweight shared context that any component can write to and read from.

### The Type Contract

```ts
// lib/ui-state/uiStateTypes.ts

export type ComparePanelState = {
  active: boolean;
  itemCount: number;
};

export type FilterDrawerState = {
  open: boolean;
};

export type ChatState = {
  open: boolean;
};

export type UIState = {
  comparePanel: ComparePanelState;
  filterDrawer: FilterDrawerState;
  chat: ChatState;
  // Add new cross-component signals here as features grow.
  // Each key is a named signal. Components publish to it.
  // Other components react to it. They never import each other.
};

export const DEFAULT_UI_STATE: UIState = {
  comparePanel: { active: false, itemCount: 0 },
  filterDrawer: { open: false },
  chat: { open: false },
};
```

### The Provider

```tsx
// lib/ui-state/UIStateProvider.tsx

const UIStateContext = createContext<{
  state: UIState;
  set: <K extends keyof UIState>(key: K, value: UIState[K]) => void;
} | null>(null);

export function UIStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UIState>(DEFAULT_UI_STATE);

  const set = useCallback(<K extends keyof UIState>(key: K, value: UIState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  return (
    <UIStateContext.Provider value={{ state, set }}>
      {children}
    </UIStateContext.Provider>
  );
}

export function useUIState() {
  const ctx = useContext(UIStateContext);
  if (!ctx) throw new Error("useUIState must be used inside UIStateProvider");
  return ctx;
}
```

---

## The Dock / Compare Example — End To End

This is the exact scenario you described. It shows how isolation and harmony work together.

### Step 1 — Compare Panel publishes its state

The Compare feature does not know the Dock exists. It only knows about UIState.

```ts
// experience/vehicles/compare/compare.state.ts

export function useCompareState(selectedIds: string[]) {
  const { set } = useUIState();

  useEffect(() => {
    set("comparePanel", {
      active: selectedIds.length > 0,
      itemCount: selectedIds.length,
    });

    return () => {
      set("comparePanel", { active: false, itemCount: 0 });
    };
  }, [selectedIds, set]);
}
```

Called from `ComparePanel.tsx`:
```tsx
// experience/vehicles/compare/ComparePanel.tsx
export function ComparePanel({ selectedIds }: { selectedIds: string[] }) {
  useCompareState(selectedIds);   // registers state — Dock will react automatically
  return <div className="comparePanel">...</div>;
}
```

### Step 2 — Dock animation code reacts to UIState

The Dock does not know Compare exists. It only knows about UIState. Its response logic — the shrink/move animation — lives entirely inside its own folder.

```ts
// components/Dock/Dock.animations.ts

import { useEffect, useRef } from "react";
import { animate } from "motion";    // or gsap — whatever the project uses
import type { ComparePanelState } from "@/lib/ui-state/uiStateTypes";

export function useComparePanelAdaptation(
  dockRef: React.RefObject<HTMLElement>,
  comparePanel: ComparePanelState
) {
  const isAdapted = useRef(false);

  useEffect(() => {
    if (!dockRef.current) return;

    if (comparePanel.active && !isAdapted.current) {
      // Dock shrinks and moves to the side when compare is active
      animate(dockRef.current, {
        scale: 0.75,
        x: "-30%",
        opacity: 0.6,
      }, { duration: 0.35, easing: "ease-out" });
      isAdapted.current = true;
    }

    if (!comparePanel.active && isAdapted.current) {
      // Dock returns to normal when compare is dismissed
      animate(dockRef.current, {
        scale: 1,
        x: "0%",
        opacity: 1,
      }, { duration: 0.3, easing: "ease-in-out" });
      isAdapted.current = false;
    }
  }, [comparePanel.active, dockRef]);
}
```

Used inside the Dock component:
```tsx
// components/Dock/Dock.tsx
import { useComparePanelAdaptation } from "./Dock.animations";
import { useUIState } from "@/lib/ui-state";

export function Dock({ items, ...props }: DockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const { state } = useUIState();

  // The Dock reacts to compare state via its own animation module.
  // Compare knows nothing about this. Dock knows nothing about Compare.
  useComparePanelAdaptation(dockRef, state.comparePanel);

  return <div ref={dockRef} className="dock-outer">...</div>;
}
```

### What This Achieves

- **ComparePanel** can be worked on, tested, and deleted without touching the Dock
- **Dock** can be worked on, tested, and redesigned without touching ComparePanel
- The animation code for the Dock's response to compare lives **inside the Dock folder** — exactly where it belongs
- Adding a new trigger (e.g. filter drawer also affects the Dock) is one new hook in `Dock.animations.ts` and one new UIState key — nothing else changes
- The z-index problem goes away because the Dock's position is now actively managed relative to the active feature, not just stacked with a fixed value

---

## Component File Responsibilities

| File | Purpose |
|---|---|
| `Component.tsx` | Markup, props, internal state, event handlers |
| `Component.css` | All styles for this component. No global side effects. |
| `Component.types.ts` | Props types, variant types, any types only this component needs |
| `Component.sounds.ts` | Sound actions this component owns. Calls `play()` from `lib/sound`. |
| `Component.animations.ts` | Animation logic — especially reactions to UIState signals |
| `Component.test.tsx` | Unit and integration tests |
| `index.ts` | Public API only. Re-exports what consumers need. Never re-exports internals. |

Not every component needs every file. A simple button needs only `.tsx`, `.css`, and `index.ts`. A complex component like `Dock` needs the full set.

---

## The Sound Colocation Pattern

The centralized sound engine in `lib/sound/` stays centralized — it manages pooling, cooldowns, and volume. What each component owns is its **action-to-sound mapping**: which sound plays for which user action, and at what volume.

```ts
// components/Dock/Dock.sounds.ts

import { play } from "@/lib/sound";

// These functions are called by Dock.tsx.
// The sound key (registered in lib/sound/sounds.ts) stays here
// so the Dock owns its own audio behavior.
export const dockSounds = {
  itemClick:  () => play("nav.click"),
  itemHover:  () => play("hover"),
  adaptStart: () => play("ambient-shimmer"),   // plays when dock shrinks
  adaptEnd:   () => play("tab-switch"),         // plays when dock returns
};
```

When the global sound library (`lib/sound/sounds.ts`) needs a new sound, add it there. When a component needs to use that sound, map it in the component's own `.sounds.ts`. Two separate concerns, two separate files, in their natural homes.

---

## Import Rules — The Boundary Contract

These rules enforce isolation. They are the line between "components work together" and "components depend on each other."

### Allowed

```ts
// ✓ Component imports from lib/
import { useUIState } from "@/lib/ui-state";
import { play } from "@/lib/sound";

// ✓ Component imports from its own folder
import { dockSounds } from "./Dock.sounds";
import { useComparePanelAdaptation } from "./Dock.animations";

// ✓ Component imports from app-shell/
import { useNavigation } from "@/app-shell/NavigationProvider";

// ✓ Component imports from components/ui/ (primitives)
import { Button } from "@/components/ui/button";

// ✓ Page imports from components/ (pages use components)
import { Dock } from "@/components/Dock";
```

### Not Allowed

```ts
// ✗ Component imports another component directly
import { ComparePanel } from "@/experience/vehicles/compare";   // Dock must not do this

// ✗ Component imports a page
import { VehiclesPage } from "@/experience/ui/VehiclesPage";    // Dock must not do this

// ✗ Component reaches into another component's internals
import { DockItem } from "@/components/Dock/Dock";              // import from index.ts only
```

A component may only react to another component's **existence** through UIState. Never through a direct import.

---

## The `index.ts` Public API Contract

Every component folder exposes only what consumers need. Internal files are not part of the public API.

```ts
// components/Dock/index.ts

// Public — consumers need these
export { Dock } from "./Dock";
export type { DockProps, DockItemData, DockVariant } from "./Dock.types";

// Not exported — internal implementation
// Dock.animations.ts — used only inside Dock.tsx
// Dock.sounds.ts — used only inside Dock.tsx
// Dock.test.tsx — test only
```

This means if you rename `Dock.animations.ts` to something else, nothing outside the Dock folder breaks. The boundary is the `index.ts`.

---

## UIState Signals — When To Add One

Add a new UIState key when a component needs to **react to something happening elsewhere** without importing that elsewhere.

**Good candidates for UIState signals:**

| Signal | Who publishes | Who reacts |
|---|---|---|
| `comparePanel.active` | ComparePanel | Dock, SiteHeader (may hide) |
| `filterDrawer.open` | FilterDrawer | Dock (may reposition) |
| `chat.open` | OllamaChat | Dock (may hide), SiteHeader |
| `mediaQuality` | MediaQualitySettings | Experience, VideoSky |
| `viewingMode` | ViewingModeToggle | All layout components |
| `botAction.pending` | Bot | Any component the bot is navigating to |

**Do not add a UIState key for:**
- State that is local to one component (e.g. whether a dropdown inside a form is open)
- State that already has a natural owner (e.g. selectedVehicleId is owned by the URL)
- State that only two directly-related components share (pass as props)

---

## Migration Priority

When the routing migration is complete, the reorganization happens in this order:

### Phase 1 — Extract the UIState system first
Before moving any files, get the harmony layer in place. This is a new file — no disruption.

### Phase 2 — Migrate the Dock
The Dock is the most complex component and the most immediate need. Moving it first proves the pattern works and solves the compare-panel problem.

Files to create: `Dock/`, `Dock.tsx`, `Dock.css`, `Dock.types.ts`, `Dock.sounds.ts`, `Dock.animations.ts`, `Dock/index.ts`.

### Phase 3 — Migrate layout components
`BottomDock`, `SiteHeader`, `nav/*`. These are wired into every page so getting them stable early reduces risk later.

### Phase 4 — Migrate the 3D viewer
`DetailModelViewer/` folder with `ModelAsset`, `ModelStage`, `modelTypes` colocated.

### Phase 5 — Migrate experience features
`vehicles/compare/`, then other domain features as they are actively worked on. Migrate on-touch — when you open a file to change it, move it to the new structure first.

### Phase 6 — Migrate page-level components
`VehiclesPage/`, `ProductDetailPage/`, etc. These are large but isolated — one at a time.

---

## What Does NOT Change

- `lib/sound/` — stays centralized. The audio engine is infrastructure, not a component.
- `lib/supabase.ts`, `lib/authService.ts`, `lib/eventsService.ts` — shared infrastructure, flat files are fine.
- `components/ui/` — shadcn primitives are already flat and are consumed without modification. No need to componentize them.
- `app-shell/` — routing infrastructure, already well-organized.
- `experience/scenes/` — cinematic scene code is already organized by scene. Leave it.

---

## Summary

The goal is a codebase where:

- Opening a component folder tells you everything about that component
- Deleting a component folder removes it completely, with no orphaned files
- Components react to each other through UIState, not through imports
- The Dock's animation response to the Compare feature lives in the Dock folder — not in App.tsx, not in ComparePanel, not in a shared animation file
- Sound behavior is declared where the action happens, not in a global file that nobody owns
- Any developer can work on one component without needing to understand any other component
- The system scales naturally: new features publish new UIState signals, existing components can opt into reacting to them with zero coupling
