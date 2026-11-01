"use client";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { CatmullRomCurve3, PerspectiveCamera, Vector3 } from "three";

// Single-scene subset of src/experience/CameraRig.tsx and useScrollCamera.ts.
// These are the original showcase/cameraConfig.ts crane waypoints and FOV.
// Scroll scrubs the curve rather than starting the full multi-chapter GSAP
// director. Full timing, shake and chapter/audio synchronization remain unported.
const curve = new CatmullRomCurve3([
  new Vector3(-1.2, 0.8, 6.4),
  new Vector3(-0.3, 0.3, 5.6),
  new Vector3(0, 0.05, 5.2),
]);
export function useScrollCamera(progress: RefObject<number>) {
  useFrame(({ camera, gl }, delta) => {
    const position = curve.getPoint(Math.min(1, Math.max(0, progress.current)));
    camera.position.lerp(position, 1 - Math.pow(0.001, delta));
    camera.lookAt(0, 0, 0);
    if (camera instanceof PerspectiveCamera && camera.fov !== 48) {
      camera.fov = 48;
      camera.updateProjectionMatrix();
    }
    // Read-only POC telemetry. It lets the browser proof verify the actual
    // rendered camera, not a disconnected scroll-progress counter.
    const data = gl.domElement.dataset;
    data.progress = progress.current.toFixed(4);
    data.camera = camera.position
      .toArray()
      .map((v) => v.toFixed(4))
      .join(",");
    data.drawCalls = String(gl.info.render.calls);
    data.triangles = String(gl.info.render.triangles);
  });
}
export default function CameraRig({
  progress,
}: {
  progress: RefObject<number>;
}) {
  useScrollCamera(progress);
  return null;
}
