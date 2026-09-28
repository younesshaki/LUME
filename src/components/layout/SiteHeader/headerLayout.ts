import type { TenantHeaderVariant } from "@lume/types";

/**
 * Grid layout of the public header for a variant and logo placement.
 *
 * Every combination is a three-track grid, so the overlap fix from Phase 1
 * holds for all of them — a variant changes the track *sizes* and a logo
 * placement changes which slot the logo occupies, never whether the nav is a
 * flow participant.
 *
 * The nav track is never `auto`. The overflow logic ("More") measures the nav
 * track to decide what fits; an `auto` track is sized by the nav's own content,
 * so the measurement was circular — once items moved into "More" the track
 * shrank and they never came back. The `left` variant hit this: with the gooey
 * nav even a single "Home" was pushed into "More" at 1920px (A1 matrix,
 * 2026-09-26). Every nav track is now `minmax(0, …)`, sized by the header.
 *
 * `logoPlacement` was resolved from tenant config and edited in the admin, but
 * the header ignored it, so the admin preview and the live site disagreed
 * (reported by the admin lane, 2026-09-26). With `centre`, the logo takes the
 * middle track and the nav moves to the leading track:
 *
 *    left:    [ logo ] [   nav   ] [ actions ]
 *    centre:  [   nav   ] [ logo ] [ actions ]   (outer tracks equal, so the
 *                                                  logo is truly centred)
 */

export type HeaderLogoPlacement = "left" | "centre";

export type HeaderLayout = {
  tracks: string;
  navJustify: string;
  /** Extra classes for the nav slot (e.g. the minimal variant's narrow width). */
  navSlot: string;
  /** Visual order of the three slots; DOM order stays logo → nav → actions. */
  order: { logo: string; nav: string; actions: string };
};

const LEFT_TRACKS: Record<TenantHeaderVariant, string> = {
  centred: "grid-cols-[auto_1fr_auto]",
  // Same look as the old `auto_auto_1fr` (nav hugs the logo, actions pushed
  // right) but the nav track has a definite, header-derived width.
  left: "grid-cols-[auto_minmax(0,1fr)_auto]",
  split: "grid-cols-[auto_1fr_1fr]",
  minimal: "grid-cols-[auto_minmax(0,4rem)_auto]",
};

const LEFT_JUSTIFY: Record<TenantHeaderVariant, string> = {
  centred: "justify-center",
  left: "justify-start",
  split: "justify-center",
  minimal: "justify-end",
};

export function headerLayout(
  variant: TenantHeaderVariant,
  logoPlacement: HeaderLogoPlacement,
): HeaderLayout {
  if (logoPlacement !== "centre") {
    return {
      tracks: LEFT_TRACKS[variant] ?? LEFT_TRACKS.centred,
      navJustify: LEFT_JUSTIFY[variant] ?? LEFT_JUSTIFY.centred,
      navSlot: "",
      order: { logo: "", nav: "", actions: "" },
    };
  }
  return {
    // Equal outer tracks centre the logo exactly, whatever the nav and the
    // action cluster weigh.
    tracks: "grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]",
    navJustify: "justify-start",
    // `minimal` keeps its promise of a collapsed nav: only the "More" trigger.
    navSlot: variant === "minimal" ? "max-w-16" : "",
    order: { logo: "order-2", nav: "order-1", actions: "order-3" },
  };
}
