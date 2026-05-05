import { memo, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { animate } from "motion/react";

interface GlowingEffectProps {
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  glow?: boolean;
  className?: string;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

const GlowingEffect = memo(({
  blur = 0,
  inactiveZone = 0.7,
  proximity = 0,
  spread = 20,
  glow = false,
  className,
  movementDuration = 2,
  borderWidth = 1,
  disabled = true,
}: GlowingEffectProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosition = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef<number>(0);

  const handleMove = useCallback(
    (e?: MouseEvent | { x: number; y: number }) => {
      if (!containerRef.current) return;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      animFrameRef.current = requestAnimationFrame(() => {
        const el = containerRef.current;
        if (!el) return;

        const { left, top, width, height } = el.getBoundingClientRect();
        const mx = e?.x ?? lastPosition.current.x;
        const my = e?.y ?? lastPosition.current.y;
        if (e) lastPosition.current = { x: mx, y: my };

        const center = [left + width * 0.5, top + height * 0.5];
        const dist = Math.hypot(mx - center[0], my - center[1]);
        const inactiveR = 0.5 * Math.min(width, height) * inactiveZone;

        if (dist < inactiveR) { el.style.setProperty("--active", "0"); return; }

        const isActive =
          mx > left - proximity && mx < left + width + proximity &&
          my > top - proximity && my < top + height + proximity;

        el.style.setProperty("--active", isActive ? "1" : "0");
        if (!isActive) return;

        const current = parseFloat(el.style.getPropertyValue("--start")) || 0;
        let target = (180 * Math.atan2(my - center[1], mx - center[0])) / Math.PI + 90;
        const diff = ((target - current + 180) % 360) - 180;

        animate(current, current + diff, {
          duration: movementDuration,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => el.style.setProperty("--start", String(v)),
        });
      });
    },
    [inactiveZone, proximity, movementDuration]
  );

  useEffect(() => {
    if (disabled) return;
    const onScroll = () => handleMove();
    const onPointer = (e: PointerEvent) => handleMove(e);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.body.addEventListener("pointermove", onPointer, { passive: true });
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("scroll", onScroll);
      document.body.removeEventListener("pointermove", onPointer);
    };
  }, [handleMove, disabled]);

  return (
    <>
      <div
        className={cn(
          "pointer-events-none absolute -inset-px hidden rounded-[inherit] border opacity-0 transition-opacity",
          glow && "opacity-100",
          disabled && "!block"
        )}
      />
      <div
        ref={containerRef}
        style={{
          "--blur": `${blur}px`,
          "--spread": spread,
          "--start": "0",
          "--active": "0",
          "--glowingeffect-border-width": `${borderWidth}px`,
          "--repeating-conic-gradient-times": "5",
          "--gradient": `
            radial-gradient(circle, #ffe57e 10%, #ffe57e00 20%),
            radial-gradient(circle at 40% 40%, #d4a017 5%, #d4a01700 15%),
            radial-gradient(circle at 60% 60%, #c87a10 10%, #c87a1000 20%),
            radial-gradient(circle at 40% 60%, #8b6914 10%, #8b691400 20%),
            repeating-conic-gradient(
              from 236.84deg at 50% 50%,
              #ffe57e 0%,
              #d4a017 calc(25% / var(--repeating-conic-gradient-times)),
              #c87a10 calc(50% / var(--repeating-conic-gradient-times)),
              #8b6914 calc(75% / var(--repeating-conic-gradient-times)),
              #ffe57e calc(100% / var(--repeating-conic-gradient-times))
            )`,
        } as React.CSSProperties}
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[inherit] opacity-100 transition-opacity",
          glow && "opacity-100",
          blur > 0 && "blur-[var(--blur)]",
          className,
          disabled && "!hidden"
        )}
      >
        <div
          className={cn(
            "glow rounded-[inherit]",
            'after:content-[""] after:rounded-[inherit] after:absolute after:inset-[calc(-1*var(--glowingeffect-border-width))]',
            "after:[border:var(--glowingeffect-border-width)_solid_transparent]",
            "after:[background:var(--gradient)] after:[background-attachment:fixed]",
            "after:opacity-[var(--active)] after:transition-opacity after:duration-300",
            "after:[mask-clip:padding-box,border-box]",
            "after:[mask-composite:intersect]",
            "after:[mask-image:linear-gradient(#0000,#0000),conic-gradient(from_calc((var(--start)-var(--spread))*1deg),#00000000_0deg,#fff,#00000000_calc(var(--spread)*2deg))]"
          )}
        />
      </div>
    </>
  );
});

GlowingEffect.displayName = "GlowingEffect";
export { GlowingEffect };
