import { mediaUrl } from "@/config/cdn";
import { safeMediaSource as sharedSafeMediaSource } from "@lume/blocks/block-media";
export * from "@lume/blocks/block-media";
export function safeMediaSource(value: string) {
  return sharedSafeMediaSource(value, mediaUrl);
}
