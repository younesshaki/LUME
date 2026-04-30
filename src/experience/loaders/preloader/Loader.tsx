import { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { LoaderShell } from "../shared/LoaderShell";
import { BirdSvg } from "../shared/BirdSvg";
import type { LoaderComponentProps } from "../shared/types";
import "./styles.css";

const LOADING_LABELS = ["use your headphones alhajja", "loading alhajja", "mab9a 9dma fat", "sbran jamilan"];
const LABEL_INTERVAL_MS = 5000;

export function Loader({ className, text }: LoaderComponentProps) {
  const { active, progress } = useProgress();
  const textProgress = Number(text.match(/(\d+)%/)?.[1]);
  const hasTextProgress = Number.isFinite(textProgress);
  const [displayed, setDisplayed] = useState(0);
  const [labelIndex, setLabelIndex] = useState(0);
  const rafRef = useRef<number>(0);
  const currentRef = useRef(0);

  useEffect(() => {
    const id = setInterval(() => {
      setLabelIndex((i) => (i + 1) % LOADING_LABELS.length);
    }, LABEL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

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
      <span
        className="loading-progress-label"
        style={!isReady && labelIndex === 0 ? { color: "#ffffff" } : undefined}
      >
        {isReady ? "ready" : LOADING_LABELS[labelIndex]}
      </span>
    </div>
  );

  return (
    <LoaderShell
      className={`loader-variant-preload${className ? ` ${className}` : ""}`}
      footer={footer}
    >
      <div className="sunbeam sunbeam-1" />
      <div className="sunbeam sunbeam-2" />
      <div className="sunbeam sunbeam-3" />
      <div className="sunbeam sunbeam-4" />
      <div className="flower flower-1">
        <span className="petal" /><span className="petal" /><span className="petal" />
        <span className="petal" /><span className="petal" /><span className="center" />
      </div>
      <div className="flower flower-2">
        <span className="petal" /><span className="petal" /><span className="petal" />
        <span className="petal" /><span className="petal" /><span className="center" />
      </div>
      <div className="flower flower-3">
        <span className="petal" /><span className="petal" /><span className="petal" />
        <span className="petal" /><span className="petal" /><span className="center" />
      </div>
      <BirdSvg />
    </LoaderShell>
  );
}
