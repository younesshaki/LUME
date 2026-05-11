# 3D Camera Calibration Dev Tool — Plan

**Status:** Planned
**Last updated:** 2026-05-11
**Depends on:** `src/components/three/DetailModelViewer.tsx`, `src/components/three/ModelStage.tsx`, `src/components/three/ModelAsset.tsx`, `src/experience/products/catalog.json`

---

## Context

Auto-fitting a camera to a GLB by computing its bounding box does not work reliably for irregular models (e.g. a can with a liquid splash). The bounding box treats every vertex as equal, so the math centers on the geometric midpoint rather than the visual subject. No heuristic — "top portion", "0.6 × max dim", smallest mesh, etc. — gives a consistent result across different models.

Every production 3D product site (Apple, Tesla, sneaker configurators) handles this the same way: an artist sets the camera position and target manually, once, and ships those values. The runtime never recomputes them.

We need the same workflow.

---

## Goal

Replace the auto-fit guesswork with a one-time visual calibration:

1. In a dev-only mode, the user can freely zoom, orbit, and pan around any GLB
2. A small overlay shows the live camera `position` and `target` updating as they move
3. Once the framing looks right, the user copies those two arrays into `catalog.json`
4. Production locks to exactly that framing — no auto-fit, no zoom, no pan (orbit only if `autoRotate` is on)

---

## Catalog Metadata Changes

### `DetailModel3D` type

```ts
export type DetailModel3D = {
  enabled: true;
  modelSrc: string;
  alt: string;
  tagLabel?: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  lighting?: ModelLighting;
  autoRotate?: boolean;

  // New: explicit calibrated camera. When both are set, used as-is.
  // When unset, fall back to bounding-box heuristic in ModelAsset.
  cameraPosition?: [number, number, number];
  cameraTarget?: [number, number, number];
};
```

### Catalog JSON

```json
{
  "id": "red-bull",
  "model3d": {
    ...
    "cameraPosition": [0, 1.4, 2.8],
    "cameraTarget":   [0, 1.2, 0]
  }
}
```

When these two arrays are present, the `CameraRig` uses them directly. When they're absent, the existing bounding-box fallback kicks in (good enough for simple/centered GLBs).

---

## Dev Mode Activation

Two options:

1. **URL flag** — append `?cameraDebug=1` to the product detail URL to enable the calibration UI for that page load only.
2. **Env flag** — `VITE_ENABLE_3D_DEBUG=true` in `.env.local` to enable globally during local dev.

Recommended: support both. The URL flag is convenient for one-off tuning; the env flag is handy when actively iterating on a new model.

Production builds (`import.meta.env.PROD`) hard-disable the debug UI regardless of flags, so it can never reach end users.

---

## What the Dev Mode Enables

When active, the viewer behaves differently:

| Feature | Production | Debug mode |
|---|---|---|
| Zoom (scroll wheel) | disabled | enabled |
| Pan (right-click drag) | disabled | enabled |
| Orbit (left-click drag) | enabled | enabled |
| Auto-rotate | from catalog | disabled |
| Polar angle limits | constrained | unlimited |
| Calibration overlay | hidden | visible |
| Camera source | catalog values | live OrbitControls state |

The constraints on `OrbitControls` (`enableZoom`, `enablePan`, `minPolarAngle`, `maxPolarAngle`, `autoRotate`) are all gated behind the debug flag.

---

## Calibration Overlay

A small, fixed-position panel in the corner of the canvas (e.g. top-right inside the viewer frame).

### Contents

```
┌─────────────────────────────────────┐
│ Camera Calibration                  │
│                                     │
│ position: [0.00, 1.42, 2.81]        │
│ target:   [0.00, 1.20, 0.00]        │
│                                     │
│ [ Copy to clipboard ]               │
└─────────────────────────────────────┘
```

- Numbers update live as the user orbits/zooms/pans (every frame, or throttled to ~30fps to avoid React re-render storms)
- "Copy to clipboard" copies a JSON snippet ready to paste into the catalog:
  ```json
  "cameraPosition": [0.00, 1.42, 2.81],
  "cameraTarget":   [0.00, 1.20, 0.00],
  ```

### Implementation

A small React component inside the Canvas that uses `useFrame` to read `camera.position` and the OrbitControls target each frame, throttled, and pushes them to outer React state via a ref or context. The overlay sits **outside** the Canvas (regular DOM) so it can show normal HTML/CSS, but reads its values from inside via a shared ref or zustand store.

---

## Component Wiring

### `ModelStage.tsx`

Add a `debug` prop. When true:

```tsx
<OrbitControls
  target={targetInfo.target}
  enableZoom={debug}
  enablePan={debug}
  autoRotate={!debug && autoRotate}
  minPolarAngle={debug ? 0 : Math.PI / 4}
  maxPolarAngle={debug ? Math.PI : Math.PI / 1.6}
  makeDefault
/>
{debug && <CalibrationProbe />}
```

`CalibrationProbe` is the `useFrame` reader that pushes camera state to the overlay.

### `DetailModelViewer.tsx`

- Read `debug` from the URL or env flag
- Pass it down to `ModelStage`
- If `model.cameraPosition` and `model.cameraTarget` are both present in the catalog, build `targetInfo` from those directly and **skip the `onTarget` callback from `ModelAsset`** — the model load no longer needs to compute anything
- Otherwise, keep the current bounding-box fallback for simple models
- Render the overlay outside the `<Canvas>` only when `debug` is true

### `ModelAsset.tsx`

When the catalog provides explicit camera values, `ModelAsset` doesn't need to compute or callback — it just renders the primitive. Keep the bounding-box logic only as a fallback for unconfigured models.

---

## Calibration Workflow

1. Add a new model to the catalog **without** `cameraPosition` / `cameraTarget`
2. Visit `https://lume-jade-three.vercel.app/#products/<id>?cameraDebug=1` (or set the env flag locally)
3. Scroll/drag to find the right view
4. Click "Copy to clipboard"
5. Paste the two arrays into the catalog entry, commit, push
6. Production now ships that framing forever

Total time per model: about 30 seconds once you've done it once.

---

## Implementation Phases

### Phase 1 — Catalog schema + production override (no UI)

- Add `cameraPosition` and `cameraTarget` to `DetailModel3D` type and `RawProduct3DEntry`
- When both are set in the catalog, `DetailModelViewer` uses them directly and bypasses the bounding-box fallback
- Deliverable: can manually edit the catalog with values and they take effect — no calibration UI yet, just the override path

### Phase 2 — Debug flag + unlocked controls

- Read `cameraDebug=1` from `window.location.hash` and `import.meta.env.VITE_ENABLE_3D_DEBUG`
- Disable in `import.meta.env.PROD` regardless
- When debug is on, unlock zoom/pan/polar angles and disable auto-rotate
- Deliverable: in debug mode, can freely move around any model

### Phase 3 — Live overlay

- Add `CalibrationProbe` inside the Canvas (`useFrame`-based reader)
- Add the overlay panel outside the Canvas with live position + target values
- Add the "Copy to clipboard" button with the JSON snippet
- Throttle updates to ~30 Hz to keep React happy
- Deliverable: full calibration workflow

### Phase 4 — Apply to Red Bull

- Open Red Bull detail in debug mode
- Find the right framing
- Paste values into `catalog.json`
- Commit, push, verify production view

---

## Open Questions

1. **Where to put the overlay**: inside the viewer frame (top-right corner) or fixed-position on the page (bottom-right of the viewport)? Inside the frame is more contextual but takes screen space from the model.
2. **Do we also expose `fov` in the overlay?** The current viewer hardcodes `fov: 45` on the Canvas. If the user can change it during calibration, the catalog should support `cameraFov` too.
3. **Should the overlay also dump `model.scale`?** Lets you calibrate the scale at the same time, which means one less number to guess.
4. **Should we add a keyboard shortcut to reset to the default view?** Easy to get lost during a long calibration session.
