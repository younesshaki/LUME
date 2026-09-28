import { BLOCK_IMAGE_OVERLAY, backgroundTone, hasBlockAppearance } from "@lume/blocks";
import type { BlockAppearance, BlockBackgroundToken } from "@lume/types";

export type SiteColorMode = "light" | "dark";

/** One website mode's resolved theme: its colours and its CSS variables. */
export type ModePalette = {
  colors: { background?: string; panel?: string; gold?: string; ink?: string };
  /** The mode's `--theme-*` variables, as the site applies them to :root. */
  variables: Record<string, string>;
};

export type BlockAppearanceContext = {
  mode: SiteColorMode;
  /** Null until the tenant design loads: theme tokens then use CSS variables. */
  palettes: Record<SiteColorMode, ModePalette> | null;
};

export type ResolvedBlockAppearance = {
  /** Text tone the block needs, when it differs from the page's mode. */
  tone: SiteColorMode | null;
  fullWidth: boolean;
  image: { url: string; fit: "cover" | "contain"; position: string } | null;
  /** Inline style for the frame: the background, overlay and any palette switch. */
  style: Record<string, string>;
};

const TOKEN_VARIABLE: Record<BlockBackgroundToken, string> = {
  page: "--theme-lume-background",
  panel: "--theme-lume-panel",
  accent: "--theme-lume-gold",
  ink: "--theme-lume-ink",
};
const TOKEN_COLOR: Record<BlockBackgroundToken, keyof ModePalette["colors"]> = {
  page: "background",
  panel: "panel",
  accent: "gold",
  ink: "ink",
};
const IMAGE_POSITION = { center: "center", top: "center top", bottom: "center bottom" } as const;

const opposite = (mode: SiteColorMode): SiteColorMode => (mode === "dark" ? "light" : "dark");

/**
 * What a block's appearance means for the current page mode. Null when it has
 * nothing to draw, so the block renders exactly as it did before backgrounds.
 */
export function resolveBlockAppearance(
  appearance: BlockAppearance | null | undefined,
  { mode, palettes }: BlockAppearanceContext,
): ResolvedBlockAppearance | null {
  if (!hasBlockAppearance(appearance)) return null;
  const style: Record<string, string> = {};
  let tone: SiteColorMode | null = null;

  const color = appearance.backgroundColor;
  if (color && "token" in color) {
    const resolved = palettes?.[mode].colors[TOKEN_COLOR[color.token]];
    // Resolved once, here: the frame may switch the palette variables below,
    // and a background reading them would switch with it.
    style["--block-bg"] = resolved ?? `var(${TOKEN_VARIABLE[color.token]})`;
    // Page and panel are what the mode's text is designed for; accent and ink
    // are not, so they may need the other mode's text.
    // Only once the colour is concrete: switching the palette while the
    // background still reads a variable would switch the background too.
    if (resolved && (color.token === "accent" || color.token === "ink")) {
      tone = backgroundTone(resolved) ?? (color.token === "ink" ? opposite(mode) : null);
    }
  } else if (color && "custom" in color) {
    const value = color.custom[mode];
    style["--block-bg"] = value;
    tone = backgroundTone(value);
  }

  let image: ResolvedBlockAppearance["image"] = null;
  const background = appearance.backgroundImage;
  if (background) {
    const overlayColor = background.overlayColor ?? "#000000";
    const opacity = background.overlayOpacity ?? BLOCK_IMAGE_OVERLAY.default;
    image = {
      url: background.url,
      fit: background.size ?? "cover",
      position: IMAGE_POSITION[background.position ?? "center"],
    };
    style["--block-bg-overlay"] = `color-mix(in srgb, ${overlayColor} ${opacity}%, transparent)`;
    // Text sits on the overlay, so it decides the tone (an unreadable photo
    // with a thin overlay is the editor's warning, not something to guess).
    if (opacity > 0) tone = backgroundTone(overlayColor);
  }

  const switched = tone && tone !== mode ? tone : null;
  if (switched && palettes) {
    for (const [name, value] of Object.entries(palettes[switched].variables)) {
      if (!name.startsWith("--theme-site-background")) style[name] = value;
    }
  }

  return { tone: switched, fullWidth: appearance.fullWidth === true, image, style };
}
