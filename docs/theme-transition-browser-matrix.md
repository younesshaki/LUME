# Unified Admin and public theme reveal

## Rendering contract

The Admin dashboard and every public tenant site use the same theme interaction:

- one binary light/dark button;
- a 350 ms circular reveal originating from that button;
- `ease-in-out` timing on `::view-transition-new(root)`;
- repeated clicks ignored while the reveal is active;
- an immediate state change for reduced-motion users;
- an immediate safe fallback when the View Transitions API is unavailable.

There is no browser or operating-system detection. In particular, Chrome on
macOS no longer receives the former solid-cover or iframe-snapshot animation.
Supported browsers all execute the same View Transitions path.

The persistence authorities remain intentionally separate:

- Admin uses `next-themes`.
- The public website stores an explicit `light` or `dark` choice at
  `lume.color-theme.v1`.
- A legacy public `auto` value is migrated once to its current concrete result;
  `auto` is not exposed as a selectable mode and no longer follows later OS
  changes.

Public transitions synchronously apply both the selected mode and the active
tenant's mode-specific design tokens/background before the destination snapshot
is animated. Admin transitions synchronously apply the root `dark` class while
`next-themes` remains responsible for persistence.

## Automated coverage

- Public unit coverage confirms the control is binary and persists its choice.
- Public and Admin unit coverage identify the browser as Chrome on macOS and
  assert that both still call `document.startViewTransition`.
- Both paths assert the same 350 ms circular root reveal.
- Rapid-click coverage confirms only one Admin transition runs at a time.
- Reduced-motion and unsupported-browser coverage confirm the immediate
  accessible fallback.

## Manual browser matrix

For each normal-motion row, toggle at least 20 times, click rapidly during one
reveal, navigate afterward, then reload and confirm the selected theme remains.
Watch the viewport edges and mode-specific tenant background during every
reveal.

| Surface | Browser/device | Motion | Expected path | Review status |
| --- | --- | --- | --- | --- |
| Admin | Chrome/macOS, normal + Guest | normal | circular reveal | Pending visual review |
| Public | Chrome/macOS, normal + Guest | normal | circular reveal | Pending visual review |
| Admin + public | Safari/macOS + iOS | normal | circular reveal when supported | Pending visual review |
| Admin + public | Chrome/Windows + Android | normal | circular reveal | Pending visual review |
| Admin + public | Edge/Windows | normal | circular reveal | Pending visual review |
| Admin + public | Firefox | normal | circular reveal when supported; immediate fallback otherwise | Pending visual review |
| Admin + public | Any browser | reduced | immediate switch | Pending visual review |

Pass conditions:

- identical reveal direction, duration, and easing on Admin and public;
- no browser-specific cover, iframe, or user-agent branch;
- no stale transition layer;
- no theme mismatch after rapid interaction;
- public background changes to the active mode during the reveal;
- focus remains on the toggle;
- reload retains the explicit selected mode.

## Rollback

Revert the unified View Transitions commits to restore the previous theme
implementation. There are no database, environment, or tenant-schema changes.
