/**
 * Pure helpers for the page editor (PageEditorClient): block reorder/insert
 * math and palette filtering. Kept admin-side (mirrors lib/vehicleImages.ts)
 * so they stay independently testable and out of the shared @lume/blocks
 * package while the block library is under active development.
 */

/** MIME type carried by palette drags so list rows can tell "add new block" apart from "reorder existing". */
export const PALETTE_DRAG_MIME = "application/x-lume-block-type";

/** Insert item at index, clamped into [0, list.length]. Never mutates. */
export function insertAt<T>(list: readonly T[], index: number, item: T): T[] {
  const clamped = Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, clamped), item, ...list.slice(clamped)];
}

/**
 * Move draggedId to just before/after targetId. Positions are resolved on the
 * post-removal list, so dragging downward lands after the target as seen on
 * screen. Returns a copy (never mutates) and no-ops on missing/identical ids.
 */
export function moveToPosition<T extends { id: string }>(
  list: readonly T[],
  draggedId: string,
  targetId: string,
  position: "before" | "after",
): T[] {
  if (draggedId === targetId) return [...list];
  const draggedIndex = list.findIndex((item) => item.id === draggedId);
  if (draggedIndex < 0 || !list.some((item) => item.id === targetId)) return [...list];
  const next = [...list];
  const [moved] = next.splice(draggedIndex, 1);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  next.splice(position === "after" ? targetIndex + 1 : targetIndex, 0, moved);
  return next;
}

/** Index at which a new block is inserted: right after anchorId, or the end when the anchor is gone. */
export function insertionIndexAfter<T extends { id: string }>(
  list: readonly T[],
  anchorId: string | null,
): number {
  if (!anchorId) return list.length;
  const index = list.findIndex((item) => item.id === anchorId);
  return index < 0 ? list.length : index + 1;
}

/** Case-insensitive palette search over type, display name, and description. */
export function filterPaletteDescriptors<
  T extends { type: string; displayName: string; description: string },
>(descriptors: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...descriptors];
  return descriptors.filter(
    (descriptor) =>
      descriptor.displayName.toLowerCase().includes(needle) ||
      descriptor.description.toLowerCase().includes(needle) ||
      descriptor.type.toLowerCase().includes(needle),
  );
}
