# Showcase Chapter Models

Put 3D models used only by the `showcase` chapter in this folder.

Recommended:

- `.glb` files for scene models
- one file per asset
- clear names, for example:
  - `door.glb`
  - `ring.glb`
  - `flower_field.glb`

When you add a model here, wire it through:

- `src/experience/scenes/showcase/data/sceneAssets.ts`
- `src/experience/scenes/showcase/ShowcaseScene.tsx`

Current folder scope:

- only assets related to the `showcase` chapter should live here
