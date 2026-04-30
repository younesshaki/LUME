import { useGLTF } from "@react-three/drei";
import { chapterModelUrls as showcaseChapter1Assets } from "./scenes/showcase/data/sceneAssets";

export type SceneAssetKey = `${number}-${number}`;

const SCENE_ASSETS: Record<SceneAssetKey, string[]> = {
  "7-1": showcaseChapter1Assets,
};

export const ALL_SCENE_ASSETS = Array.from(
  new Set(Object.values(SCENE_ASSETS).flat())
);

export const getSceneAssetUrls = (part: number, chapter: number) =>
  SCENE_ASSETS[`${part}-${chapter}`] ?? [];

export const preloadAssetUrls = (urls: string[]) => {
  urls.forEach((url) => {
    useGLTF.preload(url);
  });
};

export const preloadSceneAssets = (part: number, chapter: number) => {
  preloadAssetUrls(getSceneAssetUrls(part, chapter));
};

export const preloadAdjacentChapters = (part: number, chapter: number) => {
  const urls = new Set<string>();
  getSceneAssetUrls(part, chapter).forEach((url) => urls.add(url));
  getSceneAssetUrls(part, chapter + 1).forEach((url) => urls.add(url));
  if (chapter > 1) getSceneAssetUrls(part, chapter - 1).forEach((url) => urls.add(url));
  preloadAssetUrls(Array.from(urls));
};
