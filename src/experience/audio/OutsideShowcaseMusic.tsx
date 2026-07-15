/**
 * Homepage/showcase ambient playback is intentionally disabled until LUME has
 * a real seamless, licensed ambient track. The previous placeholder was a
 * short woosh effect with `loop = true`, which replayed by itself every few
 * seconds and sounded like a stuck UI sound.
 *
 * Keep the component boundary in place so a future ambient implementation can
 * be restored without changing the application shell.
 */
export function OutsideShowcaseMusic(_props: { enabled: boolean }) {
  return null;
}
