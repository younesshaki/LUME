import type { ActionKey } from "@/lib/sound";

export const chapterNavSoundActions = {
  hover: "chapter.nav.hover",
  click: "chapter.nav.click",
  selectOpen: "chapter.select.open",
  selectChoose: "chapter.select.choose",
} as const satisfies Record<string, ActionKey>;
