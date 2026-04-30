import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

type VideoSkyProps = {
  src: string;
  radius?: number;
  muted?: boolean;
  loop?: boolean;
  opacity?: number;
  opacityRef?: React.MutableRefObject<number>;
  fadeSpeed?: number;
};

export function VideoSky({
  src,
  radius = 500,
  muted = true,
  loop = true,
  opacity,
  opacityRef,
  fadeSpeed = 0.04,
}: VideoSkyProps) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const isPlayingRef = useRef(false);
  const currentOpacityRef = useRef(0);

  const video = useMemo(() => {
    const element = document.createElement("video");
    element.src = src;
    element.crossOrigin = "anonymous";
    element.loop = loop;
    element.muted = muted;
    element.playsInline = true;
    element.preload = "auto";
    return element;
  }, [loop, muted, src]);

  const texture = useMemo(() => {
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    return videoTexture;
  }, [video]);

  useFrame(() => {
    const nextOpacity =
      opacityRef?.current ?? (opacity !== undefined ? opacity : 1);
    const clampedOpacity = Math.min(Math.max(nextOpacity, 0), 1);
    const current = currentOpacityRef.current;

    // Skip work when opacity is settled (no visible change)
    if (Math.abs(clampedOpacity - current) < 0.001) return;

    const delta = clampedOpacity - current;
    const step = Math.min(Math.max(fadeSpeed, 0), 1);
    const updated = current + delta * step;
    currentOpacityRef.current = updated;

    if (materialRef.current) {
      materialRef.current.opacity = updated;
      materialRef.current.visible = updated > 0.01;
    }

    const shouldPlay = updated > 0.05;
    if (shouldPlay && !isPlayingRef.current) {
      const playPromise = video.play();
      if (playPromise?.catch) {
        playPromise.catch(() => {});
      }
      isPlayingRef.current = true;
    }
    if (!shouldPlay && isPlayingRef.current) {
      video.pause();
      video.currentTime = 0;
      isPlayingRef.current = false;
    }
  });

  useEffect(() => {
    return () => {
      video.pause();
      video.src = "";
      video.load();
      texture.dispose();
    };
  }, [texture, video]);

  return (
    <mesh renderOrder={-10}>
      <sphereGeometry args={[radius, 32, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        side={THREE.BackSide}
        transparent
        depthWrite={false}
        depthTest={false}
        opacity={opacity ?? 0}
      />
    </mesh>
  );
}
