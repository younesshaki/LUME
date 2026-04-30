import { useEffect, useRef, useCallback, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Camera, Object3D, PerspectiveCamera } from "three";

gsap.registerPlugin(ScrollTrigger);

/**
 * Director Timeline - The Master Controller
 * 
 * This is the "single source of truth" timeline that orchestrates:
 * 1. DOM animations (text reveals, UI transitions)
 * 2. Camera movements (position, rotation, FOV)
 * 3. 3D object animations (model transforms, material changes)
 * 
 * All driven by scroll position via ScrollTrigger with smooth scrubbing.
 */

export type DirectorKeyframe = {
  /** Unique identifier for this keyframe */
  id: string;
  /** Position in the timeline (0-1 normalized, or absolute seconds) */
  at: number;
  /** Duration of this segment */
  duration: number;
  /** Behavior type */
  behavior: "scroll" | "cinematic";
  /** Camera configuration for this keyframe */
  camera?: {
    position: [number, number, number];
    target: [number, number, number];
    fov?: number;
    ease?: string;
  };
  /** DOM element selectors to animate */
  dom?: {
    enter?: { selector: string; from: gsap.TweenVars; to: gsap.TweenVars }[];
    exit?: { selector: string; to: gsap.TweenVars }[];
  };
  /** 3D object animations */
  objects?: {
    name: string;
    position?: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    ease?: string;
  }[];
  /** Callback when this keyframe becomes active */
  onEnter?: () => void;
  /** Callback when this keyframe ends */
  onLeave?: () => void;
};

export type DirectorTimelineConfig = {
  /** All keyframes in the timeline */
  keyframes: DirectorKeyframe[];
  /** Total scroll distance multiplier (vh units per timeline unit) */
  scrollMultiplier?: number;
  /** Scrub smoothness (seconds of lag) */
  scrubSmooth?: number;
  /** Enable debug markers */
  debug?: boolean;
};

export type DirectorTimelineOptions = {
  /** Container element for scroll-based DOM animations */
  containerRef: RefObject<HTMLElement>;
  /** Is this timeline currently active */
  isActive: boolean;
  /** Timeline configuration */
  config: DirectorTimelineConfig;
  /** Three.js camera (optional, for camera animations) */
  camera?: Camera;
  /** Callback to get 3D objects by name */
  getObject?: (name: string) => Object3D | null;
};

export type DirectorTimelineReturn = {
  /** Current progress (0-1) */
  progress: number;
  /** Current active keyframe ID */
  activeKeyframe: string | null;
  /** Manually seek to a position */
  seekTo: (progress: number) => void;
  /** Pause the timeline */
  pause: () => void;
  /** Resume the timeline */
  resume: () => void;
};

/**
 * Hook to create and manage a Director Timeline
 */
export function useDirectorTimeline({
  containerRef,
  isActive,
  config,
  camera,
  getObject,
}: DirectorTimelineOptions): DirectorTimelineReturn {
  const progressRef = useRef(0);
  const activeKeyframeRef = useRef<string | null>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const scrollTriggerRef = useRef<ScrollTrigger | null>(null);
  const isPausedRef = useRef(false);
  const cinematicTimeoutRef = useRef<number | null>(null);

  // Build the GSAP timeline from keyframes
  const buildTimeline = useCallback(() => {
    if (!containerRef.current || config.keyframes.length === 0) {
      return null;
    }

    const tl = gsap.timeline({ paused: true });
    const keyframes = config.keyframes;

    // Sort keyframes by position
    const sortedKeyframes = [...keyframes].sort((a, b) => a.at - b.at);

    sortedKeyframes.forEach((kf, index) => {
      const startTime = kf.at;
      const duration = kf.duration;

      // --- DOM Animations ---
      if (kf.dom?.enter) {
        kf.dom.enter.forEach((anim) => {
          tl.fromTo(
            anim.selector,
            anim.from,
            { ...anim.to, duration: duration * 0.4, ease: "power3.out" },
            startTime
          );
        });
      }

      if (kf.dom?.exit) {
        kf.dom.exit.forEach((anim) => {
          tl.to(
            anim.selector,
            { ...anim.to, duration: duration * 0.3, ease: "power2.in" },
            startTime + duration * 0.7
          );
        });
      }

      // --- Camera Animations ---
      if (kf.camera && camera) {
        const camEase = kf.camera.ease || "power2.inOut";
        
        tl.to(
          camera.position,
          {
            x: kf.camera.position[0],
            y: kf.camera.position[1],
            z: kf.camera.position[2],
            duration,
            ease: camEase,
            onUpdate: () => {
              if (kf.camera?.target) {
                camera.lookAt(
                  kf.camera.target[0],
                  kf.camera.target[1],
                  kf.camera.target[2]
                );
              }
            },
          },
          startTime
        );

        if (kf.camera.fov && "fov" in camera) {
          tl.to(
            camera,
            {
              fov: kf.camera.fov,
              duration,
              ease: camEase,
              onUpdate: () => {
                (camera as PerspectiveCamera).updateProjectionMatrix();
              },
            },
            startTime
          );
        }
      }

      // --- 3D Object Animations ---
      if (kf.objects && getObject) {
        kf.objects.forEach((objAnim) => {
          const obj = getObject(objAnim.name);
          if (!obj) return;

          const objEase = objAnim.ease || "power2.inOut";

          if (objAnim.position) {
            tl.to(
              obj.position,
              {
                x: objAnim.position[0],
                y: objAnim.position[1],
                z: objAnim.position[2],
                duration,
                ease: objEase,
              },
              startTime
            );
          }

          if (objAnim.rotation) {
            tl.to(
              obj.rotation,
              {
                x: objAnim.rotation[0],
                y: objAnim.rotation[1],
                z: objAnim.rotation[2],
                duration,
                ease: objEase,
              },
              startTime
            );
          }

          if (objAnim.scale) {
            tl.to(
              obj.scale,
              {
                x: objAnim.scale[0],
                y: objAnim.scale[1],
                z: objAnim.scale[2],
                duration,
                ease: objEase,
              },
              startTime
            );
          }
        });
      }

      // --- Lifecycle Callbacks ---
      if (kf.onEnter) {
        tl.call(
          () => {
            activeKeyframeRef.current = kf.id;
            kf.onEnter?.();
          },
          undefined,
          startTime
        );
      }

      if (kf.onLeave) {
        tl.call(() => kf.onLeave?.(), undefined, startTime + duration);
      }
    });

    return tl;
  }, [config.keyframes, camera, getObject, containerRef]);

  // Handle cinematic auto-advance
  const handleCinematicAdvance = useCallback(
    (keyframe: DirectorKeyframe, timeline: gsap.core.Timeline) => {
      if (keyframe.behavior !== "cinematic" || isPausedRef.current) {
        return;
      }

      // Clear any existing timeout
      if (cinematicTimeoutRef.current) {
        window.clearTimeout(cinematicTimeoutRef.current);
      }

      // Auto-advance the timeline over the keyframe's duration
      const startProgress = timeline.progress();
      const endProgress = Math.min(1, (keyframe.at + keyframe.duration) / timeline.duration());
      const animDuration = keyframe.duration * 1000; // Convert to ms

      gsap.to(timeline, {
        progress: endProgress,
        duration: keyframe.duration,
        ease: "none",
        onUpdate: () => {
          progressRef.current = timeline.progress();
        },
      });
    },
    []
  );

  useEffect(() => {
    if (!isActive) {
      // Cleanup
      timelineRef.current?.kill();
      timelineRef.current = null;
      scrollTriggerRef.current?.kill();
      scrollTriggerRef.current = null;
      progressRef.current = 0;
      activeKeyframeRef.current = null;
      if (cinematicTimeoutRef.current) {
        window.clearTimeout(cinematicTimeoutRef.current);
      }
      return;
    }

    // Wait for container to be ready
    if (!containerRef.current) {
      return;
    }

    const tl = buildTimeline();
    if (!tl) return;

    timelineRef.current = tl;

    // Calculate total scroll height
    const scrollMultiplier = config.scrollMultiplier ?? 100;
    const totalDuration = tl.duration();
    const scrollHeight = totalDuration * scrollMultiplier;

    // Create scroll spacer
    let spacer = document.getElementById("director-scroll-spacer");
    if (!spacer) {
      spacer = document.createElement("div");
      spacer.id = "director-scroll-spacer";
      document.body.appendChild(spacer);
    }
    spacer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 1px;
      height: ${scrollHeight}vh;
      pointer-events: none;
    `;

    // Create ScrollTrigger
    const scrubSmooth = config.scrubSmooth ?? 1.5;
    
    const st = ScrollTrigger.create({
      trigger: spacer,
      start: "top top",
      end: "bottom bottom",
      scrub: scrubSmooth,
      markers: config.debug ?? false,
      onUpdate: (self) => {
        if (isPausedRef.current) return;

        progressRef.current = self.progress;
        tl.progress(self.progress);

        // Check for cinematic keyframes
        const currentTime = self.progress * totalDuration;
        const activeKf = config.keyframes.find(
          (kf) => currentTime >= kf.at && currentTime < kf.at + kf.duration
        );

        if (activeKf && activeKf.behavior === "cinematic") {
          handleCinematicAdvance(activeKf, tl);
        }
      },
    });

    scrollTriggerRef.current = st;
    ScrollTrigger.refresh();

    return () => {
      tl.kill();
      st.kill();
      spacer?.remove();
      if (cinematicTimeoutRef.current) {
        window.clearTimeout(cinematicTimeoutRef.current);
      }
    };
  }, [isActive, buildTimeline, config, handleCinematicAdvance, containerRef]);

  // Public API
  const seekTo = useCallback((progress: number) => {
    if (timelineRef.current) {
      const clampedProgress = gsap.utils.clamp(0, 1, progress);
      timelineRef.current.progress(clampedProgress);
      progressRef.current = clampedProgress;
    }
  }, []);

  const pause = useCallback(() => {
    isPausedRef.current = true;
    timelineRef.current?.pause();
  }, []);

  const resume = useCallback(() => {
    isPausedRef.current = false;
    timelineRef.current?.resume();
  }, []);

  return {
    get progress() {
      return progressRef.current;
    },
    get activeKeyframe() {
      return activeKeyframeRef.current;
    },
    seekTo,
    pause,
    resume,
  };
}

/**
 * Helper to create a standard text reveal animation config
 */
export function createTextReveal(
  selector: string,
  stagger = 0.1
): DirectorKeyframe["dom"] {
  return {
    enter: [
      {
        selector,
        from: {
          y: 50,
          autoAlpha: 0,
          filter: "blur(8px)",
          rotateX: -20,
        },
        to: {
          y: 0,
          autoAlpha: 1,
          filter: "blur(0px)",
          rotateX: 0,
          stagger,
        },
      },
    ],
    exit: [
      {
        selector,
        to: {
          y: -40,
          autoAlpha: 0,
          filter: "blur(12px)",
          scale: 1.05,
        },
      },
    ],
  };
}

/**
 * Helper to create a cinematic camera move
 */
export function createCameraMove(
  from: [number, number, number],
  to: [number, number, number],
  target: [number, number, number],
  options?: { fov?: number; ease?: string }
): DirectorKeyframe["camera"] {
  return {
    position: to,
    target,
    fov: options?.fov,
    ease: options?.ease ?? "power2.inOut",
  };
}
