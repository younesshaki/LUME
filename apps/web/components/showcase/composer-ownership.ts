"use client";
import type { EffectComposer } from "postprocessing";

/** react-postprocessing 3.0.4 removes passes on React teardown but does not
 * dispose its composer. Snapshot passes at attachment so detach order cannot
 * hide an EffectPass (and its BloomEffect targets) from the owner.
 */
export function ownComposer(composer: EffectComposer) {
  const passes = [...composer.passes];
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    for (const pass of passes)
      if (!composer.passes.includes(pass)) pass.dispose();
    composer.dispose();
  };
}

/** Lives alongside the renderer, not a global cache. A late child attachment
 * after scene closure is immediately released. Reduced-motion detach releases
 * the current lease while allowing a new one when motion is re-enabled.
 */
export function createEffectsOwner() {
  let current: (() => void) | null = null,
    closed = false;
  return {
    hold(dispose: () => void) {
      if (closed) {
        dispose();
        return () => {};
      }
      current?.();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (current === release) current = null;
        dispose();
      };
      current = release;
      return release;
    },
    close() {
      closed = true;
      current?.();
    },
  };
}
export type EffectsOwner = ReturnType<typeof createEffectsOwner>;
