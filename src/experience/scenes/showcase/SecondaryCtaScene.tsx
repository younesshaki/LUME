import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SCENE_FONT_FAMILY } from "../shared/sceneTypography";
import "../shared/sceneFonts.css";

export const SECONDARY_CTA_LINES = [
  "Thank you for exploring LUME.",
  "A focused product path can be added here.",
  "The next step is ready when your brand is.",
];

const SECONDARY_CTA_FADE_OUT_DELAY_MS = 3600;
const SECONDARY_CTA_GO_HOME_DELAY_MS = 5000;

type SecondaryCtaSceneProps = {
  onDone: () => void;
};

type SecondaryCtaOverlayProps = {
  isLeaving: boolean;
};

function SecondaryCtaOverlay({ isLeaving }: SecondaryCtaOverlayProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.72)",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          textAlign: "center",
          maxWidth: "min(540px, calc(100vw - 3rem))",
          padding: "2rem",
          opacity: isLeaving ? 0 : 1,
          transform: isLeaving ? "translate3d(0, -12px, 0)" : "translate3d(0, 0, 0)",
          transition: "opacity 1000ms ease, transform 1000ms ease",
          animation: "secondaryCtaFadeIn 1000ms ease both",
        }}
      >
        {SECONDARY_CTA_LINES.map((line) => (
          <p
            key={line}
            style={{
              fontFamily: SCENE_FONT_FAMILY,
              fontSize: "clamp(1rem, 2vw, 1.2rem)",
              lineHeight: 1.9,
              letterSpacing: "0.03em",
              color: "rgba(245,238,231,0.78)",
              margin: "0 0 0.65rem",
            }}
          >
            {line}
          </p>
        ))}
        <style>
          {`
            @keyframes secondaryCtaFadeIn {
              from {
                opacity: 0;
                transform: translate3d(0, 16px, 0);
              }
              to {
                opacity: 1;
                transform: translate3d(0, 0, 0);
              }
            }
          `}
        </style>
      </div>
    </div>
  );
}

export function SecondaryCtaScene({ onDone }: SecondaryCtaSceneProps) {
  const [isLeaving, setIsLeaving] = useState(false);
  const [overlayRoot, setOverlayRoot] = useState<{ host: HTMLDivElement; root: Root } | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const host = document.createElement("div");
    host.dataset.showcaseSecondaryCta = "true";
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
    const fadeTimer = window.setTimeout(() => setIsLeaving(true), SECONDARY_CTA_FADE_OUT_DELAY_MS);
    const doneTimer = window.setTimeout(onDone, SECONDARY_CTA_GO_HOME_DELAY_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [onDone]);

  useEffect(() => {
    if (!overlayRoot) {
      return;
    }

    overlayRoot.root.render(<SecondaryCtaOverlay isLeaving={isLeaving} />);
  }, [isLeaving, overlayRoot]);

  return null;
}
