import type { ActionKey } from "@/lib/sound";

export const mediaQualitySoundActions = {
  hover: "nav.hover",
  open: "settings.open",
  change: "settings.change",
} as const satisfies Record<string, ActionKey>;
