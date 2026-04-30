import { LoaderShell } from "../shared/LoaderShell";
import { BirdSvg } from "../shared/BirdSvg";
import type { LoaderComponentProps } from "../shared/types";
import "./styles.css";

export function Loader({ className, text }: LoaderComponentProps) {
  return (
    <LoaderShell className={`loader-variant-c${className ? ` ${className}` : ""}`}>
      <div className="wind-line wind-1" />
      <div className="wind-line wind-2" />
      <div className="wind-line wind-3" />
      <div className="wind-line wind-4" />
      <div className="cloud cloud-1" />
      <div className="cloud cloud-2" />
      <BirdSvg />
      <div className="loading-text">{text}</div>
    </LoaderShell>
  );
}
