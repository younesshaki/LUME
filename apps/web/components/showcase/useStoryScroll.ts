"use client";
import { useEffect, useRef, type RefObject } from "react";
import Lenis from "lenis";
import type { ShowcaseScene } from "./types";
import { sceneAt, type StoryStore } from "./story-store";

export function useStoryScroll(
  element: RefObject<HTMLElement | null>,
  scenes: ShowcaseScene[],
  store: StoryStore,
  reduced: boolean,
) {
  const player = useRef<Lenis | null>(null);
  useEffect(() => {
    store.update({ reduced });
    if (reduced) return;
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });
    player.current = lenis;
    let frame = 0;
    const tick = (time: number) => {
      lenis.raf(time);
      const node = element.current;
      if (node) {
        const top = node.getBoundingClientRect().top + window.scrollY;
        const range = Math.max(1, node.offsetHeight - window.innerHeight);
        const state = sceneAt((window.scrollY - top) / range, scenes.length);
        store.update({
          sceneId: scenes[state.index].id,
          progress: state.progress,
          sceneProgress: state.sceneProgress,
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      player.current = null;
      lenis.destroy();
    };
  }, [element, scenes, store, reduced]);
  return (index: number) => {
    if (reduced) {
      store.update({
        sceneId: scenes[index].id,
        sceneProgress: 0,
        progress: index / scenes.length,
      });
      return;
    }
    const node = element.current;
    if (!node) return;
    // Land just inside the interval, avoiding floating point boundary jitter.
    const progress = (index + 0.01) / scenes.length;
    const y =
      node.getBoundingClientRect().top +
      window.scrollY +
      progress * Math.max(1, node.offsetHeight - window.innerHeight);
    player.current?.scrollTo(y, { immediate: true });
  };
}
