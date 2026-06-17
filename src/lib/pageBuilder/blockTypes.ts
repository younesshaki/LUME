/**
 * Compatibility re-export for the public app's page-builder registry.
 *
 * Runtime block descriptors live in @lume/blocks so the Vite public app and
 * Next admin app can share schemas/default props without sharing React code.
 */
export {
  BLOCK_DESCRIPTORS,
  getBlockDescriptor,
  listBlockDescriptors,
  listEditorBlockDescriptors,
  listPaletteBlockDescriptors,
} from "@lume/blocks";

export type {
  BlockCategory,
  BlockDescriptor,
  BlockField,
  BlockFieldOption,
  BlockFieldType,
  BlockMode,
  BlockValidationResult,
  EditorBlockDescriptor,
  KnownBlockType,
} from "@lume/blocks";
