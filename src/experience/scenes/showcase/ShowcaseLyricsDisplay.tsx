import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import BlurText from "@/components/BlurText";
import { getShowcaseSceneFontFamily } from "../shared/sceneTypography";
import { showcaseScenes } from "./data";
import { showcaseScrollGate } from "./showcaseScrollGate";
import type { NarrativeLine } from "../shared/narrativeTypes";

type Props = {
  activeSceneIndex: number;
  isActive: boolean;
};

// ── Timing constants ────────────────────────────────────────────────────────
const APPEAR_S           = 1.4;   // fade-in duration
const DISAPPEAR_FLASH_S  = 0.55;  // PS2-style bloom phase
const DISAPPEAR_FADE_S   = 1.4;   // dissolve phase
const LINE_GAP_MS        = 420;   // pause between lines
const SCENE_HANDOFF_MS   = 450;   // fade-out before new scene starts
const MIN_HOLD_MS        = 3400;  // minimum reading time per line
const MAX_HOLD_MS        = 7400;  // maximum reading time per line
const MS_PER_WORD        = 440;   // reading-speed multiplier
const BLUR_TEXT_DELAY_MS = 280;
const BLUR_TEXT_STEP_MS  = 350;
const DEFAULT_FLIP_INTERVAL_MS = 900;
const DEFAULT_FLIP_FINAL_HOLD_MS = 1300;

function flipWordsDuration(line: NarrativeLine): number {
  const flipWords = line.flipWords;
  if (!flipWords || flipWords.words.length <= 1) return 0;

  const interval = flipWords.intervalMs ?? DEFAULT_FLIP_INTERVAL_MS;
  const target = flipWords.target.trim().toLowerCase();
  const targetIndex = line.text
    .trim()
    .split(/\s+/)
    .findIndex((word) => word.replace(/[.,!?;:]*$/, "").toLowerCase() === target);
  const autoStartDelay = targetIndex >= 0 ? targetIndex * BLUR_TEXT_DELAY_MS + BLUR_TEXT_STEP_MS * 2 + 120 : 0;
  const startDelay = flipWords.startDelayMs ?? autoStartDelay;
  const finalHold = flipWords.finalHoldMs ?? DEFAULT_FLIP_FINAL_HOLD_MS;
  return startDelay + (flipWords.words.length - 1) * interval + finalHold;
}

function holdDuration(line: NarrativeLine): number {
  const text = line.text;
  const words = text.trim().split(/\s+/).length;
  const readingHold = Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, words * MS_PER_WORD));
  return Math.max(readingHold, flipWordsDuration(line));
}

function revealFallbackDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(APPEAR_S * 1000, words * BLUR_TEXT_DELAY_MS + BLUR_TEXT_STEP_MS * 2 + 500);
}

export function ShowcaseLyricsDisplay({ activeSceneIndex, isActive }: Props) {
  const lineRef  = useRef<HTMLDivElement>(null);
  const timers   = useRef<ReturnType<typeof setTimeout>[]>([]);
  const currentSceneRef = useRef(-1);
  const lineInCompleteRef = useRef<(() => void) | null>(null);
  const [currentLine, setCurrentLine] = useState<NarrativeLine | null>(null);
  const [lineAnimationKey, setLineAnimationKey] = useState(0);
  const sceneFontFamily = getShowcaseSceneFontFamily(activeSceneIndex);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const after = useCallback((fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  // ── Animations ────────────────────────────────────────────────────────────
  // NOTE: do NOT animate `letter-spacing` — it reflows layout and causes the
  // text to visibly shift/jump between lines. We use only transform, opacity,
  // and filter so the element stays in its absolute center position.

  const animateLineIn = useCallback((line: NarrativeLine, onDone: () => void) => {
    const el = lineRef.current;
    if (!el) { onDone(); return; }
    const text = line.text;

    gsap.killTweensOf(el);
    lineInCompleteRef.current = onDone;

    // Set the wrapper before writing text so the split letters do not flash.
    gsap.set(el, {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "brightness(1) blur(0px)",
    });

    setCurrentLine(line);
    setLineAnimationKey((key) => key + 1);

    // Fallback keeps the story moving if a browser suppresses the animation callback.
    after(() => {
      if (lineInCompleteRef.current === onDone) {
        lineInCompleteRef.current = null;
        onDone();
      }
    }, revealFallbackDuration(text));
  }, [after]);

  const animateLineOut = useCallback((onDone: () => void) => {
    const el = lineRef.current;
    if (!el) { onDone(); return; }

    gsap.killTweensOf(el);
    const tl = gsap.timeline({ onComplete: onDone });

    // Phase 1 — PS2 boot-style bloom: brightness peaks, subtle scale up
    tl.to(el, {
      filter: "brightness(3.2) blur(0px)",
      scale: 1.03,
      duration: DISAPPEAR_FLASH_S,
      ease: "power1.inOut",
    });

    // Phase 2 — evaporate: blur expands, brightness collapses, opacity fades,
    // gentle upward lift (no letter-spacing, so no reflow)
    tl.to(el, {
      opacity: 0,
      y: -8,
      scale: 1.06,
      filter: "brightness(0.4) blur(14px)",
      duration: DISAPPEAR_FADE_S,
      ease: "power2.inOut",
      onComplete: () => setCurrentLine(null),
    });
  }, []);

  const handleSplitAnimationComplete = useCallback(() => {
    const onDone = lineInCompleteRef.current;
    lineInCompleteRef.current = null;
    onDone?.();
  }, []);

  // ── Line sequencer ───────────────────────────────────────────────────────

  const runLines = useCallback(
    (lines: NarrativeLine[], index: number) => {
      if (index >= lines.length) {
        // Paragraph finished — allow the scroll-to-continue indicator.
        showcaseScrollGate.open();
        return;
      }

      const line = lines[index];
      const startLine = () => animateLineIn(line, () => {
        const hold = holdDuration(lines[index]);

        after(() => {
          animateLineOut(() => {
            after(() => runLines(lines, index + 1), LINE_GAP_MS);
          });
        }, hold);
      });

      if (line.blankBeforeMs && line.blankBeforeMs > 0) {
        after(startLine, line.blankBeforeMs);
      } else {
        startLine();
      }
    },
    [animateLineIn, animateLineOut, after]
  );

  // ── Scene entry ──────────────────────────────────────────────────────────

  const startScene = useCallback(
    (sceneIndex: number) => {
      const scene = showcaseScenes[sceneIndex];
      if (!scene) return;

      const lineEl = lineRef.current;
      if (lineEl) gsap.set(lineEl, { opacity: 0 });
      setCurrentLine(null);

      // Brief settling pause, then start lines
      after(() => runLines(scene.lines ?? [], 0), 400);
    },
    [after, runLines]
  );

  // ── Scene change effect ──────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) {
      clearTimers();
      return;
    }

    // -1 means the GSAP timeline hasn't confirmed the first scene yet — stay dormant
    if (activeSceneIndex < 0) {
      clearTimers();
      lineInCompleteRef.current = null;
      currentSceneRef.current = -1;
      setCurrentLine(null);
      showcaseScrollGate.reset();
      return;
    }

    if (activeSceneIndex === currentSceneRef.current) return;
    currentSceneRef.current = activeSceneIndex;

    clearTimers();
    lineInCompleteRef.current = null;
    showcaseScrollGate.reset();

    const lineEl = lineRef.current;
    gsap.killTweensOf(lineEl);

    // Crossfade out current line, then start the new scene
    if (lineEl) {
      gsap.to(lineEl, {
        opacity: 0,
        duration: SCENE_HANDOFF_MS / 1000,
        ease: "power2.in",
      });
    }

    after(() => startScene(activeSceneIndex), SCENE_HANDOFF_MS + 50);
  }, [activeSceneIndex, isActive, clearTimers, after, startScene]);

  if (!isActive) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 600,
        pointerEvents: "none",
      }}
    >
      {/* Subtle vignette behind text for clarity */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 45% at 50% 55%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.28) 45%, rgba(0,0,0,0) 75%)",
          pointerEvents: "none",
        }}
      />

      {/* Current line — absolutely centered so width changes never shift position */}
      <div
        ref={lineRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          margin: 0,
          padding: "0 2rem",
          width: "min(56rem, calc(100vw - 5rem))",
          fontFamily: sceneFontFamily,
          fontSize: "clamp(1.35rem, 3vw, 2.15rem)",
          fontWeight: 700,
          fontStyle: "normal",
          lineHeight: 1.55,
          letterSpacing: "0.015em",
          textAlign: "center",
          color: "rgba(252, 246, 240, 0.97)",
          opacity: 0,
          textShadow:
            "0 2px 6px rgba(0,0,0,0.85), 0 4px 28px rgba(0,0,0,0.75), 0 0 60px rgba(0,0,0,0.5)",
          willChange: "filter, opacity, transform",
        }}
      >
        {currentLine ? (
          <BlurText
            key={lineAnimationKey}
            text={currentLine.text}
            className="showcaseBlurText"
            delay={BLUR_TEXT_DELAY_MS}
            animateBy="words"
            direction="top"
            threshold={0.1}
            rootMargin="0px"
            stepDuration={BLUR_TEXT_STEP_MS / 1000}
            highlights={currentLine.highlights}
            flipWords={currentLine.flipWords}
            onAnimationComplete={handleSplitAnimationComplete}
          />
        ) : null}
      </div>
    </div>
  );
}
