# Admin theme reveal validation

## Rendering-path finding

The remaining Chrome/macOS flash was on the browser-generated root snapshot
path: the implementation on `main` still called `document.startViewTransition`
and animated `::view-transition-new(root)`. Overscan and paint-delay changes
could not remove the browser-owned texture/compositor boundary.

The replacement does not call the View Transitions API. It renders a
script-free snapshot of the destination theme in an inert fixed iframe,
reveals that DOM layer from the toggle with `clip-path`, commits through
`next-themes` only after the viewport is covered, waits for the real root to
paint, and then removes the layer. This keeps the destination UI visible
during the commit instead of covering the page with a flat color.

## Automated coverage

- Unit: destination snapshot removes scripts and stale overlays and applies
  the requested root theme.
- Unit: reduced motion commits immediately without creating an overlay.
- Unit: rapid clicks create one transition/commit and leave no overlay.
- Playwright smoke: 24 consecutive toggles assert the root theme, persisted
  `next-themes` value, button focus, and zero stale overlays after every
  transition.

Automation verifies state and cleanup, but cannot prove the absence of a
single compositor frame on a specific physical display. The following visual
matrix therefore remains a required review step on the authenticated preview.

## Manual Chrome/macOS matrix

For every row, toggle at least 20 times while watching the left viewport edge.
Also click rapidly during one reveal, navigate after a reveal, and confirm the
theme remains correct after reload.

| Browser/profile | GPU | Sidebar | Refresh rate | Motion | Review status |
| --- | --- | --- | --- | --- | --- |
| Chrome normal | on | expanded | ProMotion | normal | Pending visual review |
| Chrome normal | on | collapsed | ProMotion | normal | Pending visual review |
| Chrome Guest | on | expanded | ProMotion | normal | Pending visual review |
| Chrome Guest | on | collapsed | ProMotion | normal | Pending visual review |
| Chrome normal | off | expanded | ProMotion | normal | Pending visual review |
| Chrome normal | off | collapsed | ProMotion | normal | Pending visual review |
| Chrome normal | on | expanded | 60 Hz | normal | Pending visual review |
| Chrome normal | on | collapsed | 60 Hz | normal | Pending visual review |
| Chrome normal | on | expanded | ProMotion | reduced | Pending visual review |
| Opera normal | on | expanded/collapsed | native | normal | Pending visual review |
| Chrome on Windows | on | expanded/collapsed | native | normal | Pending visual review |

Pass conditions: no left-edge flash, no stale overlay, focus remains on the
toggle, a rapid second click does not start another reveal, and reload retains
the last committed theme.

## Rollback

Revert this PR to restore the prior View Transitions implementation and its
pseudo-element CSS. There are no database, environment, or persisted-data
changes.
