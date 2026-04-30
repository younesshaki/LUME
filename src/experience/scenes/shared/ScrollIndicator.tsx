import { useEffect, useState } from "react";
import { debugState } from "../../utils/DebugOverlay";
import { SCENE_FONT_FAMILY } from "./sceneTypography";

export function ScrollIndicator() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId: number;
    const checkState = () => {
      setVisible(debugState.waitingForScroll);
      rafId = requestAnimationFrame(checkState);
    };
    rafId = requestAnimationFrame(checkState);
    return () => cancelAnimationFrame(rafId);
  }, []);

  if (!visible) return null;

  return (
    <>
      <div
        style={{
          position: "fixed",
          bottom: "120px",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "12px",
          zIndex: 1000,
          pointerEvents: "none",
          animation: "scrollIndicatorFadeInUp 0.8s ease-out",
        }}
      >
        <span
          style={{
            color: "rgba(255, 255, 255, 0.95)",
            fontSize: "13px",
            fontFamily: SCENE_FONT_FAMILY,
            fontWeight: 400,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            textShadow: "0 0 20px rgba(255,255,255,0.6), 0 2px 10px rgba(0,0,0,0.8)",
            animation: "scrollTextPulse 2.4s ease-in-out infinite",
          }}
        >
          Scroll to continue
        </span>
        <div
          style={{
            width: "26px",
            height: "42px",
            border: "2px solid rgba(255, 255, 255, 0.9)",
            borderRadius: "13px",
            position: "relative",
            boxShadow:
              "0 0 12px rgba(255,255,255,0.5), 0 0 30px rgba(255,255,255,0.2), inset 0 0 8px rgba(255,255,255,0.1)",
            animation: "scrollMouseGlow 2.4s ease-in-out infinite",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "7px",
              left: "50%",
              width: "4px",
              height: "9px",
              backgroundColor: "rgba(255, 255, 255, 1)",
              borderRadius: "2px",
              transform: "translateX(-50%)",
              boxShadow: "0 0 8px rgba(255,255,255,0.9)",
              animation: "scrollDotBounce 2.4s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes scrollIndicatorFadeInUp {
          from { opacity: 0; transform: translateX(-50%) translateY(24px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes scrollDotBounce {
          0%   { top: 7px;  opacity: 1; }
          50%  { top: 22px; opacity: 0.4; }
          100% { top: 7px;  opacity: 1; }
        }
        @keyframes scrollMouseGlow {
          0%, 100% {
            box-shadow: 0 0 10px rgba(255,255,255,0.45),
                        0 0 28px rgba(255,255,255,0.18),
                        inset 0 0 6px rgba(255,255,255,0.08);
          }
          50% {
            box-shadow: 0 0 22px rgba(255,255,255,0.85),
                        0 0 55px rgba(255,255,255,0.45),
                        inset 0 0 14px rgba(255,255,255,0.2);
          }
        }
        @keyframes scrollTextPulse {
          0%, 100% { opacity: 0.75; text-shadow: 0 0 12px rgba(255,255,255,0.35), 0 2px 10px rgba(0,0,0,0.8); }
          50%       { opacity: 1;    text-shadow: 0 0 28px rgba(255,255,255,0.8),  0 2px 10px rgba(0,0,0,0.8); }
        }
      `}</style>
    </>
  );
}
