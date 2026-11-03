"use client";
import type { ShowcaseScene } from "./types";

/** Vite's three-point crane, then its .08 rad/s orbit mapped to each 25s beat.
 * Pure sampling lets the scroll and reduced-motion paths share exact endpoints.
 * Original cameraConfig has a chapter path, not three distinct scene cameras.
 */
export function cameraAt(
  scene: ShowcaseScene,
  progress: number,
): [number, number, number] {
  const p = Math.max(0, Math.min(1, progress));
  if (scene.camera.kind === "orbit") {
    const angle = scene.camera.orbitStart + p * scene.duration * 0.08;
    return [Math.cos(angle) * 5.2, 0.05, Math.sin(angle) * 5.2];
  }
  const points = [
    [-1.2, 0.8, 6.4],
    [-0.3, 0.3, 5.6],
    [0, 0.05, 5.2],
  ];
  const segment = p < 0.5 ? 0 : 1,
    t = p * 2 - segment;
  return points[segment].map(
    (a, i) => a + (points[segment + 1][i] - a) * t,
  ) as [number, number, number];
}
