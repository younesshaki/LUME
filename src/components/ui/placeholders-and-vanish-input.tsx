"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type PlaceholdersAndVanishInputProps = {
  placeholders: string[];
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  onSubmit?: (e: FormEvent<HTMLFormElement>) => void;
  className?: string;
  inputClassName?: string;
  placeholderClassName?: string;
  showSubmitButton?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "placeholder">;

export function PlaceholdersAndVanishInput({
  placeholders,
  value: controlledValue,
  onChange,
  onSubmit,
  className,
  inputClassName,
  placeholderClassName,
  showSubmitButton = Boolean(onSubmit),
  type = "text",
  disabled,
  ...inputProps
}: PlaceholdersAndVanishInputProps) {
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const newDataRef = useRef<
    { x: number; y: number; r: number; color: string }[]
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState("");
  const [animating, setAnimating] = useState(false);

  const value = controlledValue ?? internalValue;

  const startAnimation = useCallback(() => {
    if (placeholders.length <= 1) return;

    intervalRef.current = window.setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
    }, 3000);
  }, [placeholders.length]);

  useEffect(() => {
    startAnimation();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible" && intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (document.visibilityState === "visible" && !intervalRef.current) {
        startAnimation();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startAnimation]);

  const draw = useCallback(() => {
    if (!inputRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 800;
    canvas.height = 800;
    ctx.clearRect(0, 0, 800, 800);

    const computedStyles = getComputedStyle(inputRef.current);
    const fontSize = parseFloat(computedStyles.getPropertyValue("font-size"));
    ctx.font = `${fontSize * 2}px ${computedStyles.fontFamily}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(value, 16, 40);

    const imageData = ctx.getImageData(0, 0, 800, 800);
    const pixelData = imageData.data;
    const nextData: { x: number; y: number; r: number; color: string }[] = [];

    for (let y = 0; y < 800; y++) {
      const row = 4 * y * 800;
      for (let x = 0; x < 800; x++) {
        const index = row + 4 * x;
        if (
          pixelData[index] !== 0 &&
          pixelData[index + 1] !== 0 &&
          pixelData[index + 2] !== 0
        ) {
          nextData.push({
            x,
            y,
            r: 1,
            color: `rgba(${pixelData[index]}, ${pixelData[index + 1]}, ${pixelData[index + 2]}, ${pixelData[index + 3]})`,
          });
        }
      }
    }

    newDataRef.current = nextData;
  }, [value]);

  useEffect(() => {
    draw();
  }, [draw]);

  const animate = (start: number) => {
    const animateFrame = (position = 0) => {
      window.requestAnimationFrame(() => {
        const nextData = [];

        for (let i = 0; i < newDataRef.current.length; i++) {
          const current = newDataRef.current[i];
          if (current.x < position) {
            nextData.push(current);
          } else {
            if (current.r <= 0) {
              current.r = 0;
              continue;
            }
            current.x += Math.random() > 0.5 ? 1 : -1;
            current.y += Math.random() > 0.5 ? 1 : -1;
            current.r -= 0.05 * Math.random();
            nextData.push(current);
          }
        }

        newDataRef.current = nextData;
        const ctx = canvasRef.current?.getContext("2d");
        if (ctx) {
          ctx.clearRect(position, 0, 800, 800);
          newDataRef.current.forEach((item) => {
            if (item.x > position) {
              ctx.beginPath();
              ctx.rect(item.x, item.y, item.r, item.r);
              ctx.fillStyle = item.color;
              ctx.strokeStyle = item.color;
              ctx.stroke();
            }
          });
        }

        if (newDataRef.current.length > 0) {
          animateFrame(position - 8);
        } else {
          if (controlledValue === undefined) {
            setInternalValue("");
          }
          setAnimating(false);
        }
      });
    };

    animateFrame(start);
  };

  const vanishAndSubmit = () => {
    setAnimating(true);
    draw();

    if (value) {
      const maxX = newDataRef.current.reduce(
        (prev, current) => (current.x > prev ? current.x : prev),
        0
      );
      animate(maxX);
    } else {
      setAnimating(false);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (animating) return;
    if (controlledValue === undefined) {
      setInternalValue(e.target.value);
    }
    onChange?.(e);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    vanishAndSubmit();
    onSubmit?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onSubmit && e.key === "Enter" && !animating) {
      vanishAndSubmit();
    }
    inputProps.onKeyDown?.(e);
  };

  const rootClassName = cn(
    "relative mx-auto h-12 w-full max-w-xl overflow-hidden rounded-full bg-white shadow-[0px_2px_3px_-1px_rgba(0,0,0,0.1),_0px_1px_0px_0px_rgba(25,28,33,0.02),_0px_0px_0px_1px_rgba(25,28,33,0.08)] transition duration-200 dark:bg-zinc-800",
    value && "bg-gray-50",
    disabled && "opacity-60",
    className
  );

  const content = (
    <>
      <canvas
        className={cn(
          "pointer-events-none absolute left-2 top-[20%] origin-top-left scale-50 pr-20 text-base filter invert dark:invert-0 sm:left-8",
          !animating ? "opacity-0" : "opacity-100"
        )}
        ref={canvasRef}
      />
      <input
        {...inputProps}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        value={value}
        type={type}
        className={cn(
          "relative z-50 h-full w-full rounded-full border-none bg-transparent pl-4 pr-14 text-sm text-black focus:outline-none focus:ring-0 dark:text-white sm:pl-10 sm:text-base",
          animating && "text-transparent dark:text-transparent",
          inputClassName
        )}
      />

      {showSubmitButton ? (
        <button
          disabled={!value || disabled}
          type="submit"
          className="absolute right-2 top-1/2 z-50 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black transition duration-200 disabled:bg-gray-100 dark:bg-zinc-900 dark:disabled:bg-zinc-800"
        >
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-gray-300"
          >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <motion.path
              d="M5 12l14 0"
              initial={{
                strokeDasharray: "50%",
                strokeDashoffset: "50%",
              }}
              animate={{
                strokeDashoffset: value ? 0 : "50%",
              }}
              transition={{
                duration: 0.3,
                ease: "linear",
              }}
            />
            <path d="M13 18l6 -6" />
            <path d="M13 6l6 6" />
          </motion.svg>
        </button>
      ) : null}

      <div className="pointer-events-none absolute inset-0 flex items-center rounded-full">
        <AnimatePresence mode="wait">
          {!value && (
            <motion.p
              initial={{
                y: 5,
                opacity: 0,
              }}
              key={`current-placeholder-${currentPlaceholder}`}
              animate={{
                y: 0,
                opacity: 1,
              }}
              exit={{
                y: -15,
                opacity: 0,
              }}
              transition={{
                duration: 0.3,
                ease: "linear",
              }}
              className={cn(
                "w-[calc(100%-3.5rem)] pl-4 pr-2 text-left text-sm font-normal leading-tight text-neutral-500 dark:text-zinc-500 sm:pl-10 sm:text-base",
                placeholderClassName
              )}
            >
              {placeholders[currentPlaceholder] ?? ""}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );

  if (onSubmit) {
    return (
      <form className={rootClassName} onSubmit={handleSubmit}>
        {content}
      </form>
    );
  }

  return (
    <div className={rootClassName}>
      {content}
    </div>
  );
}
