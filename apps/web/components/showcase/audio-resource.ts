"use client";
export const BASE_AUDIO_VOLUME = 0.28;
export type AudioClock = {
  frame: (callback: FrameRequestCallback) => number;
  cancel: (id: number) => void;
  now: () => number;
};
export const browserAudioClock: AudioClock = {
  frame: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
};

/** Exclusive HTML media lease: no Web Audio graph or shared/global element.
 * Construct only inside an already authorized playback action. The caller
 * owns the current scene's lease even when adjacent scenes share a URL.
 */
export function createAudioResource(
  url: string,
  options: {
    create?: () => HTMLAudioElement;
    clock?: AudioClock;
    position?: number;
    volume?: number;
    failed: () => void;
  },
) {
  const media = (options.create ?? (() => new Audio()))();
  const clock = options.clock ?? browserAudioClock;
  let closed = false,
    frame = 0;
  const initialVolume = Math.max(
    0,
    Math.min(BASE_AUDIO_VOLUME, options.volume ?? 0),
  );
  const seek = () => {
    if (closed || !options.position) return;
    const position = Math.max(0, options.position);
    try {
      media.currentTime = Number.isFinite(media.duration)
        ? Math.min(position, Math.max(0, media.duration - 0.1))
        : position;
    } catch {
      /* A non-seekable response can still start from zero. */
    }
  };
  const error = () => {
    if (!closed) options.failed();
  };
  media.addEventListener("loadedmetadata", seek);
  media.addEventListener("error", error);
  const dispose = () => {
    if (closed) return;
    closed = true;
    clock.cancel(frame);
    media.removeEventListener("loadedmetadata", seek);
    media.removeEventListener("error", error);
    media.pause();
    media.removeAttribute("src");
    media.load(); // Abort fetch/decode, empty the resource and settle pending play.
  };
  try {
    media.loop = true;
    media.preload = "none";
    media.volume = initialVolume;
    // Deliberately no crossOrigin attribute: plain media playback needs no CORS.
    media.src = url;
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    position: () => ({
      time: Number.isFinite(media.currentTime) ? media.currentTime : 0,
      volume: media.volume,
    }),
    async play() {
      if (closed) return;
      // Called synchronously from the trusted click path for initial playback.
      await media.play();
      if (closed) return;
      const start = clock.now(),
        duration = 5000 * (1 - initialVolume / BASE_AUDIO_VOLUME);
      const fade = (time: number) => {
        if (closed) return;
        const progress =
          duration > 0
            ? Math.min(1, Math.max(0, (time - start) / duration))
            : 1;
        media.volume =
          initialVolume +
          (BASE_AUDIO_VOLUME - initialVolume) * (1 - (1 - progress) ** 3);
        if (progress < 1) frame = clock.frame(fade);
      };
      frame = clock.frame(fade);
    },
    dispose,
  };
}
export type AudioResource = ReturnType<typeof createAudioResource>;
