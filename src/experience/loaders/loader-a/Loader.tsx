import { LoaderShell } from "../shared/LoaderShell";
import { BirdSvg } from "../shared/BirdSvg";
import type { LoaderComponentProps } from "../shared/types";
import "./styles.css";

export function Loader({ className, text }: LoaderComponentProps) {
  return (
    <LoaderShell className={`loader-variant-a${className ? ` ${className}` : ""}`}>
      <div className="wind-line wind-1" />
      <div className="wind-line wind-2" />
      <div className="wind-line wind-3" />
      <div className="wind-line wind-4" />
      <div className="sun" />
      <div className="sunbeam sunbeam-1" />
      <div className="sunbeam sunbeam-2" />
      <div className="sunbeam sunbeam-3" />
      <div className="sunbeam sunbeam-4" />
      <div className="flower flower-1">
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="center" />
      </div>
      <div className="flower flower-2">
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="center" />
      </div>
      <div className="flower flower-3">
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="petal" />
        <span className="center" />
      </div>
      <div className="cloud cloud-1" />
      <div className="cloud cloud-2" />
      <BirdSvg />
      <div className="loading-text">{text}</div>
    </LoaderShell>
  );
}
