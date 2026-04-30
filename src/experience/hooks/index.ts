/**
 * Director Timeline System
 * 
 * A unified system for orchestrating scroll-driven animations across:
 * - DOM elements (text reveals, UI transitions)
 * - Camera movements (position, rotation, FOV)
 * - 3D object animations (transforms, materials)
 * 
 * All synced to scroll position via GSAP ScrollTrigger + Lenis.
 */

// Core hooks
export { useSmoothScroll } from "./useSmoothScroll";
export { 
  useDirectorTimeline,
  createTextReveal,
  createCameraMove,
  type DirectorKeyframe,
  type DirectorTimelineConfig,
  type DirectorTimelineOptions,
  type DirectorTimelineReturn,
} from "./useDirectorTimeline";
export {
  useScrollCamera,
  createCameraKeyframes,
  type ScrollCameraConfig,
  type ScrollCameraOptions,
} from "./useScrollCamera";

// Context for sharing scroll progress
export {
  ScrollProgressProvider,
  useScrollProgress,
  useScrollProgressValue,
  type ScrollProgressContextType,
} from "./scrollProgressContext";
