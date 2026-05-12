# Zustand — What It Is And Why It Matters For LUME

## What Zustand Is

Zustand is a state management library. One JavaScript file, ~1KB, no boilerplate. It creates a **store** — an object that holds state and the functions to update it — that any component in the tree can read from or write to without needing a Provider wrapper.

That is the whole thing. Nothing more complex than that.

---

## How It Compares To React Context

The UIState system in the code organization plan uses React Context. Here is how the two differ in practice.

### With React Context

```
UIStateProvider
  └── every component underneath it subscribes to the whole context
      └── if ANY part of UIState changes, ALL subscribers re-render
```

### With Zustand

```
Zustand store (lives outside React entirely)
  └── Dock subscribes only to comparePanel
  └── OllamaChat subscribes only to chat
  └── FilterDrawer subscribes only to filterDrawer
  └── each only re-renders when its specific slice changes
```

The difference is **selective subscriptions**. React Context re-renders every consumer when anything in the context changes. Zustand re-renders only the components that subscribed to the specific slice that changed.

---

## In LUME's Specific Case — The Dock / Compare Example

With React Context, when a user hovers over a compare card and `itemCount` updates from 2 to 3 — the Dock re-renders, the SiteHeader re-renders, the Chat re-renders, every component that reads UIState re-renders. Even though none of them care about `itemCount`.

With Zustand, each component declares exactly what it cares about. Only that slice triggers a re-render.

### The Store

```ts
// lib/ui-state/store.ts
import { create } from "zustand";

type UIState = {
  comparePanel: { active: boolean; itemCount: number };
  filterDrawer: { open: boolean };
  chat: { open: boolean };
  setComparePanel: (state: { active: boolean; itemCount: number }) => void;
  setFilterDrawer: (open: boolean) => void;
  setChat: (open: boolean) => void;
};

export const useUIStore = create<UIState>((set) => ({
  comparePanel: { active: false, itemCount: 0 },
  filterDrawer: { open: false },
  chat: { open: false },
  setComparePanel: (comparePanel) => set({ comparePanel }),
  setFilterDrawer: (open) => set({ filterDrawer: { open } }),
  setChat: (open) => set({ chat: { open } }),
}));
```

### The Dock subscribes only to what it needs

```ts
// components/Dock/Dock.tsx
const comparePanel = useUIStore((state) => state.comparePanel);
// Dock ONLY re-renders when comparePanel changes. Nothing else triggers it.
```

### The Compare feature writes to the store

```ts
// experience/vehicles/compare/compare.state.ts
const setComparePanel = useUIStore((state) => state.setComparePanel);
setComparePanel({ active: true, itemCount: selected.length });
```

The selector `(state) => state.comparePanel` is the key. Zustand compares the returned value before and after every state change. If it did not change, the component does not re-render.

---

## Additional Benefits In LUME's Case

### No Provider Required

React Context requires wrapping the tree in `<UIStateProvider>`. Zustand's store exists outside React entirely. Any component anywhere can read from it — including code that is not a React component at all.

This matters directly for the bot. When the bot needs to know if the compare panel is open before deciding what action to take, it reads the store directly:

```ts
// bot action executor — not a React component, no hooks
function executeBotAction(action: BotAction) {
  const { comparePanel } = useUIStore.getState();  // direct read, no hook needed

  if (comparePanel.active) {
    // dismiss compare first, then navigate
  }
}
```

With React Context this is not possible outside a component. With Zustand it is a one-liner.

### DevTools Integration

Zustand has a devtools middleware that plugs into Redux DevTools in Chrome. Every state change shows up with the action name, before and after values, and a full timeline. When the Dock animation is not triggering correctly, you open DevTools and see exactly what UIState looked like at the moment the bug happened.

```ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      // same store as before
    }),
    { name: "LUME UIState" }
  )
);
```

### Easy To Add Later

This is the practical part. The React Context version described in `organizing-code.md` works fine today. The upgrade to Zustand is roughly two hours of work whenever it becomes necessary. The store file replaces the context file, the hook name changes from `useUIState` to `useUIStore`, and every component that calls the hook updates its import. No logic changes anywhere.

---

## When To Actually Make The Switch

Not now. The right trigger is one of these:

| Trigger | Why It Points To Zustand |
|---|---|
| Lag or jank when UIState updates frequently | Filter slider, bot rapid actions — Context re-renders too broadly |
| Need to read UIState from outside React | Bot executor, utility functions, non-component logic |
| Debugging a state timing bug | Devtools middleware makes the timeline visible |
| More than 5–6 UIState keys with different update frequencies | Selective subscriptions become meaningful at this scale |

Until one of those is true, the Context version is simpler to understand and has zero additional dependencies.

---

## Zustand vs Other Options

| Option | When It Makes Sense |
|---|---|
| React Context | Default. Simple cross-component state, low update frequency. Start here. |
| **Zustand** | **When Context causes re-render performance issues or you need state outside React.** |
| Redux Toolkit | Large teams, complex async flows, need strict action audit trail. Overkill for LUME. |
| Jotai | Atom-per-value granularity. Good alternative to Zustand if you prefer that model. |
| Valtio | Proxy-based, feels like mutating plain objects. Same use case as Zustand. |

For LUME, the path is: **Context → Zustand**. Nothing beyond that is needed.

---

## Summary

Zustand is not a different way of thinking about state. It is the same UIState system from `organizing-code.md`, with two upgrades:

1. **Surgical re-renders** — components only update when their specific slice changes
2. **State accessible anywhere** — including the bot executor, utility functions, and anything outside the React tree

It slots in as a drop-in replacement for the UIState context the day the context version shows its limits. The architecture does not change. The component contracts do not change. Only the underlying mechanism gets more precise.
