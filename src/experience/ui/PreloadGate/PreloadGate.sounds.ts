import type { ActionKey } from "@/lib/sound";

export const preloadGateSoundActions = {
  hover: "nav.hover",
  submit: "gate.submit",
  start: "gate.start",
} as const satisfies Record<string, ActionKey>;
