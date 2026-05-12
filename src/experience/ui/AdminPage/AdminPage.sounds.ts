import type { ActionKey } from "@/lib/sound";

export const adminPageSoundActions = {
  hover: "nav.hover",
  exit: "admin.exit",
  filterClear: "admin.filter.clear",
  profileHover: "product.card.hover",
  profileSelect: "admin.profile.select",
} as const satisfies Record<string, ActionKey>;
