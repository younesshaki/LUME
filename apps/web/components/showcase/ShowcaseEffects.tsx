"use client";
import { memo, useCallback, useRef } from "react";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { EffectComposer as Composer } from "postprocessing";
import { HalfFloatType } from "three";
import { ownComposer, type EffectsOwner } from "./composer-ownership";

/** A deliberately small new bloom treatment: Vite has the dependencies but no
 * active composer to copy. No animated noise/glitch, normal/depth pass or MSAA.
 * This entire subtree is absent under reduced motion, not merely paused.
 */
export default memo(function ShowcaseEffects({
  owner,
}: {
  owner: EffectsOwner;
}) {
  const release = useRef<(() => void) | null>(null);
  const attach = useCallback(
    (composer: Composer | null) => {
      release.current?.();
      release.current = composer ? owner.hold(ownComposer(composer)) : null;
    },
    [owner],
  );
  return (
    <EffectComposer
      ref={attach}
      multisampling={0}
      depthBuffer={false}
      stencilBuffer={false}
      enableNormalPass={false}
      frameBufferType={HalfFloatType}
    >
      <Bloom
        intensity={0.25}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
        mipmapBlur
        levels={5}
        dispose={null}
      />
    </EffectComposer>
  );
});
