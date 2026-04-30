export type UiSoundId =
  | "hover-soft"
  | "click-primary"
  | "click-nav"
  | "click-gate";

export type UiSoundDefinition = {
  waveform: OscillatorType;
  frequency: number;
  frequencyEnd?: number;
  gain: number;
  durationMs: number;
  attackMs?: number;
  releaseMs?: number;
  cooldownMs?: number;
};

export const uiSounds: Record<UiSoundId, UiSoundDefinition> = {
  "hover-soft": {
    waveform: "sine",
    frequency: 660,
    frequencyEnd: 780,
    gain: 0.018,
    durationMs: 120,
    attackMs: 8,
    releaseMs: 90,
    cooldownMs: 110,
  },
  "click-primary": {
    waveform: "triangle",
    frequency: 320,
    frequencyEnd: 220,
    gain: 0.032,
    durationMs: 180,
    attackMs: 6,
    releaseMs: 140,
    cooldownMs: 40,
  },
  "click-nav": {
    waveform: "triangle",
    frequency: 420,
    frequencyEnd: 280,
    gain: 0.026,
    durationMs: 150,
    attackMs: 4,
    releaseMs: 120,
    cooldownMs: 40,
  },
  "click-gate": {
    waveform: "sine",
    frequency: 240,
    frequencyEnd: 520,
    gain: 0.038,
    durationMs: 260,
    attackMs: 10,
    releaseMs: 170,
    cooldownMs: 60,
  },
};
