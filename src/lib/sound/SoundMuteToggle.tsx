/**
 * LUME Sound System — floating mute toggle
 *
 * Optional convenience component. Drop anywhere to give the user a
 * persistent mute control. Style it with className overrides; defaults
 * are token-scoped so it doesn't bleed into the app's design system.
 */

import { Volume2, VolumeX } from "lucide-react";
import { useSound } from "./useSound";

type SoundMuteToggleProps = {
  className?: string;
  size?: number;
  ariaLabel?: string;
};

export function SoundMuteToggle({
  className,
  size = 16,
  ariaLabel = "Toggle sound",
}: SoundMuteToggleProps) {
  const sound = useSound();

  return (
    <button
      type="button"
      className={className}
      aria-label={ariaLabel}
      aria-pressed={sound.isMuted}
      title={sound.isMuted ? "Unmute" : "Mute"}
      onClick={() => sound.toggleMute()}
    >
      {sound.isMuted ? (
        <VolumeX size={size} aria-hidden="true" />
      ) : (
        <Volume2 size={size} aria-hidden="true" />
      )}
    </button>
  );
}
