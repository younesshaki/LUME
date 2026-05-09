/**
 * LUME Sound System — useSound hook
 *
 * Public hook for components. Returns:
 *   play(action)            — fire a sound for an action
 *   mute() / unmute()       — master mute toggle
 *   isMuted                 — reactive mute state
 *   setVolume(0..1)         — master volume
 *   muteCategory(name, on)  — mute one category (e.g., "chat")
 */

import { useEffect, useState } from "react";
import { play as enginePlay } from "./audioEngine";
import {
  getPreferences,
  setMasterMuted,
  setMasterVolume,
  setCategoryMuted,
  setCategoryVolume,
  subscribe,
  type SoundPreferences,
} from "./preferences";
import type { ActionKey } from "./actions";

export type UseSoundReturn = {
  play: (action: ActionKey) => void;
  isMuted: boolean;
  volume: number;
  mute: () => void;
  unmute: () => void;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  muteCategory: (category: string, muted: boolean) => void;
  setCategoryVolume: (category: string, volume: number) => void;
  preferences: SoundPreferences;
};

export function useSound(): UseSoundReturn {
  const [prefs, setPrefs] = useState<SoundPreferences>(getPreferences);

  useEffect(() => {
    const unsub = subscribe((p) => setPrefs(p));
    return () => {
      unsub();
    };
  }, []);

  return {
    play: (action: ActionKey) => enginePlay(action),
    isMuted: prefs.master.muted,
    volume: prefs.master.volume,
    mute: () => setMasterMuted(true),
    unmute: () => setMasterMuted(false),
    toggleMute: () => setMasterMuted(!prefs.master.muted),
    setVolume: (v: number) => setMasterVolume(v),
    muteCategory: (category: string, muted: boolean) => setCategoryMuted(category, muted),
    setCategoryVolume: (category: string, v: number) => setCategoryVolume(category, v),
    preferences: prefs,
  };
}
