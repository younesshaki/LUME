import { z } from "zod";
import type { BlockAppearance, BlockBackgroundToken } from "@lume/types";
import type { BlockValidationResult } from "./blockTypes";

/**
 * Block backgrounds: one optional `appearance` object beside every block's
 * props (see PageBlock.appearance). Pure schema + colour maths, shared by the
 * editor (validation, contrast warnings) and the public renderer.
 */

export const BLOCK_BACKGROUND_TOKENS = ["page", "panel", "accent", "ink"] as const satisfies readonly BlockBackgroundToken[];
export const BLOCK_BACKGROUND_POSITIONS = ["center", "top", "bottom"] as const;
export const BLOCK_BACKGROUND_SIZES = ["cover", "contain"] as const;

export const BLOCK_IMAGE_OVERLAY = {
  min: 0,
  max: 80,
  default: 45,
  /** Below this the editor warns that text over the photo may be hard to read. */
  recommendedMin: 30,
} as const;

/** WCAG AA for body text. */
export const MIN_TEXT_CONTRAST = 4.5;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex colour, for example #1F5EFF");

function isSafeBackgroundUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return true;
  try {
    return new URL(trimmed).protocol === "https:";
  } catch {
    return false;
  }
}

export const blockAppearanceSchema = z
  .object({
    backgroundColor: z
      .union([
        z.object({ token: z.enum(BLOCK_BACKGROUND_TOKENS) }).strict(),
        z.object({ custom: z.object({ light: hex, dark: hex }).strict() }).strict(),
      ])
      .optional(),
    backgroundImage: z
      .object({
        url: z.string().max(2_048).refine(isSafeBackgroundUrl, "Use an https image URL from your media library"),
        position: z.enum(BLOCK_BACKGROUND_POSITIONS).optional(),
        size: z.enum(BLOCK_BACKGROUND_SIZES).optional(),
        overlayColor: hex.optional(),
        overlayOpacity: z.number().int().min(BLOCK_IMAGE_OVERLAY.min).max(BLOCK_IMAGE_OVERLAY.max).optional(),
      })
      .strict()
      .optional(),
    fullWidth: z.boolean().optional(),
  })
  .strict();

export function validateBlockAppearance(value: unknown): BlockValidationResult {
  const result = blockAppearanceSchema.safeParse(value);
  if (result.success) return { ok: true };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => `appearance${issue.path.length ? `.${issue.path.join(".")}` : ""}: ${issue.message}`),
  };
}

/** True when the appearance changes anything; an empty object renders as none. */
export function hasBlockAppearance(appearance: BlockAppearance | null | undefined): appearance is BlockAppearance {
  return Boolean(appearance && (appearance.backgroundColor || appearance.backgroundImage));
}

/**
 * Hero photo designs already fill their section with a photo, so a background
 * image behind them would never show; the editor hides the image option.
 */
export function blockSupportsBackgroundImage(block: { type: string; props: Record<string, unknown> }): boolean {
  if (block.type !== "hero") return true;
  const variant = block.props.variant;
  return variant !== "split" && variant !== "search" && variant !== "fullBleed";
}

// ---------------------------------------------------------------------------
// Colour maths (WCAG relative luminance / contrast)
// ---------------------------------------------------------------------------

type Rgb = { r: number; g: number; b: number };

/** Parses #rgb, #rrggbb and rgb()/rgba() (alpha ignored); null otherwise. */
export function parseColor(value: string | null | undefined): Rgb | null {
  if (!value) return null;
  const color = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (short) return { r: parseInt(short[1] + short[1], 16), g: parseInt(short[2] + short[2], 16), b: parseInt(short[3] + short[3], 16) };
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (long) return { r: parseInt(long[1], 16), g: parseInt(long[2], 16), b: parseInt(long[3], 16) };
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(color);
  if (rgb) return { r: Math.min(255, +rgb[1]), g: Math.min(255, +rgb[2]), b: Math.min(255, +rgb[3]) };
  return null;
}

export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const NEAR_BLACK: Rgb = { r: 17, g: 18, b: 20 };

/**
 * Which text tone reads best on a background: "dark" background → light text,
 * "light" background → dark text. Null when the colour cannot be parsed.
 */
export function backgroundTone(color: string | null | undefined): "light" | "dark" | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  return contrastRatio(rgb, NEAR_BLACK) >= contrastRatio(rgb, WHITE) ? "light" : "dark";
}

/** The best text contrast any text colour can reach on this background. */
export function bestTextContrast(color: string): number | null {
  const rgb = parseColor(color);
  if (!rgb) return null;
  return Math.max(contrastRatio(rgb, NEAR_BLACK), contrastRatio(rgb, WHITE));
}
