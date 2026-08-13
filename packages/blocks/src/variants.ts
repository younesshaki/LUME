/**
 * First-class block variants.
 *
 * A variant is a different *design* for the same block: three trade-in forms,
 * not three block types. That distinction is the whole point —
 *
 *  - separate block types would explode the palette and duplicate schemas, and
 *    switching design would mean deleting the block and losing its content;
 *  - a per-block enum field (the existing `cardStyle` on featured-vehicles) is
 *    cheap but invisible: every block invents its own field name, so the editor
 *    cannot offer one consistent picker.
 *
 * So the variant lives in a reserved `variant` prop, and the *set* of available
 * variants lives on the descriptor where the editor can read it.
 *
 * Pure data, same rules as the rest of this package: no React, no aliases,
 * importable from the seed scripts.
 */
import { z } from "zod";

export type BlockVariant = {
  /** Stable id stored in block props. Renaming one is a breaking change. */
  id: string;
  /** Shown in the variant picker. */
  label: string;
  /** One line on what makes this variant different, shown under the label. */
  description: string;
};

/** The reserved prop name. Blocks must not use this for anything else. */
export const VARIANT_PROP = "variant";

/**
 * Schema for the reserved prop.
 *
 * `catch` rather than bare `default` is deliberate and is the single most
 * important line in this module: an unrecognized variant resolves to the first
 * one instead of failing validation. A stored page must never stop rendering
 * because a variant id was renamed or removed in a later deploy. Fail soft.
 */
export function variantSchema<const Ids extends readonly [string, ...string[]]>(ids: Ids) {
  return z.enum(ids).optional().default(ids[0]).catch(ids[0]);
}

/** Ids of a variant list, in declaration order. Order is the picker's order. */
export function variantIds(variants: readonly BlockVariant[]): string[] {
  return variants.map((variant) => variant.id);
}

/**
 * The variant a block should render as.
 *
 * Used by renderers, which receive already-validated props but must still cope
 * with documents written before a variant list changed. Returns the first
 * declared variant when the stored value is missing or unknown, and null when
 * the block has no variants at all.
 */
export function resolveBlockVariant(
  variants: readonly BlockVariant[] | undefined,
  props: Record<string, unknown> | null | undefined,
): string | null {
  if (!variants || variants.length === 0) return null;
  const stored = props?.[VARIANT_PROP];
  if (typeof stored === "string" && variants.some((variant) => variant.id === stored)) {
    return stored;
  }
  return variants[0].id;
}
