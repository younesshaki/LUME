interface FadeOverlayProps {
  opacity: number;
}

export default function FadeOverlay({ opacity }: FadeOverlayProps) {
  if (!Number.isFinite(opacity) || opacity <= 0.001) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "black",
        opacity: Math.max(0, Math.min(1, opacity)),
        pointerEvents: opacity > 0.01 ? "auto" : "none",
        zIndex: 2000,
        transition: "none",
      }}
      data-testid="fade-overlay"
    />
  );
}
