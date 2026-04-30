import { useEffect, useRef } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Register ScrollTrigger plugin
gsap.registerPlugin(ScrollTrigger);

/**
 * Global Lenis instance for smooth scrolling.
 * This hook sets up Lenis and integrates it with GSAP ScrollTrigger.
 * 
 * Usage: Call once at the app root level (e.g., in Experience.tsx)
 */
export function useSmoothScroll(enabled: boolean = true) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Cleanup if disabled
      if (lenisRef.current) {
        lenisRef.current.destroy();
        lenisRef.current = null;
      }
      return;
    }

    // Create Lenis instance
    const lenis = new Lenis({
      duration: 1.2,           // Scroll animation duration
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // Ease out expo
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    lenisRef.current = lenis;

    // Sync Lenis with GSAP's ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    // Add Lenis's requestAnimationFrame to GSAP's ticker
    gsap.ticker.add((time) => {
      lenis.raf(time * 1000); // Convert to ms
    });

    // Disable GSAP's lag smoothing for better sync
    gsap.ticker.lagSmoothing(0);

    // Refresh ScrollTrigger after setup
    ScrollTrigger.refresh();

    return () => {
      lenis.destroy();
      lenisRef.current = null;
      gsap.ticker.remove(lenis.raf);
    };
  }, [enabled]);

  return lenisRef;
}

/**
 * Get the global Lenis instance (if needed for manual control)
 */
export function getLenisInstance(): Lenis | null {
  // This would need a global store in practice
  // For now, components can use the ref returned by useSmoothScroll
  return null;
}
