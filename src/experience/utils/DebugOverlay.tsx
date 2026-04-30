import { useState, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { Perf } from "r3f-perf";

// Comprehensive debug state for timeline and scene tracking
export const debugState = {
  // Timeline
  scrollProgress: 0,
  totalDuration: 0,
  currentTime: 0,
  
  // Scene
  activeScene: null as string | null,
  sceneStartTime: 0,
  sceneEndTime: 0,
  sceneProgress: 0,
  
  // Auto-play state
  isAutoPlaying: false,
  waitingForScroll: false,
  canScrollBack: false, // Whether user can scroll back to previous scene
  
  // Chapter info
  currentPart: 1,
  currentChapter: 1,
  
  // Audio/VO
  voPlaying: false,
  voCurrentTime: 0,
  voDuration: 0,
  voStartedAt: 0,
  audioGroup: null as string | null,
  
  // Scene position (from CSS variables)
  sceneX: 0,
  sceneY: 0,
  
  // Camera (updated by CameraTracker)
  cameraPos: "[0, 0, 0]",
  cameraRot: "[0, 0, 0]",
  
  // All scene ranges for visualization
  sceneRanges: [] as Array<{
    sceneId: string;
    start: number;
    end: number;
    audioUrl?: string | null;
  }>,
};

// R3F component that goes inside Canvas - only handles Perf and camera tracking
export function DebugOverlay({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;

  return (
    <>
      <Perf position="top-left" />
      <CameraTracker />
    </>
  );
}

// This component tracks camera and updates debugState (no DOM rendering)
function CameraTracker() {
  const { camera } = useThree();

  useFrame(() => {
    debugState.cameraPos = `[${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}]`;
    debugState.cameraRot = `[${camera.rotation.x.toFixed(2)}, ${camera.rotation.y.toFixed(2)}, ${camera.rotation.z.toFixed(2)}]`;
  });

  return null;
}

// DOM component that goes OUTSIDE Canvas - renders the debug panel
export function DebugPanel({ enabled }: { enabled: boolean }) {
  const [data, setData] = useState({
    pos: "",
    rot: "",
    progress: 0,
    currentTime: 0,
    totalDuration: 0,
    scene: "",
    sceneProgress: 0,
    sceneStart: 0,
    sceneEnd: 0,
    sceneX: 0,
    sceneY: 0,
    voPlaying: false,
    voCurrentTime: 0,
    voDuration: 0,
    audioGroup: "",
    part: 1,
    chapter: 1,
    sceneRanges: [] as typeof debugState.sceneRanges,
  });

  // Poll debugState using requestAnimationFrame
  useEffect(() => {
    if (!enabled) return;

    let rafId: number;
    const update = () => {
      setData({
        pos: debugState.cameraPos,
        rot: debugState.cameraRot,
        progress: debugState.scrollProgress,
        currentTime: debugState.currentTime,
        totalDuration: debugState.totalDuration,
        scene: debugState.activeScene ?? "—",
        sceneProgress: debugState.sceneProgress,
        sceneStart: debugState.sceneStartTime,
        sceneEnd: debugState.sceneEndTime,
        sceneX: debugState.sceneX,
        sceneY: debugState.sceneY,
        voPlaying: debugState.voPlaying,
        voCurrentTime: debugState.voCurrentTime,
        voDuration: debugState.voDuration,
        audioGroup: debugState.audioGroup ?? "—",
        part: debugState.currentPart,
        chapter: debugState.currentChapter,
        sceneRanges: debugState.sceneRanges,
      });
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(rafId);
  }, [enabled]);

  if (!enabled) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
  };

  return (
    <div
      style={{
        position: "fixed",
        top: "10px",
        right: "10px",
        background: "rgba(0,0,0,0.92)",
        padding: "14px",
        borderRadius: "8px",
        zIndex: 9999,
        border: "1px solid #00ff00",
        color: "#00ff00",
        fontFamily: "monospace",
        fontSize: "11px",
        minWidth: "320px",
        maxHeight: "90vh",
        overflowY: "auto",
        pointerEvents: "auto",
      }}
    >
      {/* Header */}
      <div style={{ 
        marginBottom: "10px", 
        paddingBottom: "8px", 
        borderBottom: "2px solid #00ff00",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <strong style={{ fontSize: "13px" }}>🎬 DEBUG PANEL</strong>
        <span style={{ opacity: 0.7 }}>Part {data.part} / Ch {data.chapter}</span>
      </div>

      {/* Timeline Section */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ marginBottom: "6px", color: "#ffff00" }}><strong>⏱️ TIMELINE</strong></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          <div><span style={{ opacity: 0.7 }}>Progress:</span> {(data.progress * 100).toFixed(1)}%</div>
          <div><span style={{ opacity: 0.7 }}>Time:</span> {formatTime(data.currentTime)}</div>
          <div><span style={{ opacity: 0.7 }}>Total:</span> {formatTime(data.totalDuration)}</div>
          <div><span style={{ opacity: 0.7 }}>Remaining:</span> {formatTime(data.totalDuration - data.currentTime)}</div>
        </div>
        {/* Progress bar */}
        <div style={{ 
          marginTop: "8px", 
          background: "#00ff0022", 
          height: "8px", 
          borderRadius: "4px",
          overflow: "hidden",
          position: "relative"
        }}>
          {/* Scene markers */}
          {data.sceneRanges.map((range) => (
            <div
              key={range.sceneId}
              style={{
                position: "absolute",
                left: `${(range.start / data.totalDuration) * 100}%`,
                top: 0,
                width: "1px",
                height: "100%",
                background: "#ffffff44",
              }}
              title={`${range.sceneId}: ${formatTime(range.start)}`}
            />
          ))}
          <div style={{
            width: `${data.progress * 100}%`,
            height: "100%",
            background: "#00ff00",
            transition: "width 0.1s ease-out",
          }} />
        </div>
      </div>

      {/* Active Scene Section */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ marginBottom: "6px", color: "#00ffff" }}><strong>🎭 ACTIVE SCENE</strong></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          <div><span style={{ opacity: 0.7 }}>Scene:</span> <strong>{data.scene}</strong></div>
          <div><span style={{ opacity: 0.7 }}>Progress:</span> {(data.sceneProgress * 100).toFixed(0)}%</div>
          <div><span style={{ opacity: 0.7 }}>Start:</span> {formatTime(data.sceneStart)}</div>
          <div><span style={{ opacity: 0.7 }}>End:</span> {formatTime(data.sceneEnd)}</div>
        </div>
        {/* Scene progress bar */}
        <div style={{ 
          marginTop: "6px", 
          background: "#00ffff22", 
          height: "4px", 
          borderRadius: "2px",
          overflow: "hidden"
        }}>
          <div style={{
            width: `${data.sceneProgress * 100}%`,
            height: "100%",
            background: "#00ffff",
            transition: "width 0.1s ease-out",
          }} />
        </div>
      </div>

      {/* Text Position Section */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ marginBottom: "6px", color: "#ff00ff" }}><strong>📐 TEXT POSITION</strong></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          <div><span style={{ opacity: 0.7 }}>X:</span> {data.sceneX}px</div>
          <div><span style={{ opacity: 0.7 }}>Y:</span> {data.sceneY}px</div>
        </div>
        <div style={{ marginTop: "4px", opacity: 0.6, fontSize: "10px" }}>
          Use arrow keys to adjust (Shift for larger steps)
        </div>
      </div>

      {/* Voice Over Section */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ marginBottom: "6px", color: "#ff9900" }}>
          <strong>🔊 VOICE OVER</strong>
          {data.voPlaying && <span style={{ marginLeft: "8px", color: "#00ff00" }}>● PLAYING</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
          <div><span style={{ opacity: 0.7 }}>Group:</span> {data.audioGroup}</div>
          <div><span style={{ opacity: 0.7 }}>Status:</span> {data.voPlaying ? "Playing" : "Stopped"}</div>
          <div><span style={{ opacity: 0.7 }}>Time:</span> {formatTime(data.voCurrentTime)}</div>
          <div><span style={{ opacity: 0.7 }}>Duration:</span> {formatTime(data.voDuration)}</div>
        </div>
        {data.voDuration > 0 && (
          <div style={{ 
            marginTop: "6px", 
            background: "#ff990022", 
            height: "4px", 
            borderRadius: "2px",
            overflow: "hidden"
          }}>
            <div style={{
              width: `${(data.voCurrentTime / data.voDuration) * 100}%`,
              height: "100%",
              background: "#ff9900",
              transition: "width 0.1s ease-out",
            }} />
          </div>
        )}
      </div>

      {/* Camera Section */}
      <div style={{ marginBottom: "12px" }}>
        <div style={{ marginBottom: "6px", color: "#ff6666" }}><strong>📍 CAMERA</strong></div>
        <div><span style={{ opacity: 0.7 }}>POS:</span> {data.pos}</div>
        <div><span style={{ opacity: 0.7 }}>ROT:</span> {data.rot}</div>
      </div>

      {/* Scene List */}
      <div>
        <div style={{ marginBottom: "6px", color: "#aaaaaa" }}><strong>📋 SCENE LIST</strong></div>
        <div style={{ fontSize: "10px", maxHeight: "100px", overflowY: "auto" }}>
          {data.sceneRanges.map((range) => (
            <div 
              key={range.sceneId}
              style={{ 
                padding: "2px 4px",
                marginBottom: "2px",
                background: data.scene === range.sceneId ? "#00ff0033" : "transparent",
                borderRadius: "2px",
                display: "flex",
                justifyContent: "space-between"
              }}
            >
              <span style={{ color: data.scene === range.sceneId ? "#00ff00" : "#888" }}>
                {range.sceneId}
              </span>
              <span style={{ opacity: 0.6 }}>
                {formatTime(range.start)} - {formatTime(range.end)}
                {range.audioUrl && " 🔊"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Keyboard shortcuts */}
      <div style={{ 
        marginTop: "12px", 
        paddingTop: "8px", 
        borderTop: "1px solid #00ff0044",
        fontSize: "10px",
        opacity: 0.6
      }}>
        <div><strong>Shortcuts:</strong> Q = Toggle Debug | T = Log Position | Arrows = Move Text</div>
      </div>
    </div>
  );
}
