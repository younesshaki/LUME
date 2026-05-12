import type { ActionKey } from "@/lib/sound";

export const storyHomePageSoundActions = {
  cardHover: "showcase.card.hover",
  cardOpen: "showcase.card.open",
} as const satisfies Record<string, ActionKey>;
