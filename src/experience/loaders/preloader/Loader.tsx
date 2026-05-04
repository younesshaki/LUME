import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { LoaderFive } from "@/components/ui/loader";
import { LoaderShell } from "../shared/LoaderShell";
import type { LoaderComponentProps } from "../shared/types";
import "./styles.css";

export function Loader({ className, text }: LoaderComponentProps) {
  const { active, progress } = useProgress();
  const textProgress = Number(text.match(/(\d+)%/)?.[1]);
  const hasTextProgress = Number.isFinite(textProgress);
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef<number>(0);
  const currentRef = useRef(0);

  // Smoothly count up to the real progress value, always reaching 100 when done.
  useEffect(() => {
    const target = hasTextProgress
      ? Math.max(0, Math.min(100, Math.round(textProgress)))
      : active
        ? Math.round(progress)
        : 100;

    const tick = () => {
      const diff = target - currentRef.current;
      if (Math.abs(diff) < 0.5) {
        currentRef.current = target;
        setDisplayed(target);
        return;
      }
      currentRef.current += diff * 0.07;
      setDisplayed(Math.round(currentRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, hasTextProgress, progress, textProgress]);

  const pct = displayed;
  const isReady = hasTextProgress ? pct >= 100 : !active && pct >= 100;

  const footer = (
    <div className="loading-progress-block">
      <span className="loading-progress-number">{pct}</span>
      <span className="loading-progress-symbol">%</span>
      <span className="loading-progress-label">{isReady ? "ready" : "loading"}</span>
    </div>
  );

  return (
    <LoaderShell
      className={`loader-variant-preload${className ? ` ${className}` : ""}`}
      footer={footer}
    >
      <LoaderFive className="loaderFive--preloader" text="Generating scenes..." />
    </LoaderShell>
  );
}
