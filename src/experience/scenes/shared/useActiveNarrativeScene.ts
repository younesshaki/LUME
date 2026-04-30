import { useEffect, useState, type RefObject } from "react";
import gsap from "gsap";
import type { NarrativeScene } from "./narrativeTypes";

type ActiveNarrativeScene = {
  id: string | null;
  mode: "2d" | "3d";
};

export function useActiveNarrativeScene(
  overlayRef: RefObject<HTMLDivElement>,
  scenes: NarrativeScene[],
  isActive: boolean
): ActiveNarrativeScene {
  const defaultMode = scenes[0]?.mode ?? "3d";
  const [activeScene, setActiveScene] = useState<ActiveNarrativeScene>({
    id: null,
    mode: defaultMode,
  });

  useEffect(() => {
    if (!isActive) {
      setActiveScene({ id: null, mode: defaultMode });
      return;
    }

    let rafId = 0;
    let lastId: string | null = null;

    const tick = () => {
      const overlayRoot =
        overlayRef.current ??
        (document.querySelector(".chapter1Overlay") as HTMLDivElement | null);

      if (overlayRoot) {
        const sceneNodes = Array.from(
          overlayRoot.querySelectorAll<HTMLElement>(".narrativeScene")
        );
        let bestSceneClassName: string | null = null;
        let bestOpacity = 0;
        sceneNodes.forEach((sceneNode) => {
          const inner = sceneNode.querySelector<HTMLElement>(".narrativeSceneInner");
          if (!inner) {
            return;
          }
          const rawOpacity = gsap.getProperty(inner, "autoAlpha");
          const opacityValue =
            typeof rawOpacity === "number"
              ? rawOpacity
              : Number.parseFloat(String(rawOpacity));
          const resolvedOpacity = Number.isFinite(opacityValue) ? opacityValue : 0;
          if (resolvedOpacity > bestOpacity) {
            bestOpacity = resolvedOpacity;
            bestSceneClassName = sceneNode.className;
          }
        });

        const sceneClassName =
          typeof bestSceneClassName === "string" ? bestSceneClassName : "";
        const classNames = sceneClassName.split(" ");
        const nextId =
          scenes.find((scene) => classNames.includes(scene.id))?.id ?? null;

        if (nextId && nextId !== lastId) {
          const scene = scenes.find((entry) => entry.id === nextId);
          lastId = nextId;
          setActiveScene({
            id: nextId,
            mode: scene?.mode ?? "3d",
          });
        }
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [overlayRef, scenes, isActive, defaultMode]);

  return activeScene;
}
