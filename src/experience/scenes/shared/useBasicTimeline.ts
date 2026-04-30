import { useEffect, useRef, type RefObject } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useSoundSettings } from "../../soundContext";
import { debugState } from "../../utils/DebugOverlay";
import { audioSyncRegistry } from "./audioSync";

// Register ScrollTrigger (may already be registered by useSmoothScroll, but safe to call again)
gsap.registerPlugin(ScrollTrigger);

type BasicTimelineOptions = {
  overlayRef: RefObject<HTMLDivElement>;
  isActive: boolean;
  introDuration?: number;
  introRevealLead?: number;
  /** 
   * If true, uses native scroll + ScrollTrigger scrub instead of manual wheel hijacking.
   * This integrates with Lenis smooth scroll for buttery animations.
   * Default: true (ScrollTrigger mode)                          
   */
  useScrollTrigger?: boolean;
  /**
   * If true, the timeline auto-advances within each scene, but pauses at scene
   * boundaries waiting for user scroll to continue to the next scene.
   * Default: true
   */
  autoPlayWithGates?: boolean;
  /**
   * Callback fired on progress updates (for external synchronization)
   */
  onProgressUpdate?: (progress: number, activeSceneId: string | null) => void;
};

type BasicTimelineReturn = {
  /** Current scroll progress (0-1) */
  progress: number;
  /** Ref to current progress for use in callbacks */
  progressRef: RefObject<number>;
  /** Whether scroll is currently enabled */
  scrollEnabled: boolean;
};

type VoiceOverMap = Record<string, HTMLAudioElement>;

type SceneConfig = {
  element: HTMLElement;
  id: string;
  behavior: "standard" | "cinematic";
  duration: number;
  startTime: number;
  endTime: number;
};


export function useBasicTimeline({
  overlayRef,
  isActive,
  introDuration,
  introRevealLead,
  useScrollTrigger = true,
  autoPlayWithGates = true,
  onProgressUpdate,
}: BasicTimelineOptions): BasicTimelineReturn {
  const scrollProgressRef = useRef(0);
  const scrollEnabledRef = useRef(false);
  const soundStateRef = useRef({ enabled: true, blocked: false });
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeSceneIdRef = useRef<string | null>(null);
  const { soundEnabled, soundBlocked } = useSoundSettings();

  // Helper to report progress updates
  const reportProgress = (progress: number, sceneId: string | null) => {
    scrollProgressRef.current = progress;
    activeSceneIdRef.current = sceneId;
    
    // Update debug overlay state
    debugState.scrollProgress = progress;
    debugState.activeScene = sceneId;
    
    onProgressUpdate?.(progress, sceneId);
  };

  useEffect(() => {
    soundStateRef.current = { enabled: soundEnabled, blocked: soundBlocked };
  }, [soundEnabled, soundBlocked]);

  useEffect(() => {
    if (!isActive) {
      scrollEnabledRef.current = false;
      scrollProgressRef.current = 0;
      return;
    }

    let ctx: gsap.Context | null = null;
    let rafId = 0;
    let timeline: gsap.core.Timeline | null = null;
    let touchStartY = 0;
    let minScrollProgress = 0;
    let maxScrollProgress = 1;
    let currentScenes: SceneConfig[] = [];
    let totalTimelineDuration = 0;

    const audioMap: VoiceOverMap = {};

    const stopAllAudio = () => {
      Object.values(audioMap).forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 0;
      });
    };

    const getSceneId = (element: HTMLElement) =>
      Array.from(element.classList).find((name) => name.startsWith("scene-"));

    const getSceneConfig = (element: HTMLElement, id: string): SceneConfig => {
      // Parse behavior from data-attribute if available, or default to standard
      // In a real app, you might map this from your `chapter1Scenes` data object directly
      // but for now we'll assume the DOM element carries the behavior (e.g. data-behavior="cinematic")
      // OR we just use standard.
      // To strictly follow the "clean" data-driven approach, we should look up the narrativeTypes config.
      // However, to keep this hook generic, we will read from dataset.

      const behavior = (element.dataset.behavior === "cinematic" ? "cinematic" : "standard");
      const duration = parseFloat(element.dataset.duration || "0") || 22; // Default 22s
      // startTime and endTime will be calculated later during timeline construction
      return { element, id, behavior, duration, startTime: 0, endTime: 0 };
    };

    const startTimeline = () => {
      if (!overlayRef.current) {
        rafId = window.requestAnimationFrame(startTimeline);
        return;
      }

      ctx = gsap.context(() => {
        const fadeDuration = 1.1;
        const defaultSceneDuration = 22;
        const overlap = 4;
        const step = Math.max(defaultSceneDuration - overlap, 1);
        const audioFade = 0.8;

        const sceneElements = Array.from(
          overlayRef.current?.querySelectorAll<HTMLElement>(".narrativeScene") ?? []
        );
        
        const sceneEntries = sceneElements
          .map((scene) => ({ element: scene, id: getSceneId(scene) }))
          .filter(
            (entry): entry is { element: HTMLElement; id: string } => Boolean(entry.id)
          )
          .map(entry => getSceneConfig(entry.element, entry.id));
        
        currentScenes = sceneEntries;

        if (sceneEntries.length === 0) {
          return;
        }

        const introHold = Math.max(
          0,
          introDuration ?? Math.min(5, defaultSceneDuration * 0.45)
        );
        const revealLead = Math.max(0, introRevealLead ?? 0);
        const timelineOffset = Math.max(0, introHold - revealLead);

        // Calculate total duration based on steps.
        // Note: With variable durations, this calculation becomes complex if using fixed steps.
        // For hybrid, "scroll space" is often mapped linearly.
        // Let's assume the timeline maps 1 scroll unit = X seconds roughly.
        // But for cinematic, we want it to feel like time.
        // A simple approach: The timeline is constructed in "seconds" (GSAP default).
        // Scroll 0->1 maps to Time 0->TotalDuration.

        const totalDuration =
          timelineOffset + defaultSceneDuration + step * (sceneEntries.length - 1);
        
        totalTimelineDuration = totalDuration;
        const MIN_SCROLL_PROGRESS = timelineOffset / totalDuration;
        const MAX_SCROLL_PROGRESS = 1;

        const tl = gsap.timeline({ paused: true });
        timeline = tl;
        minScrollProgress = MIN_SCROLL_PROGRESS;
        maxScrollProgress = MAX_SCROLL_PROGRESS;

        const cinematicReveal = (selector: string, startTime: number, stagger = 0.15) => {
          tl.fromTo(
            selector,
            {
              y: 50,
              rotateX: -20,
              autoAlpha: 0,
              filter: "blur(8px)",
              scale: 0.95,
            },
            {
              y: 0,
              rotateX: 0,
              autoAlpha: 1,
              filter: "blur(0px)",
              scale: 1,
              duration: 1.6,
              ease: "power3.out",
              stagger,
            },
            startTime
          );
        };

        const revealTitle = (selector: string, startTime: number) => {
          tl.fromTo(
            selector,
            { scale: 1.2, autoAlpha: 0, filter: "blur(12px)" },
            { scale: 1, autoAlpha: 1, filter: "blur(0px)", duration: 2, ease: "power4.out" },
            startTime
          );
        };

        const revealScene = (sceneSelector: string, startTime: number, lineStagger = 0.2) => {
          const innerSelector = `${sceneSelector} .narrativeSceneInner`;
          tl.set(innerSelector, { autoAlpha: 1 }, startTime);
          revealTitle(`${sceneSelector} .narrativeTitle`, startTime + 0.3);
          cinematicReveal(`${sceneSelector} .narrativeLine`, startTime + 0.6, lineStagger);
        };

        const exitScene = (sceneSelector: string, endTime: number) => {
          const innerSelector = `${sceneSelector} .narrativeSceneInner`;
          tl.to(
            innerSelector,
            {
              y: -60,
              autoAlpha: 0,
              scale: 1.08,
              filter: "blur(15px)",
              duration: fadeDuration,
              ease: "power3.in",
            },
            endTime - fadeDuration
          );
        };

        const scheduleVoiceOver = (
          sceneId: string,
          sceneEl: HTMLElement,
          start: number,
          end: number
        ) => {
          const voiceOverUrl = sceneEl.dataset.voiceover;
          if (!voiceOverUrl) {
            return;
          }

          const startOffset = Number.parseFloat(sceneEl.dataset.voiceoverStart ?? "0") || 0;
          const endOffset = Number.parseFloat(sceneEl.dataset.voiceoverEnd ?? "0") || 0;
          const audioStart = start + startOffset;
          const audioEnd = Math.max(audioStart + audioFade, end - endOffset);

          if (!audioMap[sceneId]) {
            const audio = new Audio(voiceOverUrl);
            audio.preload = "auto";
            audio.volume = 0;
            audioMap[sceneId] = audio;
            // Register with audio sync for time-based image slideshows
            audioSyncRegistry.registerAudio(sceneId, audio);
          }

          const audio = audioMap[sceneId];

          tl.call(() => {
            if (!soundStateRef.current.enabled || soundStateRef.current.blocked) {
              return;
            }
            stopAllAudio();
            audio.currentTime = 0;
            audio.volume = 0;
            const playPromise = audio.play();
            if (playPromise?.catch) {
              playPromise.catch(() => {});
            }
          }, undefined, audioStart);

          tl.to(
            audio,
            {
              volume: 1,
              duration: audioFade,
              ease: "power1.out",
            },
            audioStart
          );

          tl.to(
            audio,
            {
              volume: 0,
              duration: audioFade,
              ease: "power1.in",
            },
            Math.max(audioEnd - audioFade, audioStart + audioFade)
          );

          tl.call(() => {
            audio.pause();
            audio.currentTime = 0;
          }, undefined, audioEnd);
        };

        tl.set(".narrativeSceneInner", { autoAlpha: 0 });

        sceneEntries.forEach((entry, index) => {
          const start = timelineOffset + index * step;
          const end = start + defaultSceneDuration;
          
          // Store ranges for the Hybrid Engine
          currentScenes[index].startTime = start;
          currentScenes[index].endTime = end;

          const sceneSelector = `.narrativeScene.${entry.id}`;

          revealScene(sceneSelector, start, 0.2);
          if (index < sceneEntries.length - 1) {
            exitScene(sceneSelector, end);
          }
          scheduleVoiceOver(entry.id, entry.element, start, end);
        });

        scrollEnabledRef.current = false;
        scrollProgressRef.current = 0;
        tl.progress(0);

        // --- ScrollTrigger Mode ---
        // Instead of manual wheel handling, we bind the timeline to scroll position
        if (useScrollTrigger) {
          // Create a scroll container that provides scroll height
          // This element expands the page to enable native scrolling
          let scrollContainer = document.getElementById("timeline-scroll-container");
          if (!scrollContainer) {
            scrollContainer = document.createElement("div");
            scrollContainer.id = "timeline-scroll-container";
            scrollContainer.style.cssText = `
              position: fixed;
              top: 0;
              left: 0;
              width: 100%;
              height: 100%;
              pointer-events: none;
              z-index: -1;
            `;
            document.body.appendChild(scrollContainer);
          }
          scrollContainerRef.current = scrollContainer as HTMLDivElement;

          // Calculate scroll height based on timeline duration
          // Higher multiplier = more scroll distance needed
          const scrollMultiplier = 100; // 100vh per "unit" of timeline
          const scrollHeight = totalDuration * scrollMultiplier;
          
          // Create inner spacer to generate scrollable area
          let spacer = document.getElementById("timeline-scroll-spacer");
          if (!spacer) {
            spacer = document.createElement("div");
            spacer.id = "timeline-scroll-spacer";
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

          // First, run the intro animation
          gsap.fromTo(
            tl,
            { progress: 0 },
            {
              progress: MIN_SCROLL_PROGRESS,
              duration: introHold || 0.01,
              ease: "power2.inOut",
              onUpdate: () => {
                reportProgress(tl.progress(), null);
              },
              onComplete: () => {
                scrollEnabledRef.current = true;
                reportProgress(MIN_SCROLL_PROGRESS, null);
                
                // Only set up ScrollTrigger if NOT using autoPlayWithGates
                // When autoPlayWithGates is enabled, the hybrid loop controls the timeline
                if (!autoPlayWithGates) {
                  // After intro, set up ScrollTrigger to scrub through the rest
                  ScrollTrigger.create({
                    trigger: spacer,
                    start: "top top",
                    end: "bottom bottom",
                    scrub: 1.5, // Smooth scrubbing with 1.5s delay for buttery feel
                    onUpdate: (self) => {
                      if (!scrollEnabledRef.current) return;
                      
                      // Map scroll progress (0-1) to timeline progress (MIN to MAX)
                      const mappedProgress = gsap.utils.mapRange(
                        0, 1,
                        MIN_SCROLL_PROGRESS, MAX_SCROLL_PROGRESS,
                        self.progress
                      );
                      
                      // Find active scene based on mapped progress
                      const currentTime = mappedProgress * totalTimelineDuration;
                      const activeScene = currentScenes.find(
                        (scene) => currentTime >= scene.startTime && currentTime < scene.endTime
                      );
                      
                      reportProgress(mappedProgress, activeScene?.id ?? null);
                      tl.progress(mappedProgress);
                    },
                    markers: false, // Set to true for debugging
                  });
                  
                  // Refresh ScrollTrigger after setup
                  ScrollTrigger.refresh();
                }
              },
            }
          );
        } else {
          // --- Legacy Manual Mode ---
          // Keep the old wheel-based approach for backward compatibility
          gsap.fromTo(
            tl,
            { progress: 0 },
            {
              progress: MIN_SCROLL_PROGRESS,
              duration: introHold || 0.01,
              ease: "power2.inOut",
              onUpdate: () => {
                scrollProgressRef.current = tl.progress();
              },
              onComplete: () => {
                scrollEnabledRef.current = true;
                scrollProgressRef.current = MIN_SCROLL_PROGRESS;
              },
            }
          );
        }
      }, overlayRef);

      timeline?.progress(scrollProgressRef.current);
    };

    startTimeline();

    // --- Legacy Manual Scroll Handlers (only used when useScrollTrigger = false) ---
    const updateFromDelta = (delta: number) => {
      if (!timeline || !scrollEnabledRef.current || useScrollTrigger) {
        return;
      }

      const rawProgress = scrollProgressRef.current + delta;
      scrollProgressRef.current = gsap.utils.clamp(
        minScrollProgress,
        maxScrollProgress,
        rawProgress
      );
      timeline.progress(scrollProgressRef.current);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!timeline || useScrollTrigger) {
        return;
      }
      event.preventDefault();
      updateFromDelta(event.deltaY / 2500);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (useScrollTrigger) return;
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!timeline || useScrollTrigger) {
        return;
      }
      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = (touchStartY - currentY) / 800;
      touchStartY = currentY;
      updateFromDelta(delta);
    };

    // Hybrid Engine Heartbeat - Auto-play with Scene Gates
    // Auto-advances within each scene, pauses at scene boundaries for user scroll
    let hybridLastTime = performance.now();
    let hybridFrameId = 0;
    
    // Auto-play state
    let isAutoPlaying = false;
    let autoPlayStartProgress = 0;
    let autoPlayTargetProgress = 0;
    let autoPlayElapsed = 0;
    let autoPlayDuration = 0;
    let currentSceneIndex = -1;
    let waitingForUserScroll = false;
    let userScrollAccumulator = 0;
    const SCROLL_THRESHOLD = 0.02; // Amount of scroll needed to trigger next scene

    // Track user scroll input for gate release
    const handleGateScroll = (event: WheelEvent) => {
      if (!waitingForUserScroll) return;
      
      // Only allow forward scrolling to unlock gates
      if (event.deltaY > 0) {
        userScrollAccumulator += event.deltaY / 2500;
        
        if (userScrollAccumulator >= SCROLL_THRESHOLD) {
          // User has scrolled enough - unlock the gate
          waitingForUserScroll = false;
          debugState.waitingForScroll = false;
          userScrollAccumulator = 0;
          
          // Start auto-playing the next scene
          const nextSceneIndex = currentSceneIndex + 1;
          if (nextSceneIndex < currentScenes.length) {
            const nextScene = currentScenes[nextSceneIndex];
            currentSceneIndex = nextSceneIndex;
            
            isAutoPlaying = true;
            debugState.isAutoPlaying = true;
            autoPlayStartProgress = nextScene.startTime / totalTimelineDuration;
            autoPlayTargetProgress = nextScene.endTime / totalTimelineDuration;
            autoPlayDuration = nextScene.duration;
            autoPlayElapsed = 0;
            
            console.log(`[AutoPlay] User unlocked gate, starting scene: ${nextScene.id}`);
          }
        }
      }
      
      event.preventDefault();
    };

    const handleGateTouchStart = (event: TouchEvent) => {
      if (!waitingForUserScroll) return;
      touchStartY = event.touches[0]?.clientY ?? 0;
    };

    const handleGateTouchMove = (event: TouchEvent) => {
      if (!waitingForUserScroll) return;
      
      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = (touchStartY - currentY) / 800;
      touchStartY = currentY;
      
      if (delta > 0) {
        userScrollAccumulator += delta;
        
        if (userScrollAccumulator >= SCROLL_THRESHOLD) {
          waitingForUserScroll = false;
          debugState.waitingForScroll = false;
          userScrollAccumulator = 0;
          
          const nextSceneIndex = currentSceneIndex + 1;
          if (nextSceneIndex < currentScenes.length) {
            const nextScene = currentScenes[nextSceneIndex];
            currentSceneIndex = nextSceneIndex;
            
            isAutoPlaying = true;
            debugState.isAutoPlaying = true;
            autoPlayStartProgress = nextScene.startTime / totalTimelineDuration;
            autoPlayTargetProgress = nextScene.endTime / totalTimelineDuration;
            autoPlayDuration = nextScene.duration;
            autoPlayElapsed = 0;
          }
        }
      }
    };

    // Add gate scroll listeners if auto-play mode is enabled
    if (autoPlayWithGates) {
      window.addEventListener("wheel", handleGateScroll, { passive: false });
      window.addEventListener("touchstart", handleGateTouchStart, { passive: true });
      window.addEventListener("touchmove", handleGateTouchMove, { passive: true });
    }

    const hybridLoop = (time: number) => {
      const dt = (time - hybridLastTime) / 1000;
      hybridLastTime = time;

      if (timeline && scrollEnabledRef.current && totalTimelineDuration > 0 && autoPlayWithGates) {
        // Calculate current time from progress
        const currentTime = scrollProgressRef.current * totalTimelineDuration;
        
        // Find the active scene based on current time
        const activeScene = currentScenes.find(
          (scene) => currentTime >= scene.startTime && currentTime < scene.endTime
        );
        
        // Initialize auto-play on first scene if not started
        if (!isAutoPlaying && !waitingForUserScroll && currentSceneIndex === -1 && currentScenes.length > 0) {
          const firstScene = currentScenes[0];
          currentSceneIndex = 0;
          isAutoPlaying = true;
          debugState.isAutoPlaying = true;
          autoPlayStartProgress = minScrollProgress;
          autoPlayTargetProgress = firstScene.endTime / totalTimelineDuration;
          autoPlayDuration = firstScene.duration;
          autoPlayElapsed = 0;
          
          console.log(`[AutoPlay] Starting first scene: ${firstScene.id}, duration: ${autoPlayDuration}s, from ${autoPlayStartProgress.toFixed(3)} to ${autoPlayTargetProgress.toFixed(3)}`);
        }

        // Auto-advance if currently auto-playing
        if (isAutoPlaying) {
          autoPlayElapsed += dt;
          const t = Math.min(1, autoPlayElapsed / autoPlayDuration);
          
          // Use easeInOut for smooth auto-scroll feel
          const easedT = t < 0.5 
            ? 2 * t * t 
            : 1 - Math.pow(-2 * t + 2, 2) / 2;
          
          const newProgress = gsap.utils.interpolate(
            autoPlayStartProgress,
            autoPlayTargetProgress,
            easedT
          );
          
          // Update progress
          scrollProgressRef.current = newProgress;
          reportProgress(newProgress, currentScenes[currentSceneIndex]?.id ?? null);
          timeline.progress(newProgress);
          
          // Check if scene complete
          if (t >= 1) {
            isAutoPlaying = false;
            debugState.isAutoPlaying = false;
            
            // Check if there are more scenes
            if (currentSceneIndex < currentScenes.length - 1) {
              // Wait for user scroll to continue
              waitingForUserScroll = true;
              debugState.waitingForScroll = true;
              userScrollAccumulator = 0;
              console.log(`[AutoPlay] Scene ${currentScenes[currentSceneIndex]?.id} complete. Waiting for user scroll...`);
            } else {
              console.log(`[AutoPlay] All scenes complete!`);
            }
          }
        }
        
        // Update debug state
        debugState.isAutoPlaying = isAutoPlaying;
        debugState.waitingForScroll = waitingForUserScroll;
        debugState.currentTime = currentTime;
        debugState.totalDuration = totalTimelineDuration;
        debugState.sceneRanges = currentScenes.map(s => ({ sceneId: s.id, start: s.startTime, end: s.endTime }));
        if (activeScene) {
          debugState.activeScene = activeScene.id;
          debugState.sceneStartTime = activeScene.startTime;
          debugState.sceneEndTime = activeScene.endTime;
          const sd = activeScene.endTime - activeScene.startTime;
          debugState.sceneProgress = sd > 0 ? (currentTime - activeScene.startTime) / sd : 0;
        } else {
          debugState.sceneStartTime = 0;
          debugState.sceneEndTime = 0;
          debugState.sceneProgress = 0;
        }
      } else if (timeline && scrollEnabledRef.current && totalTimelineDuration > 0 && !autoPlayWithGates) {
        // Legacy cinematic-only auto-advance (original behavior)
        const currentTime = scrollProgressRef.current * totalTimelineDuration;
        const activeScene = currentScenes.find(
          (scene) => currentTime >= scene.startTime && currentTime < scene.endTime
        );

        if (activeScene?.behavior === "cinematic") {
          if (!isAutoPlaying) {
            isAutoPlaying = true;
            autoPlayStartProgress = scrollProgressRef.current;
            autoPlayTargetProgress = activeScene.endTime / totalTimelineDuration;
            autoPlayDuration = activeScene.duration;
            autoPlayElapsed = 0;
          }
          
          autoPlayElapsed += dt;
          const t = Math.min(1, autoPlayElapsed / autoPlayDuration);
          
          const newProgress = gsap.utils.interpolate(
            autoPlayStartProgress,
            autoPlayTargetProgress,
            t
          );
          
          reportProgress(newProgress, activeScene.id);
          timeline.progress(newProgress);
          
          if (t >= 1) {
            isAutoPlaying = false;
          }
        } else {
          if (isAutoPlaying) {
            isAutoPlaying = false;
          }
          if (activeScene) {
            reportProgress(scrollProgressRef.current, activeScene.id);
          }
        }
        // Update time-tracking debug state for legacy branch
        debugState.currentTime = currentTime;
        debugState.totalDuration = totalTimelineDuration;
        debugState.sceneRanges = currentScenes.map(s => ({ sceneId: s.id, start: s.startTime, end: s.endTime }));
        if (activeScene) {
          debugState.activeScene = activeScene.id;
          debugState.sceneStartTime = activeScene.startTime;
          debugState.sceneEndTime = activeScene.endTime;
          const sd = activeScene.endTime - activeScene.startTime;
          debugState.sceneProgress = sd > 0 ? (currentTime - activeScene.startTime) / sd : 0;
        } else {
          debugState.sceneStartTime = 0;
          debugState.sceneEndTime = 0;
          debugState.sceneProgress = 0;
        }
      }

      hybridFrameId = requestAnimationFrame(hybridLoop);
    };
    
    hybridFrameId = requestAnimationFrame(hybridLoop);

    // Only add manual handlers if not using ScrollTrigger and not using autoPlay
    if (!useScrollTrigger && !autoPlayWithGates) {
      window.addEventListener("wheel", handleWheel, { passive: false });
      window.addEventListener("touchstart", handleTouchStart, { passive: true });
      window.addEventListener("touchmove", handleTouchMove, { passive: true });
    }

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      if (hybridFrameId) {
        window.cancelAnimationFrame(hybridFrameId);
      }
      
      // Cleanup manual handlers
      if (!useScrollTrigger && !autoPlayWithGates) {
        window.removeEventListener("wheel", handleWheel);
        window.removeEventListener("touchstart", handleTouchStart);
        window.removeEventListener("touchmove", handleTouchMove);
      }
      
      // Cleanup gate scroll handlers
      if (autoPlayWithGates) {
        window.removeEventListener("wheel", handleGateScroll);
        window.removeEventListener("touchstart", handleGateTouchStart);
        window.removeEventListener("touchmove", handleGateTouchMove);
      }
      
      // Cleanup ScrollTrigger
      if (useScrollTrigger) {
        ScrollTrigger.getAll().forEach(st => st.kill());
        
        // Remove scroll spacer
        const spacer = document.getElementById("timeline-scroll-spacer");
        if (spacer) spacer.remove();
        
        const container = document.getElementById("timeline-scroll-container");
        if (container) container.remove();
      }
      
      stopAllAudio();
      
      // Unregister audio from sync registry
      Object.keys(audioMap).forEach(sceneId => {
        audioSyncRegistry.unregisterAudio(sceneId);
      });
      
      ctx?.revert();
    };
  }, [isActive, useScrollTrigger, autoPlayWithGates, onProgressUpdate]);

  // Return current state for external consumers
  return {
    get progress() {
      return scrollProgressRef.current;
    },
    progressRef: scrollProgressRef,
    get scrollEnabled() {
      return scrollEnabledRef.current;
    },
  };
}
