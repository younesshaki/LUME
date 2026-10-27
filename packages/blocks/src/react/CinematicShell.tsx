import type { CSSProperties, ReactNode } from "react";
export function CinematicShellView({
  children,
  mode,
  className,
  loadBackground = true,
  artwork,
}: {
  children: ReactNode;
  mode: "standard" | "experience";
  className?: string;
  loadBackground?: boolean;
  artwork: string;
}) {
  return (
    <div
      data-mode={mode}
      className={`cinematicShell${className ? ` ${className}` : ""}`}
      style={
        {
          "--lume-cinematic-shell-artwork": loadBackground
            ? `url(${JSON.stringify(artwork)})`
            : "none",
        } as CSSProperties
      }
    >
      <div className="cinematicShell__image" />
      <div className="cinematicShell__overlay" />
      <div className="cinematicShell__content">{children}</div>
    </div>
  );
}
