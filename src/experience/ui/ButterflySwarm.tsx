import { useMemo } from "react";
import "./Butterfly.css";

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function Butterfly({ style }: { style: React.CSSProperties }) {
  return (
    <div className="butterfly-wrapper" style={style}>
      <div className="butterfly">
        <div className="wing">
          <div className="bit" />
          <div className="bit" />
        </div>
        <div className="wing">
          <div className="bit" />
          <div className="bit" />
        </div>
      </div>
      <div className="shadow" />
    </div>
  );
}

// Spawn only on left edge (4–18vw) or right edge (82–96vw), mid-screen vertically (20–78vh).
// This keeps butterflies away from center UI, nav, inputs, and bottom controls.
function spawnX(): string {
  return Math.random() > 0.5 ? `${rand(4, 18)}vw` : `${rand(82, 96)}vw`;
}

export function ButterflySwarm() {
  const butterflies = useMemo(() => {
    const countOptions = [2, 2, 3, 3, 4];
    const count = countOptions[Math.floor(Math.random() * countOptions.length)];
    return Array.from({ length: count }, (_, i) => ({
      key: i,
      style: {
        "--bx": spawnX(),
        "--by": `${rand(20, 78)}vh`,
        "--bscale": rand(0.22, 0.45),
        "--bdur": `${rand(9, 16)}s`,
        "--bdelay": `${-rand(0, 8)}s`,
        // drift stays small so they don't wander into the center
        "--bdrift": `${(Math.random() > 0.5 ? 1 : -1) * rand(4, 10)}vw`,
      } as React.CSSProperties,
    }));
  }, []);

  return (
    <>
      {butterflies.map((b) => (
        <Butterfly key={b.key} style={b.style} />
      ))}
    </>
  );
}
