import type { ActionKey } from "@/lib/sound";

export const productDetailSoundActions = {
  showcase: "product.detail.showcase",
  hover: "nav.hover",
  relatedProductHover: "product.card.hover",
} as const satisfies Record<string, ActionKey>;
