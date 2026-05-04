import { cn } from "@/lib/utils";
import { motion, useAnimate } from "motion/react";
import { useEffect } from "react";

interface Word {
  text: string;
  className?: string;
}

export function TypewriterEffect({
  words,
  className,
  cursorClassName,
}: {
  words: Word[];
  className?: string;
  cursorClassName?: string;
}) {
  const chars = words.flatMap((word, wi) => [
    ...word.text.split("").map((ch, ci) => ({ ch, className: word.className, key: `${wi}-${ci}` })),
    { ch: " ", className: undefined, key: `${wi}-space` },
  ]);

  const [scope, animate] = useAnimate();

  useEffect(() => {
    void animate(
      "span.tw-char",
      { opacity: 1 },
      { duration: 0.25, delay: (_el, i) => 0.025 * i }
    );
  }, [animate]);

  return (
    <span className={cn("inline", className)}>
      <span ref={scope}>
        {chars.map(({ ch, className: wc, key }) => (
          <span key={key} className={cn("tw-char opacity-0", wc)}>
            {ch}
          </span>
        ))}
      </span>
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
        className={cn(
          "inline-block w-[2px] h-[0.9em] rounded-sm bg-current align-middle ml-[1px]",
          cursorClassName
        )}
      />
    </span>
  );
}
