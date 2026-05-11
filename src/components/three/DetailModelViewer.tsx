import { Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  ScrollVelocityContainer,
  ScrollVelocityRow,
} from "@/components/ui/scroll-based-velocity";
import { StripedPattern } from "@/components/magicui/striped-pattern";
import type { DetailModel3D } from "./modelTypes";
import ModelStage from "./ModelStage";
import ModelAsset, { type ModelTargetInfo } from "./ModelAsset";
import "./DetailModelViewer.css";

type DetailModelViewerProps = {
  model: DetailModel3D;
  fallbackImageSrc?: string;
  title: string;
  className?: string;
};

const DEFAULT_TARGET_INFO: ModelTargetInfo = {
  target: [0, 0, 0],
  cameraPosition: [0, 0, 5],
};

function ModelError({ fallbackImageSrc, title }: { fallbackImageSrc?: string; title: string }) {
  if (fallbackImageSrc) {
    return <img src={fallbackImageSrc} alt={title} className="detailModelViewer__fallback" />;
  }
  return <div className="detailModelViewer__errorState">3D model unavailable</div>;
}

type CanvasContentProps = {
  model: DetailModel3D;
  targetInfo: ModelTargetInfo;
  cursorInCanvas: boolean;
  onReady: () => void;
  onTarget: (info: ModelTargetInfo) => void;
};

function CanvasContent({ model, targetInfo, cursorInCanvas, onReady, onTarget }: CanvasContentProps) {
  return (
    <ModelStage lighting={model.lighting} autoRotate={model.autoRotate} targetInfo={targetInfo} cursorInCanvas={cursorInCanvas}>
      <ModelAsset model={model} onReady={onReady} onTarget={onTarget} />
    </ModelStage>
  );
}

export default function DetailModelViewer({ model, fallbackImageSrc, title, className }: DetailModelViewerProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [targetInfo, setTargetInfo] = useState<ModelTargetInfo>(DEFAULT_TARGET_INFO);
  const [cursorInCanvas, setCursorInCanvas] = useState(false);

  const handleReady = useCallback(() => setReady(true), []);
  const handleTarget = useCallback((info: ModelTargetInfo) => setTargetInfo(info), []);

  if (failed) {
    return (
      <div className={`detailModelViewer ${className ?? ""}`}>
        <ModelError fallbackImageSrc={fallbackImageSrc} title={title} />
      </div>
    );
  }

  return (
    <div className={`detailModelViewer ${className ?? ""}`}>
      {model.backdropText && (
        <div
          className="detailModelViewer__backdrop"
          style={{ opacity: cursorInCanvas ? 0 : 1, transition: "opacity 0.6s ease" }}
        >
          <StripedPattern
            className="detailModelViewer__stripes"
            direction="right"
            width={18}
            height={18}
          />
          <ScrollVelocityContainer className="detailModelViewer__velocityContainer">
            {Array.from({ length: 10 }, (_, i) => (
              <ScrollVelocityRow
                key={i}
                baseVelocity={0.1}
                direction={i % 2 === 0 ? 1 : -1}
                className="detailModelViewer__velocityRow"
              >
                <span className="detailModelViewer__velocityText">
                  {model.backdropText}&nbsp;&nbsp;—&nbsp;&nbsp;
                </span>
              </ScrollVelocityRow>
            ))}
          </ScrollVelocityContainer>
        </div>
      )}

      {!ready && fallbackImageSrc && (
        <img
          src={fallbackImageSrc}
          alt={title}
          className="detailModelViewer__poster"
        />
      )}

      <div
        className="detailModelViewer__canvas"
        style={{ opacity: ready ? 1 : 0, transition: "opacity 0.25s ease" }}
        onMouseEnter={() => setCursorInCanvas(true)}
        onMouseLeave={() => setCursorInCanvas(false)}
      >
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          onError={() => setFailed(true)}
        >
          <Suspense fallback={null}>
            <CanvasContent
              model={model}
              targetInfo={targetInfo}
              cursorInCanvas={cursorInCanvas}
              onReady={handleReady}
              onTarget={handleTarget}
            />
          </Suspense>
        </Canvas>
      </div>

      {model.tagLabel && (
        <span className="detailModelViewer__badge">{model.tagLabel}</span>
      )}
    </div>
  );
}
