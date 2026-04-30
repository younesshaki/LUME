import { uiSounds, type UiSoundDefinition, type UiSoundId } from "./uiSounds";

export class UiSoundService {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private enabled = true;
  private lastPlayedAt = new Map<UiSoundId, number>();

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  prime() {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    if (context.state === "suspended") {
      void context.resume().catch(() => {});
    }
  }

  play(id: UiSoundId) {
    if (!this.enabled) {
      return;
    }

    const definition = uiSounds[id];
    if (!this.canPlay(id, definition)) {
      return;
    }

    const context = this.ensureContext();
    if (!context || !this.masterGain) {
      return;
    }

    if (context.state !== "running") {
      return;
    }

    this.lastPlayedAt.set(id, performance.now());

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = definition.waveform;
    oscillator.frequency.setValueAtTime(definition.frequency, context.currentTime);

    if (definition.frequencyEnd !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(1, definition.frequencyEnd),
        context.currentTime + definition.durationMs / 1000
      );
    }

    const attackSeconds = (definition.attackMs ?? 5) / 1000;
    const releaseSeconds = (definition.releaseMs ?? definition.durationMs) / 1000;
    const durationSeconds = definition.durationMs / 1000;
    const startTime = context.currentTime + 0.005;
    const peakTime = startTime + attackSeconds;
    const releaseStart = Math.max(peakTime, startTime + durationSeconds - releaseSeconds);
    const stopTime = startTime + durationSeconds;

    gainNode.gain.setValueAtTime(0.0001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(
      Math.max(0.0001, definition.gain),
      peakTime
    );
    gainNode.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(startTime);
    oscillator.stop(stopTime + 0.02);

    oscillator.onended = () => {
      oscillator.disconnect();
      gainNode.disconnect();
    };
  }

  private canPlay(id: UiSoundId, definition: UiSoundDefinition) {
    const cooldownMs = definition.cooldownMs ?? 0;
    if (!cooldownMs) {
      return true;
    }

    const lastPlayedAt = this.lastPlayedAt.get(id);
    if (lastPlayedAt === undefined) {
      return true;
    }

    return performance.now() - lastPlayedAt >= cooldownMs;
  }

  private ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext;
      if (!AudioContextCtor) {
        return null;
      }

      this.audioContext = new AudioContextCtor();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1;
      this.masterGain.connect(this.audioContext.destination);
    }

    return this.audioContext;
  }
}
