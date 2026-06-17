import type { BlockDescriptor, BlockValidationResult } from "./blockTypes";
import { getBlockDescriptor } from "./blockTypes";

export type BlockInstance = {
  id: string;
  type: string;
  props: Record<string, unknown>;
};

export type PageBlocksDocumentLike = {
  version: number;
  blocks: BlockInstance[];
};

export type DocumentValidation = {
  ok: boolean;
  blockErrors: Record<string, string[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isBlockInstance(value: unknown): value is BlockInstance {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isRecord(value.props)
  );
}

export function validateBlockProps(
  descriptor: BlockDescriptor,
  props: unknown
): BlockValidationResult {
  return descriptor.validate(props);
}

export function validateBlock(block: unknown): BlockValidationResult {
  if (!isBlockInstance(block)) {
    return { ok: false, errors: ["block must have string id, string type, object props"] };
  }
  const descriptor = getBlockDescriptor(block.type);
  if (!descriptor) return { ok: false, errors: [`unknown block type "${block.type}"`] };
  return validateBlockProps(descriptor, block.props);
}

export function validatePageBlocksDocument(document: unknown): DocumentValidation {
  if (
    !isRecord(document) ||
    typeof document.version !== "number" ||
    !Array.isArray(document.blocks)
  ) {
    return { ok: false, blockErrors: { _document: ["invalid PageBlocksDocument shape"] } };
  }

  const blockErrors: Record<string, string[]> = {};
  for (const block of document.blocks) {
    const result = validateBlock(block);
    if (!result.ok) {
      const id = isRecord(block) && typeof block.id === "string" ? block.id : "_block";
      blockErrors[id] = result.errors;
    }
  }

  return { ok: Object.keys(blockErrors).length === 0, blockErrors };
}
