/**
 * LUME Sound System — public exports
 *
 * Component side:
 *   import { useSound, SoundOn, SoundMuteToggle } from "@/lib/sound";
 *
 * Imperative (non-component code):
 *   import { play } from "@/lib/sound";
 *   play("chat.send");
 *
 * App boot:
 *   import { SoundProvider } from "@/lib/sound";
 *   <SoundProvider>{children}</SoundProvider>
 */

export { useSound } from "./useSound";
export type { UseSoundReturn } from "./useSound";
export { SoundOn } from "./SoundOn";
export { SoundMuteToggle } from "./SoundMuteToggle";
export { SoundProvider } from "./SoundProvider";
export { play } from "./audioEngine";

// Preference helpers (useful for settings panels)
export {
  setMasterMuted,
  setMasterVolume,
  setCategoryMuted,
  setCategoryVolume,
  getPreferences,
} from "./preferences";

// Type re-exports for advanced consumers
export type { ActionKey } from "./actions";
export type { SoundKey } from "./sounds";
export type { SoundSpec, SoundStep, ActionSpec, SoundPreferences } from "./types";
