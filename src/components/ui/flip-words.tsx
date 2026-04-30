import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import "./flip-words.css";

type FlipWordsProps = {
  words: string[];
  intervalMs?: number;
  startDelayMs?: number;
  className?: string;
};

export function FlipWords({ words, intervalMs = 900, startDelayMs = 0, className = "" }: FlipWordsProps) {
  const safeWords = useMemo(() => words.map((word) => word.trim()).filter(Boolean), [words]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);

    if (safeWords.length <= 1) return;

    const timers = safeWords.slice(1).map((_, wordIndex) =>
      window.setTimeout(() => {
        setIndex(wordIndex + 1);
      }, startDelayMs + intervalMs * (wordIndex + 1))
    );

    return () => timers.forEach(window.clearTimeout);
  }, [intervalMs, safeWords, startDelayMs]);

  const currentWord = safeWords[index] ?? "";
  const longestWord = safeWords.reduce((longest, word) => (word.length > longest.length ? word : longest), currentWord);

  return (
    <span className={`flipWords ${className}`} aria-live="polite">
      <span className="flipWords__sizer" aria-hidden="true">
        {longestWord}
      </span>
      <AnimatePresence mode="wait">
        <motion.span
          key={`${currentWord}-${index}`}
          className="flipWords__word"
          initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -10, filter: "blur(8px)" }}
          transition={{ duration: 0.38, ease: "easeOut" }}
        >
          {currentWord}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
