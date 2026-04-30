import { useMemo } from "react";
import { useUiSoundService } from "./UiSoundProvider";
import type { UiSoundId } from "./uiSounds";

export function useUiSounds() {
  const service = useUiSoundService();

  return useMemo(
    () => ({
      play: (id: UiSoundId) => service.play(id),
      playHover: () => service.play("hover-soft"),
      playPrimaryClick: () => service.play("click-primary"),
      playNavClick: () => service.play("click-nav"),
      playGateClick: () => service.play("click-gate"),
    }),
    [service]
  );
}
