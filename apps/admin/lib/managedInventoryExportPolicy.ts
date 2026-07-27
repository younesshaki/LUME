/** Minimal shape needed for deterministic outbound no-op comparison. */
type SemanticInventoryOutput = { semanticHash: string };

/** A changed destination must receive one delivery even if catalog bytes match. */
export function shouldSkipUnchangedManagedExport(
  lastPayloadHash: string | null,
  output: SemanticInventoryOutput,
  currentConfigVersion: number,
  snapshotConfigVersion: number,
): boolean {
  return currentConfigVersion === snapshotConfigVersion &&
    lastPayloadHash === output.semanticHash;
}
