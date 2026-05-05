/**
 * LUME Chat — Sound System
 *
 * To wire a sound: drop your audio file into /public/sounds/ and set the path below.
 * To silence a sound: set its value to null.
 * All sounds are preloaded once on first use and cached for the session.
 */

type SoundMap = {
  open: string | null;
  close: string | null;
  send: string | null;
  receive: string | null;
  copy: string | null;
  rate: string | null;
  suggestion: string | null;
  reset: string | null;
};

// ─── Wire your sounds here ────────────────────────────────────────────────────
const SOUNDS: SoundMap = {
  open:       null,   // e.g. "/sounds/chat-open.mp3"
  close:      null,   // e.g. "/sounds/chat-close.mp3"
  send:       null,   // e.g. "/sounds/chat-send.mp3"
  receive:    null,   // e.g. "/sounds/chat-receive.mp3"
  copy:       null,   // e.g. "/sounds/chat-copy.mp3"
  rate:       null,   // e.g. "/sounds/chat-rate.mp3"
  suggestion: null,   // e.g. "/sounds/chat-suggestion.mp3"
  reset:      null,   // e.g. "/sounds/chat-reset.mp3"
};
// ─────────────────────────────────────────────────────────────────────────────

const cache = new Map<string, HTMLAudioElement>();

function load(path: string): HTMLAudioElement {
  if (cache.has(path)) return cache.get(path)!;
  const audio = new Audio(path);
  audio.preload = "auto";
  cache.set(path, audio);
  return audio;
}

function play(path: string | null): void {
  if (!path) return;
  try {
    const audio = load(path);
    audio.currentTime = 0;
    void audio.play();
  } catch {
    // autoplay policy or missing file — silent fail
  }
}

export function useChatSounds() {
  return {
    playOpen:       () => play(SOUNDS.open),
    playClose:      () => play(SOUNDS.close),
    playSend:       () => play(SOUNDS.send),
    playReceive:    () => play(SOUNDS.receive),
    playCopy:       () => play(SOUNDS.copy),
    playRate:       () => play(SOUNDS.rate),
    playSuggestion: () => play(SOUNDS.suggestion),
    playReset:      () => play(SOUNDS.reset),
  };
}
