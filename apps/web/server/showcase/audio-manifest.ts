import "server-only";
import type { AudioTrack, SceneId } from "../../components/showcase/types";

// Same groups as Vite useShowcaseSceneMusic; no request-derived keys or URLs.
export const sceneAudioTracks: Record<SceneId, AudioTrack> = {
  "showcase-scene-1": 1,
  "showcase-scene-2": 1,
  "showcase-scene-3": 1,
  "showcase-scene-4": 1,
  "showcase-scene-5": 2,
  "showcase-scene-6": 2,
  "showcase-scene-7": 2,
  "showcase-scene-8": 2,
  "showcase-scene-9": 3,
  "showcase-scene-10": 3,
  "showcase-scene-11": 3,
  "showcase-scene-12": 4,
};
export const audioKeys: Record<AudioTrack, string> = {
  1: "audio/showcase-track-1.mp3",
  2: "audio/showcase-track-2.mp3",
  3: "audio/showcase-track-3.mp3",
  4: "audio/showcase-track-4.mp3",
};
