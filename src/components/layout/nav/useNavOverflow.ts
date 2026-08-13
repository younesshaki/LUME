import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { computeNavOverflow, type NavOverflowResult } from "./navOverflow";

const GAP_PX = 32; // matches gap-8 on the nav track

/**
 * Measure the nav track and decide how many items render inline.
 *
 * Measurement strategy: render every item in a hidden, non-interactive probe
 * row so natural widths are always available, then render only the visible
 * slice for real. Measuring the *live* row instead would be circular — items
 * hidden by a previous pass have no width, so the nav could never re-expand
 * when the viewport grows.
 */
export function useNavOverflow(itemCount: number): {
  trackRef: React.RefObject<HTMLDivElement>;
  probeRef: React.RefObject<HTMLDivElement>;
  triggerRef: React.RefObject<HTMLButtonElement>;
  result: NavOverflowResult;
} {
  const trackRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<NavOverflowResult>({
    visibleCount: itemCount,
    hasOverflow: false,
  });

  const measure = useCallback(() => {
    const track = trackRef.current;
    const probe = probeRef.current;
    if (!track || !probe) return;

    const itemWidths = Array.from(probe.children).map(
      (child) => (child as HTMLElement).getBoundingClientRect().width,
    );
    const next = computeNavOverflow({
      containerWidth: track.getBoundingClientRect().width,
      itemWidths,
      moreTriggerWidth: triggerRef.current?.getBoundingClientRect().width ?? 72,
      gap: GAP_PX,
    });
    // Only commit real changes; setState on every resize frame would thrash.
    setResult((previous) =>
      previous.visibleCount === next.visibleCount && previous.hasOverflow === next.hasOverflow
        ? previous
        : next,
    );
  }, []);

  useLayoutEffect(measure, [measure, itemCount]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      // jsdom and very old browsers: fall back to window resize. The pure
      // function still guards the unmeasured case, so the nav stays usable.
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    if (probeRef.current) observer.observe(probeRef.current);
    return () => observer.disconnect();
  }, [measure]);

  // Web fonts land after first paint and change every item's width.
  useEffect(() => {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!fonts?.ready) return;
    let cancelled = false;
    void fonts.ready.then(() => {
      if (!cancelled) measure();
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);

  return { trackRef, probeRef, triggerRef, result };
}
