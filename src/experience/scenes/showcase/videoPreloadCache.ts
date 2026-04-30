import {
  showcaseSceneAssets,
  type ShowcaseVideoQuality,
} from "./data/sceneAssets";
import { toFallbackUrl } from "@/config/cdn";

export type VideoPreloadStatus = "idle" | "loading" | "ready" | "error";

export type VideoPreloadSnapshot = {
  status: VideoPreloadStatus;
  /** 0-100. High quality uses byte progress; normal quality uses stream warmup readiness. */
  progress: number;
  error: string | null;
  quality: ShowcaseVideoQuality;
};

const videosByQuality = showcaseSceneAssets.video.blenderScenes;
const REQUIRED_VIDEO_COUNT = 2;
const NORMAL_WARMUP_TIMEOUT_MS = 5200;

const APPROX_SIZES: Record<string, number> = {
  [videosByQuality.high[0]]: 52_111_987,
  [videosByQuality.high[1]]: 22_258_666,
  [videosByQuality.normal[0]]: 13_958_768,
  [videosByQuality.normal[1]]: 5_218_970,
};

const blobUrls = new Map<string, string>();
const warmupVideos = new Map<string, HTMLVideoElement>();

const snapshots: Record<ShowcaseVideoQuality, Omit<VideoPreloadSnapshot, "quality">> = {
  high: { status: "idle", progress: 0, error: null },
  normal: { status: "idle", progress: 0, error: null },
};

const activePromises: Partial<Record<ShowcaseVideoQuality, Promise<void>>> = {};
const subscribers: Record<
  ShowcaseVideoQuality,
  Set<(s: VideoPreloadSnapshot) => void>
> = {
  high: new Set(),
  normal: new Set(),
};

function snap(quality: ShowcaseVideoQuality): VideoPreloadSnapshot {
  return { ...snapshots[quality], quality };
}

function setSnapshot(
  quality: ShowcaseVideoQuality,
  next: Partial<Omit<VideoPreloadSnapshot, "quality">>
) {
  snapshots[quality] = {
    ...snapshots[quality],
    ...next,
  };
  notify(quality);
}

function notify(quality: ShowcaseVideoQuality) {
  const s = snap(quality);
  subscribers[quality].forEach((fn) => fn(s));
}

async function fetchBlob(
  url: string,
  onBytes?: (loaded: number, total: number) => void
): Promise<void> {
  if (blobUrls.has(url)) return;

  let res = await fetch(url, { mode: "cors" }).catch(() => null);
  if (!res || !res.ok || !res.body) {
    const fallback = toFallbackUrl(url);
    if (import.meta.env.DEV) {
      console.warn(`[CDN fallback] R2 video fetch failed → Supabase: ${url}`);
    }
    res = await fetch(fallback, { mode: "cors" });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  }

  const contentLength = Number(res.headers.get("content-length") ?? 0);
  const total = contentLength || (APPROX_SIZES[url] ?? 30_000_000);

  if (contentLength && APPROX_SIZES[url] !== contentLength) {
    APPROX_SIZES[url] = contentLength;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let loaded = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onBytes?.(loaded, total);
  }

  const blob = new Blob(chunks, { type: "video/mp4" });
  blobUrls.set(url, URL.createObjectURL(blob));
}

function warmStreamingVideo(
  url: string,
  onProgress?: (value: number) => void
): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  let video = warmupVideos.get(url);
  if (!video) {
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    warmupVideos.set(url, video);
  }

  return new Promise((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      cleanup();
      onProgress?.(100);
      resolve();
    };

    const update = (value: number) => {
      if (!finished) onProgress?.(value);
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadstart", onLoadStart);
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", finish);
      video.removeEventListener("error", onError);
    };

    const onLoadStart = () => update(18);
    const onLoadedMetadata = () => update(38);
    const onLoadedData = () => update(72);

    const timeout = window.setTimeout(finish, NORMAL_WARMUP_TIMEOUT_MS);

    let triedFallback = false;
    const onError = () => {
      if (!triedFallback) {
        triedFallback = true;
        const fallback = toFallbackUrl(url);
        if (import.meta.env.DEV) {
          console.warn(`[CDN fallback] R2 stream failed → Supabase: ${url}`);
        }
        video.src = fallback;
        video.load();
        return;
      }
      finish();
    };

    video.addEventListener("loadstart", onLoadStart);
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", finish);
    video.addEventListener("error", onError);

    if (video.src !== url) {
      video.src = url;
    }

    if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      finish();
      return;
    }

    video.load();
  });
}

async function runHighQuality(): Promise<void> {
  const required = videosByQuality.high.slice(0, REQUIRED_VIDEO_COUNT);
  const totalApprox = required.reduce(
    (n, u) => n + (APPROX_SIZES[u] ?? 30_000_000),
    0
  );
  const perLoaded = new Map<string, number>(required.map((u) => [u, 0]));

  const onBytes = (url: string, loaded: number) => {
    perLoaded.set(url, loaded);
    const sum = Array.from(perLoaded.values()).reduce((a, b) => a + b, 0);
    setSnapshot("high", {
      progress: Math.min(99, Math.round((sum / totalApprox) * 100)),
    });
  };

  await Promise.all(
    required.map((url) =>
      fetchBlob(url, (loaded) => onBytes(url, loaded)).catch(() => {
        // Non-fatal: if a blob fetch fails, playback falls back to the CDN URL.
      })
    )
  );
}

async function runNormalQuality(): Promise<void> {
  const required = videosByQuality.normal.slice(0, REQUIRED_VIDEO_COUNT);
  const perVideo = new Map<string, number>(required.map((u) => [u, 0]));

  const onProgress = (url: string, value: number) => {
    perVideo.set(url, value);
    const sum = Array.from(perVideo.values()).reduce((a, b) => a + b, 0);
    setSnapshot("normal", {
      progress: Math.min(99, Math.round(sum / required.length)),
    });
  };

  await Promise.all(
    required.map((url) => warmStreamingVideo(url, (value) => onProgress(url, value)))
  );

  // Keep the compressed path light: after the first two are warmed, hint the rest
  // without blocking the chapter entrance or storing large blobs in memory.
  void Promise.allSettled(
    videosByQuality.normal
      .slice(REQUIRED_VIDEO_COUNT)
      .map((url) => warmStreamingVideo(url))
  );
}

async function run(quality: ShowcaseVideoQuality): Promise<void> {
  if (quality === "high") {
    await runHighQuality();
    return;
  }

  await runNormalQuality();
}

export function subscribeToShowcaseVideoPreload(
  quality: ShowcaseVideoQuality,
  fn: (s: VideoPreloadSnapshot) => void
): () => void {
  subscribers[quality].add(fn);
  fn(snap(quality));
  return () => subscribers[quality].delete(fn);
}

export function preloadShowcaseBackgroundVideos(
  quality: ShowcaseVideoQuality
): Promise<void> {
  if (snapshots[quality].status === "ready") return Promise.resolve();
  if (activePromises[quality]) return activePromises[quality] as Promise<void>;

  setSnapshot(quality, {
    status: "loading",
    error: null,
    progress: 0,
  });

  activePromises[quality] = run(quality)
    .then(() => {
      setSnapshot(quality, {
        status: "ready",
        progress: 100,
        error: null,
      });
    })
    .catch((err: unknown) => {
      setSnapshot(quality, {
        status: "error",
        error: err instanceof Error ? err.message : "Could not load videos",
      });
    })
    .finally(() => {
      activePromises[quality] = undefined;
    });

  return activePromises[quality] as Promise<void>;
}

export function getShowcaseVideoSource(url: string): string {
  return blobUrls.get(url) ?? url;
}
