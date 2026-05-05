import React, { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { cn } from "@/lib/utils";

type EncryptedTextProps = {
  text: string;
  className?: string;
  revealDelayMs?: number;
  charset?: string;
  flipDelayMs?: number;
  encryptedClassName?: string;
  revealedClassName?: string;
};

const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%*/-+";

function randomChar(charset: string): string {
  return charset.charAt(Math.floor(Math.random() * charset.length));
}

function gibberish(original: string, charset: string): string {
  if (!original) return "";
  let result = "";
  for (let i = 0; i < original.length; i++) {
    result += original[i] === " " ? " " : randomChar(charset);
  }
  return result;
}

export const EncryptedText: React.FC<EncryptedTextProps> = ({
  text,
  className,
  revealDelayMs = 40,
  charset = DEFAULT_CHARSET,
  flipDelayMs = 40,
  encryptedClassName,
  revealedClassName,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const [revealCount, setRevealCount] = useState(0);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const lastFlipRef = useRef(0);
  const scrambleRef = useRef<string[]>(
    text ? gibberish(text, charset).split("") : []
  );

  useEffect(() => {
    if (!isInView) return;

    scrambleRef.current = text ? gibberish(text, charset).split("") : [];
    startTimeRef.current = performance.now();
    lastFlipRef.current = startTimeRef.current;
    setRevealCount(0);
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startTimeRef.current;
      const revealed = Math.min(text.length, Math.floor(elapsed / Math.max(1, revealDelayMs)));
      setRevealCount(revealed);
      if (revealed >= text.length) return;

      if (now - lastFlipRef.current >= Math.max(0, flipDelayMs)) {
        for (let i = revealed; i < text.length; i++) {
          scrambleRef.current[i] = text[i] === " " ? " " : randomChar(charset);
        }
        lastFlipRef.current = now;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isInView, text, revealDelayMs, charset, flipDelayMs]);

  if (!text) return null;

  return (
    <motion.span ref={ref} className={cn(className)} aria-label={text} role="text">
      {text.split("").map((char, i) => {
        const revealed = i < revealCount;
        const display = revealed
          ? char
          : char === " "
          ? " "
          : (scrambleRef.current[i] ?? randomChar(charset));
        return (
          <span key={i} className={cn(revealed ? revealedClassName : encryptedClassName)}>
            {display}
          </span>
        );
      })}
    </motion.span>
  );
};
