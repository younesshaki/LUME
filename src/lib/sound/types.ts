/**
 * LUME Sound System — shared types
 *
 * Layer 1 (sounds.ts):    SoundSpec — file + metadata
 * Layer 2 (actions.ts):   ActionSpec — action key → sound, sequence, layer, or pool
 * Layer 3 (audioEngine):  runtime — pool, play, fade, cooldown
 */

export type SoundSpec = {
  /** Path under /public, e.g. "/sounds/ui/click-soft.mp3" */
  src: string;
  /** 0–1, default 1 */
  volume?: number;
  /** Preload audio element on init, default true */
  preload?: boolean;
  /** Minimum ms between fires of this sound, default 30 */
  cooldownMs?: number;
  /** ±N detune per fire (0–0.2). 0 = none, default 0 */
  pitchVariation?: number;
  /** Audio element pool size for rapid-fire reuse, default 3 */
  pool?: number;
};

export type SoundStep<K extends string = string> =
  | K
  | { sound: K; delay?: number; volume?: number; layer?: boolean };

export type ActionSpec<K extends string = string> =
  | K
  | SoundStep<K>[]
  | { pool: K[] }
  | null;

export type SoundCategory = string;

export type SoundPreferences = {
  master: { muted: boolean; volume: number };
  categories: Record<string, { muted: boolean; volume: number }>;
};
