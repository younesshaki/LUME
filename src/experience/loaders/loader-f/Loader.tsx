import type { LoaderComponentProps } from "../shared/types";
import { LoaderShell } from "../shared/LoaderShell";
import batVideoUrl from "./media/Bat - Halloween.webm?url";
import "./styles.css";

export function Loader({ className, text }: LoaderComponentProps) {
  return (
    <LoaderShell className={`loader-variant-f${className ? ` ${className}` : ""}`}>
      <video
        className="loader-video"
        src={batVideoUrl}
        autoPlay
        loop
        muted
        playsInline
      />
      <div className="loading-text">{text}</div>
    </LoaderShell>
  );
}
