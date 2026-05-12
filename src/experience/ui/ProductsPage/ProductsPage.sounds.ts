import type { ActionKey } from "@/lib/sound";

export const productsPageSoundActions = {
  cardHover: "product.card.hover",
  filterChange: "product.filter.click",
  tabHover: "navbar.tab.hover",
} as const satisfies Record<string, ActionKey>;
