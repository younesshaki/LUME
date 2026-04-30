import type { ReactNode } from "react";
import "./GradientText.css";

interface GradientTextProps {
  children: ReactNode;
  className?: string;
  colors?: string[];
}

export default function GradientText({ children, className = "", colors }: GradientTextProps) {
  const gradient = colors
    ? [...colors, colors[0]].join(", ")
    : "#8a0f1f, #ff3347, #b81c2e, #8a0f1f";

  return (
    <span
      className={`narrative-gradient-text ${className}`}
      style={{ backgroundImage: `linear-gradient(to right, ${gradient})` }}
    >
      {children}
    </span>
  );
}
