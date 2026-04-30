import { motion, type Transition } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { FlipWords } from "./ui/flip-words";
import GradientText from "./GradientText";
import type { NarrativeLine } from "@/experience/scenes/shared/narrativeTypes";

type BlurTextProps = {
  text?: string;
  delay?: number;
  className?: string;
  animateBy?: "words" | "letters";
  direction?: "top" | "bottom";
  threshold?: number;
  rootMargin?: string;
  animationFrom?: Record<string, string | number>;
  animationTo?: Array<Record<string, string | number>>;
  easing?: (t: number) => number;
  onAnimationComplete?: () => void;
  stepDuration?: number;
  highlights?: string[];
  flipWords?: NarrativeLine["flipWords"];
};

const buildKeyframes = (
  from: Record<string, string | number>,
  steps: Array<Record<string, string | number>>
): Record<string, Array<string | number>> => {
  const keys = new Set<string>([...Object.keys(from), ...steps.flatMap((step) => Object.keys(step))]);

  const keyframes: Record<string, Array<string | number>> = {};
  keys.forEach((key) => {
    keyframes[key] = [from[key], ...steps.map((step) => step[key])];
  });

  return keyframes;
};

const BlurText: FC<BlurTextProps> = ({
  text = "",
  delay = 200,
  className = "",
  animateBy = "words",
  direction = "top",
  threshold = 0.1,
  rootMargin = "0px",
  animationFrom,
  animationTo,
  easing = (t: number) => t,
  onAnimationComplete,
  stepDuration = 0.35,
  highlights = [],
  flipWords,
}) => {
  const elements = useMemo(() => {
    return animateBy === "words" ? text.split(" ") : text.split("");
  }, [animateBy, text]);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setInView(false);
  }, [text]);

  useEffect(() => {
    if (!ref.current) return;

    const current = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.unobserve(current);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(current);

    return () => observer.disconnect();
  }, [threshold, rootMargin, text]);

  const defaultFrom = useMemo(
    () =>
      direction === "top"
        ? { filter: "blur(10px)", opacity: 0, y: -50 }
        : { filter: "blur(10px)", opacity: 0, y: 50 },
    [direction]
  );

  const defaultTo = useMemo(
    () => [
      {
        filter: "blur(5px)",
        opacity: 0.5,
        y: direction === "top" ? 5 : -5,
      },
      { filter: "blur(0px)", opacity: 1, y: 0 },
    ],
    [direction]
  );

  const fromSnapshot = animationFrom ?? defaultFrom;
  const toSnapshots = animationTo ?? defaultTo;

  const stepCount = toSnapshots.length + 1;
  const totalDuration = stepDuration * (stepCount - 1);
  const times = Array.from({ length: stepCount }, (_, index) =>
    stepCount === 1 ? 0 : index / (stepCount - 1)
  );
  const animateKeyframes = buildKeyframes(fromSnapshot, toSnapshots);
  const normalizedHighlights = useMemo(
    () => new Set(highlights.map((highlight) => highlight.trim().toLowerCase()).filter(Boolean)),
    [highlights]
  );
  const normalizedFlipTarget = flipWords?.target.trim().toLowerCase() ?? "";

  const renderSegment = (segment: string, index: number) => {
    if (animateBy !== "words" || normalizedHighlights.size === 0) {
      if (!normalizedFlipTarget) return segment === " " ? "\u00A0" : segment;
    }

    const match = segment.match(/^(.+?)([.,!?;:]*)$/);
    const word = match?.[1] ?? segment;
    const punctuation = match?.[2] ?? "";

    if (flipWords && normalizedFlipTarget === word.toLowerCase()) {
      const startDelayMs = flipWords.startDelayMs ?? index * delay + totalDuration * 1000 + 120;

      return (
        <>
          <FlipWords
            words={flipWords.words}
            intervalMs={flipWords.intervalMs}
            startDelayMs={startDelayMs}
            className="showcaseFlipWord"
          />
          {punctuation}
        </>
      );
    }

    if (!normalizedHighlights.has(word.toLowerCase())) {
      return segment;
    }

    return (
      <>
        <GradientText className="showcaseGradientWord" animationSpeed={6} direction="horizontal">
          {word}
        </GradientText>
        {punctuation}
      </>
    );
  };

  return (
    <p
      ref={ref}
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        margin: 0,
      }}
    >
      {elements.map((segment, index) => {
        const spanTransition: Transition = {
          duration: totalDuration,
          times,
          delay: (index * delay) / 1000,
          ease: easing,
        };

        return (
          <motion.span
            key={`${segment}-${index}`}
            initial={fromSnapshot}
            animate={inView ? animateKeyframes : fromSnapshot}
            transition={spanTransition}
            onAnimationComplete={index === elements.length - 1 ? onAnimationComplete : undefined}
            style={{
              display: "inline-block",
              willChange: "transform, filter, opacity",
            }}
          >
            {renderSegment(segment, index)}
            {animateBy === "words" && index < elements.length - 1 && "\u00A0"}
          </motion.span>
        );
      })}
    </p>
  );
};

export default BlurText;
