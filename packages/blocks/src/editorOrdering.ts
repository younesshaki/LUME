export function reorderByBlockId<T extends { id: string }>(
  blocks: readonly T[],
  draggedId: string,
  targetId: string,
): T[] {
  const from = blocks.findIndex((block) => block.id === draggedId);
  const to = blocks.findIndex((block) => block.id === targetId);
  if (from < 0 || to < 0 || from === to) return [...blocks];
  const next = [...blocks];
  const [dragged] = next.splice(from, 1);
  next.splice(to, 0, dragged);
  return next;
}
