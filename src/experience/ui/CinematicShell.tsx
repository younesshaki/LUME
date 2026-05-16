import type { PropsWithChildren } from "react";
import { useDualMode } from "@/lib/DualModeContext";
import sharedBackgroundImage from "../assets/images/lume-homepage-background.png";

type CinematicShellProps = PropsWithChildren<{
  className?: string;
}>;

export default function CinematicShell({ children, className }: CinematicShellProps) {
  const { mode } = useDualMode();
  const isLight = mode === "light";

  return (
    <div
      data-mode={mode}
      className={`cinematicShell${className ? ` ${className}` : ""}`}
      style={{
        position: "fixed",
        inset: 0,
        background: isLight ? "#faf9f7" : "#000",
        overflow: "hidden",
      }}
    >
      <div
        className="cinematicShell__image"
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${sharedBackgroundImage})`,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "cover",
          opacity: isLight ? 0 : 1,
          pointerEvents: "none",
        }}
      />
      <div
        className="cinematicShell__overlay"
        style={{
          position: "absolute",
          inset: 0,
          background: isLight
            ? "transparent"
            : "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.85) 100%)",
          zIndex: 1,
        }}
      />
      <div
        className="cinematicShell__content"
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          height: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
