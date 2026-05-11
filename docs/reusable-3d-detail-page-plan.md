# Reusable 3D Product And Vehicle Detail Page Plan

## Goal

Add optional Three.js/GLB support to product and vehicle detail pages without making every detail page heavier.

The current product detail page is 2D-only. It renders the product image and copy inside `ProductDetailPage.tsx`. Three.js exists elsewhere in the project, but it is not mounted on normal product detail pages.

The goal is to introduce a reusable 3D detail layer that can be enabled only for products or vehicles that explicitly declare a 3D model. Everything else stays on the current lightweight 2D path.

First target asset:

```txt
src/assets/products/lume-editions/blackredbullforlume.glb
```

## Core Rule

3D is opt-in.

Products and vehicles must explicitly declare that they have a 3D model before the app loads any Three.js canvas or GLB asset for them.

This avoids slowing down:

- normal product cards
- normal product detail pages
- normal vehicle detail pages
- mobile pages that should stay lighter
- products and vehicles with no meaningful 3D asset

## Current State

Product detail page:

```txt
src/experience/ui/ProductDetailPage.tsx
src/experience/ui/ProductDetailPage.css
```

Current behavior:

- renders a 2D image from `product.imageSrc`
- renders product copy and actions
- no `Canvas`
- no `useGLTF`
- no `@react-three/fiber`
- no model-specific routing or state

Product catalog:

```txt
src/experience/products/catalog.json
src/experience/products/catalog.ts
```

Current catalog entries support:

- id
- brand
- name
- category
- status
- imageKey
- description
- detail
- showcase metadata

They do not yet support 3D model metadata.

## Target Behavior

For products or vehicles without a 3D model:

- use the existing 2D detail page
- no Three.js import
- no GLB preload
- no extra canvas
- no performance cost beyond the current page

For products or vehicles with a 3D model:

- show a special "3D" tag/badge on cards and detail pages
- render a reusable Three.js model viewer on the detail page
- load the GLB lazily only after the detail page is opened
- keep the existing 2D image as fallback
- support future product and vehicle models through shared metadata

## Catalog Metadata

Add a reusable model metadata shape that can be used by products first and vehicles later.

Recommended type:

```ts
export type DetailModel3D = {
  enabled: true;
  modelKey?: string;
  modelSrc?: string;
  posterImageKey?: string;
  tagLabel?: string;
  alt: string;
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  camera?: {
    position: [number, number, number];
    fov?: number;
  };
  lighting?: "studio" | "soft" | "dramatic";
  autoRotate?: boolean;
};
```

For product catalog JSON, use serializable fields only:

```json
{
  "id": "red-bull-special-edition",
  "brand": "Red Bull",
  "model3d": {
    "enabled": true,
    "modelKey": "products/lume-editions/blackredbullforlume.glb",
    "tagLabel": "3D",
    "alt": "3D model of the LUME Red Bull special edition",
    "scale": 1,
    "position": [0, -0.2, 0],
    "rotation": [0, 0, 0],
    "camera": {
      "position": [0, 0.4, 4],
      "fov": 38
    },
    "lighting": "studio",
    "autoRotate": true
  }
}
```

Important: the current GLB lives in `src/assets/...`, not R2. For the first implementation, import it locally in the product catalog layer or model registry. Later, move models to R2 and use `modelKey` with `mediaUrl()`.

## 3D Tag Strategy

Add a reusable tag helper:

```ts
function hasDetailModel3D(item: { model3d?: DetailModel3D | null }) {
  return item.model3d?.enabled === true && Boolean(item.model3d.modelSrc || item.model3d.modelKey);
}
```

Products or vehicles with `model3d.enabled === true` should show a small tag:

```txt
3D
```

Where to show the tag:

- Product cards on `ProductsPage`
- Product detail page near the category/eyebrow or media frame
- Vehicle cards later
- Vehicle detail page later

Do not show the tag for products or vehicles without a linked model.

## Reusable Component Architecture

Create shared 3D viewer components instead of hardcoding Red Bull behavior.

Recommended files:

```txt
src/components/three/DetailModelViewer.tsx
src/components/three/DetailModelViewer.css
src/components/three/ModelStage.tsx
src/components/three/ModelAsset.tsx
src/components/three/modelTypes.ts
```

### `DetailModelViewer`

Responsibilities:

- Own the `<Canvas>`
- Accept generic model metadata
- Render fallback/poster while loading
- Handle error fallback
- Keep sizing stable inside the 2D page layout
- Apply camera, lights, controls, and optional auto-rotation

Example prop shape:

```ts
type DetailModelViewerProps = {
  model: DetailModel3D;
  fallbackImageSrc?: string;
  title: string;
  className?: string;
};
```

### `ModelStage`

Responsibilities:

- Configure lights
- Configure camera defaults
- Configure orbit controls
- Configure environment/background behavior
- Keep the model framed consistently

### `ModelAsset`

Responsibilities:

- Load the GLB with `useGLTF`
- Render `primitive object={scene}`
- Apply item-specific scale, position, rotation
- Dispose safely when unmounted

## Product Detail Integration

Update `ProductDetailPage.tsx` so it chooses between 2D and 3D media:

```tsx
{product.model3d?.enabled ? (
  <DetailModelViewer
    model={product.model3d}
    fallbackImageSrc={imageSrc}
    title={`${product.brand} ${product.name}`}
  />
) : imageSrc ? (
  <img src={imageSrc} alt={`${product.brand} ${product.name}`} />
) : (
  <div className="productDetail__placeholder">{product.brand}</div>
)}
```

The existing `.productDetail__media` frame should remain the container, but the viewer should fill it:

```css
.productDetail__model {
  position: absolute;
  inset: 0;
}
```

If the model fails to load, the viewer should fall back to the existing 2D image.

## Products Page Integration

Add a 3D tag to product cards only when the product has a model:

```tsx
{hasDetailModel3D(product) && (
  <span className="productsPage__modelTag">3D</span>
)}
```

The tag should be visually small and not disrupt existing card layout.

Recommended placement:

- top-right of the product image
- above existing card body
- same visual language as the vehicle stock/status tags

## Vehicle Future Integration

The vehicle side should reuse the same metadata shape and viewer.

Future vehicle metadata:

```ts
type Vehicle = {
  ...
  model3d?: DetailModel3D;
};
```

Vehicle detail page future behavior:

- 2D image gallery remains default
- vehicles with `model3d.enabled` can show a 3D tab, 3D badge, or model hero
- do not load Three.js for vehicles without models

This allows specific future vehicles to receive GLB support without changing every vehicle page.

## Performance Requirements

Because the Red Bull GLB is currently about 33 MB, performance must be handled deliberately.

Rules:

- Lazy-load the 3D viewer component with `React.lazy`.
- Do not import Three.js from the main product detail bundle.
- Do not preload all product/vehicle models globally.
- Only load the Red Bull GLB after opening the Red Bull detail page.
- Keep the 2D image as a fast fallback/poster.
- Hide or simplify the viewer on low-power/mobile devices if needed.

Recommended implementation:

```ts
const DetailModelViewer = lazy(() => import("@/components/three/DetailModelViewer"));
```

Then render it inside `Suspense`.

Optional later:

- optimize the GLB with `gltf-transform`
- compress textures
- use Draco or Meshopt if appropriate
- move the model to R2
- generate a smaller mobile model variant

## Asset Strategy

Initial implementation:

```txt
src/assets/products/lume-editions/blackredbullforlume.glb
```

This is acceptable for a first local implementation, but it means the model becomes part of the app build when imported.

Preferred long-term implementation:

```txt
R2:
products/red-bull-special-edition/models/blackredbullforlume.glb
```

Then catalog metadata can use:

```json
"modelKey": "products/red-bull-special-edition/models/blackredbullforlume.glb"
```

and the app resolves it with `mediaUrl(modelKey)`.

Recommendation:

- Use the local GLB first to implement and verify behavior.
- Move it to R2 before production if bundle size becomes a problem.

## UX Requirements

The 3D model should feel like it sits on top of the current 2D space, not like a separate heavy app.

Recommended UX:

- model appears inside the existing media frame
- subtle loading state over the 2D image/poster
- orbit controls enabled but constrained
- auto-rotate enabled by default for product models
- no visible debugging controls
- no excessive UI explanation text
- 3D tag signals that the item has an interactive model

Control defaults:

```txt
enableZoom: false or limited
enablePan: false
autoRotate: true for products
autoRotateSpeed: slow
minPolarAngle / maxPolarAngle constrained
```

## Implementation Phases

### Phase 1: Metadata And Tagging

- Add `DetailModel3D` type.
- Extend product raw catalog type with optional `model3d`.
- Add Red Bull model metadata.
- Add `hasDetailModel3D()` helper.
- Add 3D tag to product cards and product detail page.

Deliverable:

- Red Bull shows a 3D tag.
- Other products remain unchanged.
- No Three.js viewer yet.

### Phase 2: Reusable 3D Viewer

- Add `DetailModelViewer`.
- Add `ModelStage`.
- Add `ModelAsset`.
- Load GLB with `useGLTF`.
- Add fallback image and error state.
- Add responsive sizing and mobile-safe behavior.

Deliverable:

- A generic model viewer can render any GLB from metadata.

### Phase 3: Product Detail Integration

- Lazy-load `DetailModelViewer` from `ProductDetailPage`.
- Render viewer only when `product.model3d.enabled` is true.
- Keep the 2D image path for every other product.
- Verify Red Bull detail page.

Deliverable:

- Red Bull product detail has a 3D model.
- Other product detail pages stay 2D and lightweight.

### Phase 4: Optimization

- Run build and inspect bundle output.
- If the GLB is bundled too heavily, move model to R2.
- Consider GLB compression/optimization.
- Add a smaller fallback or poster for mobile if needed.

Deliverable:

- No site-wide performance regression.
- 3D model is opt-in and isolated.

### Phase 5: Vehicle Reuse Later

- Add `model3d` metadata to selected vehicles.
- Add 3D tag to vehicle cards.
- Add optional `DetailModelViewer` to vehicle detail page.
- Keep all non-3D vehicles on the current 2D page.

Deliverable:

- Same 3D system supports products and vehicles.

## Testing Checklist

- `npm run typecheck`
- `npm test`
- `npm run build`
- Open Red Bull product detail page.
- Confirm Red Bull shows 3D tag.
- Confirm Red Bull model loads and is framed correctly.
- Confirm non-Red Bull product detail pages do not load Three.js viewer.
- Confirm product cards without `model3d` do not show the 3D tag.
- Confirm mobile layout does not overlap or break.
- Confirm model load failure falls back to the 2D image.

## Success Criteria

- Red Bull can use `blackredbullforlume.glb` on its detail page.
- The 3D viewer is reusable for future products and vehicles.
- 3D is controlled by catalog metadata, not hardcoded page logic.
- Only items with `model3d.enabled` show a 3D tag.
- Only items with a model load Three.js/GLB code.
- All other product and vehicle pages remain optimized 2D pages.
