import { Html } from "@react-three/drei";
import type { CSSProperties, MutableRefObject, ReactNode, RefObject } from "react";
import type { NarrativeLine, NarrativeScene } from "./narrativeTypes";
import GradientText from "./GradientText";
import "./NarrativeBase.css";

function renderLine(line: NarrativeLine): ReactNode {
  if (!line.highlights?.length) return line.text;

  const parts: ReactNode[] = [];
  let remaining = line.text;

  for (const phrase of line.highlights) {
    const idx = remaining.indexOf(phrase);
    if (idx === -1) continue;
    if (idx > 0) parts.push(remaining.slice(0, idx));
    parts.push(<GradientText key={phrase}>{phrase}</GradientText>);
    remaining = remaining.slice(idx + phrase.length);
  }
  if (remaining) parts.push(remaining);

  return <>{parts}</>;
}

type NarrativeOverlayProps = {
  isActive: boolean;
  overlayRef: RefObject<HTMLDivElement>;
  scenes: NarrativeScene[];
  overlayClassName: string;
  sceneClassName: string;
  titleClassName?: string;
  lineClassName?: string;
};

export function NarrativeOverlay({
  isActive,
  overlayRef,
  scenes,
  overlayClassName,
  sceneClassName,
  titleClassName,
  lineClassName,
}: NarrativeOverlayProps) {
  const titleClass = `narrativeTitle${titleClassName ? ` ${titleClassName}` : ""}`;
  const lineClass = `narrativeLine${lineClassName ? ` ${lineClassName}` : ""}`;
  const portalRef =
    typeof document === "undefined"
      ? undefined
      : ({ current: document.body } as MutableRefObject<HTMLElement>);

  return (
    <Html
      fullscreen
      portal={portalRef}
      style={{
        pointerEvents: "none",
        zIndex: 500,
      }}
    >
      <div 
        ref={overlayRef} 
        className={`${overlayClassName} narrativeOverlay`}
        style={{
          opacity: (!isActive || scenes.length === 0) ? 0 : 1,
          visibility: (!isActive || scenes.length === 0) ? 'hidden' : 'visible',
        }}
      >
        {scenes.map((scene) => (
          <section
            key={scene.id}
            className={`${sceneClassName} narrativeScene ${scene.id}`}
            data-voiceover={scene.voiceOver ?? undefined}
            data-voiceover-start={
              scene.voiceOverStartOffset !== undefined
                ? String(scene.voiceOverStartOffset)
                : undefined
            }
            data-voiceover-end={
              scene.voiceOverEndOffset !== undefined
                ? String(scene.voiceOverEndOffset)
                : undefined
            }
            style={
              {
                "--scene-x": `${scene.position?.x ?? 0}px`,
                "--scene-y": `${scene.position?.y ?? 0}px`,
                "--scene-align": scene.position?.align ?? "center",
              } as CSSProperties
            }
          >
            <div className="narrativeSceneInner">
              <div className={titleClass}>{scene.title}</div>
              {"columns" in scene && scene.columns ? (
                <>
                  <div className="sceneColumns">
                    <div className="sceneColumn column-left">
                      {scene.columns.left.map((line, index) => (
                        <p
                          key={`left-${index}`}
                          className={`${lineClass}${line.className ? ` ${line.className}` : ""}`}
                        >
                          {renderLine(line)}
                        </p>
                      ))}
                    </div>
                    <div className="sceneColumn column-right">
                      {scene.columns.right.map((line, index) => (
                        <p
                          key={`right-${index}`}
                          className={`${lineClass}${line.className ? ` ${line.className}` : ""}`}
                        >
                          {renderLine(line)}
                        </p>
                      ))}
                    </div>
                  </div>
                  {(scene.mergeLines ?? []).map((line, index) => (
                    <p
                      key={`merge-${index}`}
                      className={`${lineClass}${line.className ? ` ${line.className}` : ""}`}
                    >
                      {renderLine(line)}
                    </p>
                  ))}
                </>
              ) : (
                scene.lines.map((line, index) => (
                  <p
                    key={index}
                    className={`${lineClass}${line.className ? ` ${line.className}` : ""}`}
                    data-start-time={line.startTime !== undefined ? String(line.startTime) : undefined}
                    data-end-time={line.endTime !== undefined ? String(line.endTime) : undefined}
                  >
                    {renderLine(line)}
                  </p>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </Html>
  );
}
