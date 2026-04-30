import { useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { SCENE_FONT_FAMILY } from "../shared/sceneTypography";
import { scene12 } from "./scenes/scene-12/content";
import "./Scene12.css";

type Scene12Props = {
  onComplete: () => void;
};

type Scene12OverlayProps = {
  lines: NonNullable<typeof scene12.lines>;
  isVisible: boolean;
  buttonReady: boolean;
  buttonDelay: number;
  onComplete: () => void;
};

function Scene12Overlay({
  lines,
  isVisible,
  buttonReady,
  buttonDelay,
  onComplete,
}: Scene12OverlayProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at center, rgba(0,0,0,0.16), rgba(0,0,0,0.52) 72%)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: "min(52rem, calc(100vw - 3rem))",
          padding: "2rem 1.5rem",
        }}
      >
        <h2
          className="s12-title"
          style={{
            fontFamily: SCENE_FONT_FAMILY,
            fontSize: "clamp(2.2rem, 6vw, 4.8rem)",
            fontWeight: 400,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "rgba(245,238,231,0.94)",
            textShadow: "0 12px 40px rgba(0,0,0,0.42)",
            margin: "0 0 2rem",
            opacity: 1,
            transform: isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 18px, 0)",
            transition: "opacity 1100ms ease, transform 1100ms ease",
            transitionDelay: "0.6s",
          }}
        >
          {scene12.title}
        </h2>
        {lines.map((line, i) => (
          <p
            key={i}
            className="s12-line"
            style={{
              fontFamily: SCENE_FONT_FAMILY,
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              lineHeight: 1.9,
              letterSpacing: "0.02em",
              color: "rgba(245,238,231,0.74)",
              margin: "0 auto",
              maxWidth: "42rem",
              opacity: 1,
              transform: isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 14px, 0)",
              transition: "opacity 900ms ease, transform 900ms ease",
              transitionDelay: `${1.4 + i * 0.72}s`,
            }}
          >
            {line.text}
          </p>
        ))}
        <HoverBorderGradient
          as="button"
          type="button"
          disabled={!buttonReady}
          onClick={onComplete}
          containerClassName={`scene12ContinueButton${buttonReady ? " isReady" : ""}`}
          className="scene12ContinueButton__inner"
          style={{
            opacity: buttonReady ? 1 : 0.35,
            pointerEvents: buttonReady ? "auto" : "none",
            transform: isVisible ? "translate3d(0, 0, 0)" : "translate3d(0, 10px, 0)",
            transition: "opacity 800ms ease, transform 800ms ease",
            transitionDelay: `${buttonDelay}s, ${buttonDelay}s`,
          }}
        >
          Continue
        </HoverBorderGradient>
      </div>
    </div>
  );
}

export function Scene12({ onComplete }: Scene12Props) {
  const lines = scene12.lines ?? [];
  const [isVisible, setIsVisible] = useState(false);
  const [buttonReady, setButtonReady] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<{ host: HTMLDivElement; root: Root } | null>(null);
  const buttonDelay = useMemo(() => 1.4 + Math.max(0, lines.length - 1) * 0.72 + 1.2, [lines.length]);
  const buttonFadeDuration = 0.8;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.dataset.showcaseScene12 = "true";
    host.style.position = "fixed";
    host.style.inset = "0";
    host.style.zIndex = "2400";
    host.style.pointerEvents = "auto";
    document.body.appendChild(host);
    const root = createRoot(host);
    setOverlayRoot({ host, root });

    return () => {
      root.unmount();
      host.remove();
    };
  }, []);

  useEffect(() => {
    const revealFrame = window.requestAnimationFrame(() => setIsVisible(true));
    const buttonTimer = window.setTimeout(
      () => setButtonReady(true),
      (buttonDelay + buttonFadeDuration) * 1000
    );

    return () => {
      window.cancelAnimationFrame(revealFrame);
      window.clearTimeout(buttonTimer);
    };
  }, [buttonDelay]);

  useEffect(() => {
    if (!overlayRoot) {
      return;
    }

    overlayRoot.root.render(
      <Scene12Overlay
        lines={lines}
        isVisible={isVisible}
        buttonReady={buttonReady}
        buttonDelay={buttonDelay}
        onComplete={onComplete}
      />
    );
  }, [buttonDelay, buttonReady, isVisible, lines, onComplete, overlayRoot]);

  return null;
}
