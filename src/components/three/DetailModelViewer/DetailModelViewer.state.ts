import { useEffect } from "react";
import { useUIStore } from "@/lib/ui-state";
import type { DetailModel3D } from "./modelTypes";

export function useDetailModelViewerState(model: DetailModel3D) {
  const setModelViewer = useUIStore((state) => state.setModelViewer);

  useEffect(() => {
    setModelViewer({ active: true, modelSrc: model.modelSrc });
    return () => setModelViewer({ active: false, modelSrc: null });
  }, [model.modelSrc, setModelViewer]);
}
