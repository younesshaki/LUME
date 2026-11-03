"use client";
import { Sparkles } from "@react-three/drei";
import type { OwnedModel } from "./model-resource";
/** Only the opening showcase scene: original sparkle settings + the existing
 * catalog product. The multi-scene director is deliberately left to 5b/5c. */
export default function OpeningScene({
  model,
  reduced,
}: {
  model: OwnedModel;
  reduced: boolean;
}) {
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[3, 5, 4]} intensity={4} />
      <directionalLight position={[-3, 1, -2]} intensity={2} color="#c48d7e" />
      <group scale={model.scale}>
        <primitive
          object={model.scene}
          position={model.center.clone().negate()}
          dispose={null}
        />
      </group>
      <Sparkles
        count={20}
        size={2.2}
        scale={[5, 3, 4]}
        speed={reduced ? 0 : 0.25}
        color="#c48d7e"
      />
    </>
  );
}
