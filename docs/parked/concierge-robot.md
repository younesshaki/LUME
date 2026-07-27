# Parked: the 3D concierge head

Built 2026-07-25, then deliberately cut the same day. The code is kept and
still compiles; nothing mounts it.

## Why it was cut

It is presentation, not product. It cost ~1.9 MB on first view (~560 KB gzip
of Spline runtime plus a 1.35 MB scene) to render a decorative avatar. It was
already default-off for that reason — and a feature you disable by default
because it is expensive is not a feature anyone pays for.

The customer-facing AI concierge on the dealer's public site is the thing that
makes money. This was the admin-side avatar, which is not the same product.

## Blocker if it ever comes back

**The scene is not ours.** It streams at runtime from
`https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode`, a scene ID in
someone else's Spline account. Nothing is vendored into the repo. Before this
ships to paying tenants, either license it or rebuild it — the natural fix is
a head-only model exported from our own Spline (or Blender → `.glb`) and
self-hosted on the existing R2 bucket. The root Vite app already has
`three` / `@react-three/fiber` / `@react-three/drei` and loads `.glb` from R2,
so there is prior art for dropping Spline entirely.

Also never tested: what happens when that CDN fetch fails.

## What is here

| File | What it does |
|---|---|
| `apps/admin/components/concierge-robot-hero.tsx` | Wide hero card for the tenant overview |
| `apps/admin/components/concierge-robot-companion.tsx` | Docked head: sidebar slot ↔ bottom-right corner, `h` to hide |
| `apps/admin/components/concierge-robot-provider.tsx` | Enabled state (localStorage), sidebar slot, header toggle |
| `apps/admin/lib/conciergeRobot.ts` | Scene URL, head-only framing, cursor tracking, route predicates |
| `apps/admin/lib/conciergeRobot.test.ts` | Unit tests for the route predicates (still run in CI) |
| `apps/admin/components/ui/spline-scene.tsx` | Lazy, `ssr: false` Spline wrapper |
| `apps/admin/components/ui/spotlight.tsx` | Decorative wash behind the hero |

`@splinetool/react-spline` and `@splinetool/runtime` stay in
`apps/admin/package.json` so the parked code keeps type-checking. Nothing
imports them, so they are not in any bundle — but don't let a dependency
sweep drop them without also deleting the files above.

## How to re-enable

Four edits, all previously verified working:

1. `apps/admin/app/admin/[tenant]/page.tsx` — import `ConciergeRobotHero` and
   render `<ConciergeRobotHero tenantSlug={slug} />` under the `PageHeader`.
2. `apps/admin/components/admin-shell.tsx` — wrap the returned tree in
   `<ConciergeRobotProvider parked={expandedSections.size === 0}>`.
3. Same file — render `<ConciergeRobotSlot />` as the last child of
   `SidebarContent`, and `<ConciergeRobotToggle />` beside
   `AnimatedThemeToggler` in `ShellHeader`.
4. Same file — render `<ConciergeRobotCompanion />` after `</SidebarProvider>`.

Git history has the working version: commits `b87b6fb`, `e930b7f`, `cf7154a`,
`d65520d`, `b408a03`, `4ba5554`.

## Notes worth keeping

- The scene ships **no** head tracking. Every rotation reads 0 at every cursor
  position; what looks like tracking in the stock demo is camera parallax.
  `trackPointer()` drives `Head.rotation` directly instead.
- Spline overwrites camera position during start-up and `setZoom` is a no-op in
  this scene, so framing is done by transforming the `Bot` root. Object
  transforms applied in `onLoad` do stick.
- Spline frames the subject relative to canvas size, so a fluid canvas changes
  the framing. Both surfaces use fixed-size canvases (hero 584×260, dock
  220×220) — that is why they are stable across viewports.
- Spline listens for `pointermove` on `window` as well as its canvas, which is
  what lets the container be `pointer-events-none`.
