"use client";
import { memo, useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  BloomEffect,
  BlendFunction,
  EffectComposer,
  EffectPass,
  RenderPass,
  type Pass,
} from "postprocessing";
import { HalfFloatType, NoToneMapping } from "three";
import { ownComposer, type EffectsOwner } from "./composer-ownership";

/** Direct core imports avoid the React wrapper barrel's unused N8AO payload.
 * Same one-bloom treatment and renderer-local ownership; no dependency patch,
 * alias or import-boundary exception. Absent entirely under reduced motion.
 */
export default memo(function ShowcaseEffects({
  owner,
}: {
  owner: EffectsOwner;
}) {
  const { gl, scene, camera, size } = useThree();
  const active = useRef<EffectComposer | null>(null);
  useLayoutEffect(() => {
    const composer = new EffectComposer(gl, {
      multisampling: 0,
      depthBuffer: false,
      stencilBuffer: false,
      frameBufferType: HalfFloatType,
    });
    const passes: Pass[] = [];
    let bloom: BloomEffect | undefined, release: (() => void) | undefined;
    const toneMapping = gl.toneMapping;
    try {
      const render = new RenderPass(scene, camera);
      passes.push(render);
      composer.addPass(render);
      bloom = new BloomEffect({
        intensity: 0.25,
        luminanceThreshold: 0.85,
        luminanceSmoothing: 0.2,
        mipmapBlur: true,
        levels: 5,
        blendFunction: BlendFunction.ADD,
      });
      const effects = new EffectPass(camera, bloom);
      passes.push(effects);
      composer.addPass(effects);
      release = owner.hold(ownComposer(composer));
      active.current = composer;
      gl.toneMapping = NoToneMapping;
    } catch (error) {
      // An initialization failure must release passes not yet added, too.
      for (const pass of passes)
        if (!composer.passes.includes(pass)) pass.dispose();
      if (bloom && passes.length < 2) bloom.dispose();
      composer.dispose();
      throw error;
    }
    return () => {
      active.current = null;
      release?.();
      gl.toneMapping = toneMapping;
    };
  }, [gl, scene, camera, owner]);
  useLayoutEffect(() => {
    active.current?.setSize(size.width, size.height);
  }, [size.width, size.height]);
  useFrame((_, delta) => {
    if (!active.current) return;
    const autoClear = gl.autoClear;
    try {
      gl.autoClear = true;
      active.current.render(delta);
    } finally {
      gl.autoClear = autoClear;
    }
  }, 1);
  return null;
});
