/**
 * Block-shape validation helpers — Epic L foundation.
 *
 * Two layers:
 *   • Structural (shape) — re-exported from @lume/db (`isPageBlock`,
 *     `isPageBlocksDocument`) so the same guards run server-side on write.
 *   • Per-type prop validation — uses the block descriptor's `validate`.
 *
 * The renderer should treat an invalid block as a no-op (skip / fallback) rather
 * than crash, per ADR-003.
 */
import type { PageBlock, PageBlocksDocument } from "@lume/types";
import { isPageBlock, isPageBlocksDocument } from "@lume/db";
import { getBlockDescriptor } from "./blockTypes";

export { isPageBlock, isPageBlocksDocument };

export type BlockValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

/** Validate a single block: structural shape + known type + per-type props. */
export function validateBlock(block: unknown): BlockValidation {
  if (!isPageBlock(block)) {
    return { ok: false, errors: ["block must have string id, string type, object props"] };
  }
  const descriptor = getBlockDescriptor(block.type);
  if (!descriptor) {
    return { ok: false, errors: [`unknown block type "${block.type}"`] };
  }
  return descriptor.validate(block.props);
}

export type DocumentValidation = {
  ok: boolean;
  /** keyed by block id → errors */
  blockErrors: Record<string, string[]>;
};

/** Validate every block in a document. Returns per-block errors keyed by id. */
export function validateDocument(doc: unknown): DocumentValidation {
  if (!isPageBlocksDocument(doc)) {
    return { ok: false, blockErrors: { _document: ["invalid PageBlocksDocument shape"] } };
  }
  const blockErrors: Record<string, string[]> = {};
  for (const block of doc.blocks) {
    const result = validateBlock(block);
    if (!result.ok) blockErrors[block.id] = result.errors;
  }
  return { ok: Object.keys(blockErrors).length === 0, blockErrors };
}

/** Renderer guard: a block worth attempting to render (valid shape + known type). */
export function isRenderableBlock(block: PageBlock): boolean {
  return validateBlock(block).ok;
}

/** Filter a document down to the blocks safe to render in a given mode. */
export function renderableBlocks(
  doc: PageBlocksDocument,
  mode: "experience" | "standard"
): PageBlock[] {
  return doc.blocks.filter((block) => {
    const descriptor = getBlockDescriptor(block.type);
    if (!descriptor) return false;
    if (!descriptor.modes.includes(mode)) return false;
    if (mode === "standard" && descriptor.experienceOnly) return false;
    return validateBlock(block).ok;
  });
}
