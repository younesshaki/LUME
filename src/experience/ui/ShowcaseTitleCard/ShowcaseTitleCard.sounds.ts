import type { ActionKey } from "@/lib/sound";

export const showcaseTitleCardSoundActions = {
  play: "showcase.title.play",
} as const satisfies Record<string, ActionKey>;
