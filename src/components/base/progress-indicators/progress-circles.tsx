import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";

type ProgressBarCircleSize = "xxs" | "xs" | "sm" | "md" | "lg";

type ProgressBarCircleProps = {
  min?: number;
  max?: number;
  value: number;
  size?: ProgressBarCircleSize;
  className?: string;
  label?: string;
};

const SIZE_MAP: Record<ProgressBarCircleSize, { px: number; stroke: number; text: string }> = {
  xxs: { px: 38, stroke: 3, text: "0.62rem" },
  xs: { px: 48, stroke: 3.5, text: "0.68rem" },
  sm: { px: 84, stroke: 5.5, text: "1.02rem" },
  md: { px: 78, stroke: 5, text: "0.88rem" },
  lg: { px: 96, stroke: 6, text: "1rem" },
};

export function ProgressBarCircle({
  min = 0,
  max = 100,
  value,
  size = "sm",
  className,
  label,
}: ProgressBarCircleProps) {
  const config = SIZE_MAP[size];
  const radius = (config.px - config.stroke) / 2;
  const center = config.px / 2;
  const circumference = 2 * Math.PI * radius;
  const normalized = max === min ? 0 : (value - min) / (max - min);
  const progress = Math.min(1, Math.max(0, normalized));
  const dashOffset = circumference * (1 - progress);
  const percent = Math.round(progress * 100);

  return (
    <div
      className={cn("progressBarCircle", className)}
      role="progressbar"
      aria-label={label ?? "Chapter progress"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(min + progress * (max - min))}
      style={
        {
          "--progress-circle-size": `${config.px}px`,
          "--progress-circle-text": config.text,
        } as CSSProperties
      }
    >
      <svg
        aria-hidden="true"
        width={config.px}
        height={config.px}
        viewBox={`0 0 ${config.px} ${config.px}`}
      >
        <circle
          className="progressBarCircle__track"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={config.stroke}
        />
        <circle
          className="progressBarCircle__value"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={config.stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
        />
      </svg>
      <span className="progressBarCircle__text">{percent}%</span>
    </div>
  );
}
