import { CinematicShellView } from "@lume/blocks/react/CinematicShell";
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
    <CinematicShellView
      mode={mode}
      className={className}
      loadBackground={loadBackground}
      artwork={sharedBackgroundImage}
    >
      {children}
    </CinematicShellView>
  );
}
