import type { CSSProperties, PropsWithChildren } from "react";
import { useDualMode } from "@/lib/DualModeContext";
import sharedBackgroundImage from "../assets/images/lume-homepage-background.png";
import "./CinematicShell.css";

type CinematicShellProps = PropsWithChildren<{
  className?: string;
  /** Delay the large shared artwork when content has a more important network path. */
  loadBackground?: boolean;
}>;

export default function CinematicShell({
  children,
  className,
  loadBackground = true,
}: CinematicShellProps) {
  const { mode } = useDualMode();

  return (
    <div
      data-mode={mode}
      className={`cinematicShell${className ? ` ${className}` : ""}`}
      style={{
        "--lume-cinematic-shell-artwork": loadBackground
          ? `url(${JSON.stringify(sharedBackgroundImage)})`
          : "none",
      } as CSSProperties}
    >
      <div className="cinematicShell__image" />
      <div className="cinematicShell__overlay" />
      <div className="cinematicShell__content">{children}</div>
    </div>
  );
}
