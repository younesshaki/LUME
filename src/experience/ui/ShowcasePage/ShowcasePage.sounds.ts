import type { ActionKey } from "@/lib/sound";

export const showcasePageSoundActions = {
  cardHover: "showcase.card.hover",
  cardOpen: "showcase.card.open",
} as const satisfies Record<string, ActionKey>;
