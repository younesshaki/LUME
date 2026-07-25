import type { Application } from "@splinetool/runtime";

export const CONCIERGE_SCENE_URL =
  "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

/**
 * Scene hierarchy is `Bot` → `Top part` (`Head`, `Head 2`, `Neck`, …) plus the
 * two arms (`Hand`, `Hand Instance`), `Body` and `Bottom`. Hiding everything
 * but the head saves no download — the `.splinecode` is one baked file — it
 * only cuts the per-frame draw work down to the part we actually show.
 */
const NOT_THE_HEAD = new Set(["Body", "Bottom", "Hand", "Hand Instance"]);

export type HeadFraming = { scale: number; y: number };

/** Wide hero card on the tenant overview, at the reference width below. */
export const HERO_FRAMING: HeadFraming = { scale: 3, y: -710 };

/**
 * Canvas size the hero framing is tuned against, in CSS pixels.
 *
 * Spline frames the subject relative to the canvas, so a fluid canvas moves
 * the goalposts: with a fixed `scale` the head grew with the viewport until it
 * burst out of the card on wide screens. Rather than model that relationship,
 * the hero canvas is pinned to this size and centred in its (fluid) pane —
 * the framing then cannot vary at all. The dock does the same thing by being
 * a fixed 220×220, which is why it was never affected.
 */
export const HERO_STAGE = { width: 584, height: 260 };

/** Small square dock (220×220) in the corner of every other admin page. */
export const COMPANION_FRAMING: HeadFraming = { scale: 2.2, y: -430 };

/**
 * Reduce the scene to a framed head.
 *
 * Framing is done by transforming the `Bot` root rather than moving the
 * camera: Spline drives its own camera during start-up and overwrites position
 * writes, and `setZoom` is a no-op in this scene. Object transforms, by
 * contrast, stick when applied from `onLoad`.
 */
export function frameHeadOnly(app: Application, framing: HeadFraming): void {
  // Both arms reuse the name `Hand`, so match across every object rather than
  // `findObjectByName`, which only returns the first hit.
  for (const object of app.getAllObjects()) {
    if (NOT_THE_HEAD.has(object.name)) object.visible = false;
  }

  applyFraming(app, framing);
}

/** Position/scale the head. */
function applyFraming(app: Application, framing: HeadFraming): void {
  const bot = app.findObjectByName("Bot");
  if (!bot) return;

  bot.scale.x = framing.scale;
  bot.scale.y = framing.scale;
  bot.scale.z = framing.scale;
  bot.position.y = framing.y;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Radians. Beyond these the head twists further than a neck plausibly could. */
const MAX_YAW = 0.55;
const MAX_PITCH = 0.3;
/** Per-frame approach rate — low enough that the head glides rather than snaps. */
const EASING = 0.12;

/**
 * Aim the head at the cursor.
 *
 * The scene ships no head tracking of its own (every rotation reads 0 at every
 * cursor position — what looks like tracking is a slight camera parallax), so
 * we drive `Head.rotation` ourselves. Angles are measured from the head's own
 * position on screen rather than from the viewport centre: the companion sits
 * in the bottom-right corner, and viewport-relative math would leave it
 * permanently staring into the corner.
 *
 * Returns a disposer; callers must call it on unmount.
 */
export function trackPointer(app: Application, element: HTMLElement): () => void {
  const head = app.findObjectByName("Head");
  if (!head) return () => {};

  let targetYaw = 0;
  let targetPitch = 0;
  let yaw = 0;
  let pitch = 0;
  let frame = 0;

  const onPointerMove = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dx = (event.clientX - (rect.left + rect.width / 2)) / (window.innerWidth / 2);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (window.innerHeight / 2);

    targetYaw = clamp(dx, -1, 1) * MAX_YAW;
    targetPitch = clamp(dy, -1, 1) * MAX_PITCH;
  };

  const tick = () => {
    yaw += (targetYaw - yaw) * EASING;
    pitch += (targetPitch - pitch) * EASING;
    head.rotation.y = yaw;
    head.rotation.x = pitch;
    frame = requestAnimationFrame(tick);
  };

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  frame = requestAnimationFrame(tick);

  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    cancelAnimationFrame(frame);
  };
}

/** True on `/admin/<tenant>` exactly — where the hero already shows the head. */
export function isTenantOverviewRoute(pathname: string): boolean {
  return /^\/admin\/[^/]+\/?$/.test(pathname);
}

/** True on any admin page *inside* a tenant that isn't the overview. */
export function isCompanionRoute(pathname: string): boolean {
  return /^\/admin\/[^/]+\/.+/.test(pathname) && !isTenantOverviewRoute(pathname);
}
