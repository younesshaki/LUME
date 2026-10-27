import type {BlockDescriptor,BlockMode} from "./blockTypes";
export function isBlockVisibleInMode(
  descriptor: Pick<BlockDescriptor, "modes" | "experienceOnly">,
  mode: BlockMode
): boolean {
  return descriptor.modes.includes(mode) && !(mode === "standard" && descriptor.experienceOnly);
}
