import { Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import type { DetailModel3D } from "./modelTypes";
import ModelStage from "./ModelStage";
import ModelAsset from "./ModelAsset";
import "./DetailModelViewer.css";

type DetailModelViewerProps = {
  model: DetailModel3D;
  fallbackImageSrc?: string;
  title: string;
  className?: string;
};

function ModelError({ fallbackImageSrc, title }: { fallbackImageSrc?: string; title: string }) {
  if (fallbackImageSrc) {
    return <img src={fallbackImageSrc} alt={title} className="detailModelViewer__fallback" />;
  }
  return <div className="detailModelViewer__errorState">3D model unavailable</div>;
}

type CanvasContentProps = {
  model: DetailModel3D;
  cameraTarget: [number, number, number];
  onReady: () => void;
  onTarget: (target: [number, number, number]) => void;
};

function CanvasContent({ model, cameraTarget, onReady, onTarget }: CanvasContentProps) {
  return (
    <ModelStage lighting={model.lighting} autoRotate={model.autoRotate} cameraTarget={cameraTarget}>
      <ModelAsset model={model} onReady={onReady} onTarget={onTarget} />
    </ModelStage>
  );
}

export default function DetailModelViewer({ model, fallbackImageSrc, title, className }: DetailModelViewerProps) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<[number, number, number]>([0, 0, 0]);

  const handleReady = useCallback(() => setReady(true), []);
  const handleTarget = useCallback((t: [number, number, number]) => setCameraTarget(t), []);

  if (failed) {
    return (
      <div className={`detailModelViewer ${className ?? ""}`}>
        <ModelError fallbackImageSrc={fallbackImageSrc} title={title} />
      </div>
    );
  }

  return (
    <div className={`detailModelViewer ${className ?? ""}`}>
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
      >
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          onError={() => setFailed(true)}
        >
          <Suspense fallback={null}>
            <CanvasContent
              model={model}
              cameraTarget={cameraTarget}
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
