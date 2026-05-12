import type { ActionKey } from "@/lib/sound";

export const loginScreenSoundActions = {
  hover: "nav.hover",
  submit: "gate.submit",
} as const satisfies Record<string, ActionKey>;
