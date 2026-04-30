# Showcase Chapter Background Video

Put background video files used only by the `showcase` chapter in this folder.

Recommended:

- use `.mp4`
- keep file names simple
- prefer one final background video asset, for example:
  - `showcase-bg.mp4`

Safest integration path:

1. Import the file with `?url` from a dedicated component, for example:
   `import bgVideoUrl from "./background video/showcase-bg.mp4?url";`
2. Render it behind the primary 3D showcase only.
3. Keep the current camera, model positions, light rig, and transition logic unchanged.
4. Fade or replace only the background layer if needed later.

Best technical approach for this chapter:

- create a `BackgroundVideo.tsx` inside `src/experience/scenes/showcase/`
- map the video onto a large plane or an inverted sphere placed behind the models
- keep it muted, looping, and non-interactive
- do not use it as a DOM overlay if the goal is to keep it inside the 3D world behind the models

Why this is safest:

- the current product-model crossfade remains untouched
- the current red/blue light rig remains untouched
- the current camera intro and orbit remain untouched
- the video becomes an isolated background layer with minimal coupling
