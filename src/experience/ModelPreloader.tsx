import { useEffect } from "react";
import { preloadSceneAssets } from "./sceneAssets";

export function ModelPreloader() {
  useEffect(() => {
    // Only preload the entry scene to save bandwidth/memory. 
    // Subsequent chapters are preloaded smartly in Experience.tsx
    preloadSceneAssets(1, 1);
  }, []);

  return null;
}
