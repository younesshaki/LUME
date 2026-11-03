"use client";
import { useFrame } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import type { ShowcaseScene } from "./types";
import { cameraAt } from "./camera-path";
import { useStoryStore } from "./StoryBridge";

function useScrollCamera(scene: ShowcaseScene) {
  const store = useStoryStore();
  useFrame(({ camera }, delta) => {
    const state = store.getSnapshot();
    // A remount can briefly overlap React's commit; never animate an old scene
    // using the next scene's progress. Reduced motion has one stable pose.
    if (state.sceneId !== scene.id) return;
    const position = cameraAt(scene, state.reduced ? 0 : state.sceneProgress);
    const damping = state.reduced
      ? 1
      : 1 - Math.pow(0.001, Math.min(delta, 0.1));
    camera.position.x += (position[0] - camera.position.x) * damping;
    camera.position.y += (position[1] - camera.position.y) * damping;
    camera.position.z += (position[2] - camera.position.z) * damping;
    camera.lookAt(0, 0, 0);
    const perspective = camera as PerspectiveCamera;
    if (perspective.fov !== 48) {
      perspective.fov = 48;
      perspective.updateProjectionMatrix();
    }
  });
}
export default function CameraRig({ scene }: { scene: ShowcaseScene }) {
  useScrollCamera(scene);
  return null;
}
