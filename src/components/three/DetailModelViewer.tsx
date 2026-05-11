import { Suspense, useState } from "react";
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

function CanvasContent({ model }: { model: DetailModel3D }) {
  return (
    <ModelStage lighting={model.lighting} autoRotate={model.autoRotate}>
      <ModelAsset model={model} />
    </ModelStage>
  );
}

export default function DetailModelViewer({ model, fallbackImageSrc, title, className }: DetailModelViewerProps) {
  const [failed, setFailed] = useState(false);
  const cameraPos = model.camera?.position ?? [0, 0.4, 4];
  const cameraFov = model.camera?.fov ?? 38;

  if (failed) {
    return (
      <div className={`detailModelViewer ${className ?? ""}`}>
        <ModelError fallbackImageSrc={fallbackImageSrc} title={title} />
      </div>
    );
  }

  return (
    <div className={`detailModelViewer ${className ?? ""}`}>
      <Canvas
        camera={{ position: cameraPos, fov: cameraFov }}
        gl={{ antialias: true, alpha: true }}
        onError={() => setFailed(true)}
      >
        <Suspense fallback={null}>
          <CanvasContent model={model} />
        </Suspense>
      </Canvas>

      {model.tagLabel && (
        <span className="detailModelViewer__badge">{model.tagLabel}</span>
      )}
    </div>
  );
}
