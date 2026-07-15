/**
 * LUME Sound System — Layer 3: Audio Engine
 *
 * Handles:
 *  - Audio element pooling (rapid-fire reuse, no leaks)
 *  - Cooldowns (machine-gun protection per sound)
 *  - Pitch variation (random ± detune via playbackRate)
 *  - Volume composition (master × category × per-action × per-sound)
 *  - Sequence and layer playback (delays, parallel layers)
 *  - Sequence cancellation when the same action re-fires
 *  - Autoplay-policy unlock on first user gesture
 *
 * The engine is module-global. `<SoundProvider>` calls `init()` once
 * at app boot to set up only the unlock listener. Audio is created on demand.
 */

import { SOUND_LIBRARY, type SoundKey } from "./sounds";
import { ACTION_REGISTRY } from "./actions";
import { getPreferences, getCategoryFor } from "./preferences";
import type { SoundSpec } from "./types";

type PoolEntry = {
  elements: HTMLAudioElement[];
  busy: Set<HTMLAudioElement>;
  cursor: number;
  maxSize: number;
};

// Element pools are keyed by physical audio `src`, not by sound key, so that
// multiple sound keys pointing at the same file (e.g. click-sharp/click-firm)
// share one pool instead of each creating its own. Pools are built lazily on
// first playback — nothing is fetched at app boot.
const pools = new Map<string, PoolEntry>();
// Cooldown is tracked per sound key so keys that merely share a file keep
// independent machine-gun protection.
const lastFiredAt = new Map<SoundKey, number>();
const activeTimeouts = new Map<string, number[]>();
let unlocked = false;
let initialized = false;
let unlockHandler: (() => void) | null = null;

function createPooledAudio(src: string, entry: PoolEntry): HTMLAudioElement {
  const audio = new Audio(src);
  audio.preload = "none";
  const release = () => entry.busy.delete(audio);
  audio.addEventListener("ended", release);
  audio.addEventListener("pause", release);
  entry.elements.push(audio);
  return audio;
}

function getPooledAudio(key: SoundKey): { audio: HTMLAudioElement; entry: PoolEntry } {
  const spec = SOUND_LIBRARY[key] as SoundSpec;
  const src = spec.src;
  const size = Math.max(1, spec.pool ?? 3);

  let entry = pools.get(src);
  if (!entry) {
    entry = { elements: [], busy: new Set(), cursor: 0, maxSize: size };
    pools.set(src, entry);
    createPooledAudio(src, entry);
  } else {
    entry.maxSize = Math.max(entry.maxSize, size);
  }

  const available = entry.elements.find((audio) => !entry?.busy.has(audio));
  if (available) return { audio: available, entry };

  if (entry.elements.length < entry.maxSize) {
    return { audio: createPooledAudio(src, entry), entry };
  }

  const audio = entry.elements[entry.cursor];
  entry.cursor = (entry.cursor + 1) % entry.elements.length;
  return { audio, entry };
}

function isAllowed(actionKey: string): boolean {
  const prefs = getPreferences();
  if (prefs.master.muted) return false;
  const category = getCategoryFor(actionKey);
  const cat = prefs.categories[category];
  if (cat?.muted) return false;
  return true;
}

function effectiveVolume(soundKey: SoundKey, actionKey: string, override?: number): number {
  const prefs = getPreferences();
  const spec = SOUND_LIBRARY[soundKey] as SoundSpec;
  const category = getCategoryFor(actionKey);
  const catVol = prefs.categories[category]?.volume ?? 1;
  const baseVol = override ?? spec.volume ?? 1;
  return Math.max(0, Math.min(1, baseVol * catVol * prefs.master.volume));
}

function playSoundOnce(
  soundKey: SoundKey,
  actionKey: string,
  volumeOverride?: number,
): void {
  if (!unlocked || !isAllowed(actionKey)) return;
  if (!(soundKey in SOUND_LIBRARY)) {
    if (typeof console !== "undefined") {
      console.warn(`[sound] Unknown sound key: ${soundKey}`);
    }
    return;
  }

  const spec = SOUND_LIBRARY[soundKey] as SoundSpec;
  const now =
    typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

  if (spec.cooldownMs && now - (lastFiredAt.get(soundKey) ?? 0) < spec.cooldownMs) return;

  const { audio, entry } = getPooledAudio(soundKey);
  entry.busy.add(audio);

  audio.volume = effectiveVolume(soundKey, actionKey, volumeOverride);

  if (spec.pitchVariation && spec.pitchVariation > 0) {
    const v = (Math.random() * 2 - 1) * spec.pitchVariation;
    audio.playbackRate = 1 + v;
  } else {
    audio.playbackRate = 1;
  }

  try {
    audio.currentTime = 0;
  } catch {
    // some browsers throw on currentTime set before metadata; ignore
  }

  const result = audio.play();
  if (result && typeof result.catch === "function") {
    result.catch(() => {
      // autoplay blocked, file missing, decode error — silent fail
      entry.busy.delete(audio);
    });
  }

  lastFiredAt.set(soundKey, now);
}

function cancelSequence(actionKey: string): void {
  const ids = activeTimeouts.get(actionKey);
  if (!ids) return;
  for (const id of ids) clearTimeout(id);
  activeTimeouts.delete(actionKey);
}

function trackTimeout(actionKey: string, id: number): void {
  const arr = activeTimeouts.get(actionKey) ?? [];
  arr.push(id);
  activeTimeouts.set(actionKey, arr);
}

type NormalizedStep = { sound: SoundKey; delay: number; volume?: number; layer: boolean };

function normalizeStep(step: unknown): NormalizedStep | null {
  if (typeof step === "string") {
    return { sound: step as SoundKey, delay: 0, layer: false };
  }
  if (step && typeof step === "object" && "sound" in step) {
    const s = step as { sound: string; delay?: number; volume?: number; layer?: boolean };
    return {
      sound: s.sound as SoundKey,
      delay: s.delay ?? 0,
      volume: s.volume,
      layer: s.layer ?? false,
    };
  }
  return null;
}

export function play(action: string): void {
  const spec = (ACTION_REGISTRY as Record<string, unknown>)[action];

  if (spec === undefined) {
    if (typeof console !== "undefined") {
      console.warn(`[sound] Unknown action: ${action}`);
    }
    return;
  }
  if (spec === null) return;

  cancelSequence(action);

  // Form 1: bare sound key
  if (typeof spec === "string") {
    playSoundOnce(spec as SoundKey, action);
    return;
  }

  // Form 2: pool — random pick
  if (typeof spec === "object" && !Array.isArray(spec) && "pool" in spec) {
    const pool = (spec as { pool: SoundKey[] }).pool;
    if (pool.length === 0) return;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    playSoundOnce(choice, action);
    return;
  }

  // Form 3: sequence (with optional layered steps)
  if (Array.isArray(spec)) {
    let lastFireTime = 0;
    for (let i = 0; i < spec.length; i++) {
      const step = normalizeStep(spec[i]);
      if (!step) continue;

      const fireAt = i === 0 ? 0 : lastFireTime + step.delay;

      if (fireAt === 0) {
        playSoundOnce(step.sound, action, step.volume);
      } else {
        const id = window.setTimeout(() => {
          playSoundOnce(step.sound, action, step.volume);
          // remove this id from tracking
          const arr = activeTimeouts.get(action);
          if (arr) {
            const idx = arr.indexOf(id);
            if (idx !== -1) arr.splice(idx, 1);
            if (arr.length === 0) activeTimeouts.delete(action);
          }
        }, fireAt);
        trackTimeout(action, id);
      }

      lastFireTime = fireAt;
    }
    return;
  }
}

/**
 * Initialize the engine. Safe to call multiple times.
 *  - Sets up an autoplay-policy unlock on the first user gesture
 *
 * Sound pools are NOT preloaded here — they are built lazily on first
 * playback (and deduped by file), so app boot does not fetch the whole
 * sound library up front.
 */
export function init(): void {
  if (initialized) return;
  initialized = true;

  if (typeof window === "undefined") return;

  const unlock = () => {
    unlocked = true;
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    unlockHandler = null;
  };
  unlockHandler = unlock;

  window.addEventListener("pointerdown", unlock, { once: false });
  window.addEventListener("keydown", unlock, { once: false });
  window.addEventListener("touchstart", unlock, { once: false });
}

export function isUnlocked(): boolean {
  return unlocked;
}

/** Test/diagnostic snapshot without exposing mutable audio elements. */
export function _poolStats(): { sources: number; elements: number } {
  let elements = 0;
  for (const pool of pools.values()) elements += pool.elements.length;
  return { sources: pools.size, elements };
}

/** For tests / hot-reload — reset module state. */
export function _reset(): void {
  for (const ids of activeTimeouts.values()) {
    for (const id of ids) clearTimeout(id);
  }
  activeTimeouts.clear();
  pools.clear();
  lastFiredAt.clear();
  if (typeof window !== "undefined" && unlockHandler) {
    window.removeEventListener("pointerdown", unlockHandler);
    window.removeEventListener("keydown", unlockHandler);
    window.removeEventListener("touchstart", unlockHandler);
  }
  unlockHandler = null;
  unlocked = false;
  initialized = false;
}
