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

/** Wide hero card on the tenant overview (roughly 616×260). */
export const HERO_FRAMING: HeadFraming = { scale: 3, y: -710 };

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

  const bot = app.findObjectByName("Bot");
  if (bot) {
    bot.scale.x = framing.scale;
    bot.scale.y = framing.scale;
    bot.scale.z = framing.scale;
    bot.position.y = framing.y;
  }
}

/** True on `/admin/<tenant>` exactly — where the hero already shows the head. */
export function isTenantOverviewRoute(pathname: string): boolean {
  return /^\/admin\/[^/]+\/?$/.test(pathname);
}

/** True on any admin page *inside* a tenant that isn't the overview. */
export function isCompanionRoute(pathname: string): boolean {
  return /^\/admin\/[^/]+\/.+/.test(pathname) && !isTenantOverviewRoute(pathname);
}
