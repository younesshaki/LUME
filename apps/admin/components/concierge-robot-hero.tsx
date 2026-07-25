"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Application } from "@splinetool/runtime";

import { useConciergeRobot } from "@/components/concierge-robot-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SplineScene } from "@/components/ui/spline-scene";
import { Spotlight } from "@/components/ui/spotlight";
import {
  CONCIERGE_SCENE_URL,
  frameHeadOnly,
  HERO_FRAMING,
  HERO_STAGE,
  trackPointer,
} from "@/lib/conciergeRobot";

/**
 * Dashboard hero: the concierge as a head that tracks the cursor.
 *
 * The Spline runtime and scene are several megabytes, so this is deliberately
 * conservative about when it loads at all — never on the server, never below
 * `md`, never under `prefers-reduced-motion`, and not until the card is
 * actually near the viewport.
 */
export function ConciergeRobotHero({ tenantSlug }: { tenantSlug: string }) {
  const { enabled } = useConciergeRobot();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const disposeTrackingRef = useRef<(() => void) | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [environmentAllows, setEnvironmentAllows] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wideEnough = window.matchMedia("(min-width: 768px)");
    const sync = () => setEnvironmentAllows(!reducedMotion.matches && wideEnough.matches);

    sync();
    reducedMotion.addEventListener("change", sync);
    wideEnough.addEventListener("change", sync);
    return () => {
      reducedMotion.removeEventListener("change", sync);
      wideEnough.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const showScene = enabled && nearViewport && environmentAllows;

  const handleLoad = useCallback((app: Application) => {
    frameHeadOnly(app, HERO_FRAMING);
    disposeTrackingRef.current?.();
    if (stageRef.current) disposeTrackingRef.current = trackPointer(app, stageRef.current);
  }, []);

  useEffect(() => () => disposeTrackingRef.current?.(), []);

  return (
    <Card
      ref={containerRef}
      className="relative isolate h-[260px] gap-0 overflow-hidden border-0 bg-neutral-950 p-0 ring-white/10"
    >
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="white" />

      <div className="flex size-full">
        <div className="relative z-10 flex flex-1 flex-col justify-center gap-3 p-8">
          <h2 className="bg-gradient-to-b from-neutral-50 to-neutral-400 bg-clip-text text-3xl font-bold text-transparent md:text-4xl">
            Your AI concierge
          </h2>
          <p className="max-w-md text-sm text-neutral-300">
            Always on, and answering questions about your inventory the moment a
            visitor lands on your site.
          </p>
          <div>
            <Button asChild variant="secondary" size="sm" className="mt-1">
              <Link href={`/admin/${tenantSlug}/persona`}>
                Tune your concierge
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>

        {/* Decorative: the head conveys nothing the copy doesn't already say. */}
        <div className="relative hidden flex-1 overflow-hidden md:block" aria-hidden="true">
          {showScene ? (
            <div
              ref={stageRef}
              className="absolute left-1/2 top-0 -translate-x-1/2"
              style={{ width: HERO_STAGE.width, height: HERO_STAGE.height }}
            >
              <SplineScene scene={CONCIERGE_SCENE_URL} className="size-full" onLoad={handleLoad} />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-32 rounded-full bg-gradient-to-b from-white/15 to-transparent blur-2xl" />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
