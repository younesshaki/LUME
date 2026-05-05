import { cn } from "@/lib/utils";

export function Meteors({ number = 12, className }: { number?: number; className?: string }) {
  const meteors = Array.from({ length: number }, (_, i) => ({
    id: i,
    left: `${Math.floor(Math.random() * 100)}%`,
    delay: `${(Math.random() * 6).toFixed(2)}s`,
    duration: `${(Math.random() * 6 + 6).toFixed(2)}s`,
  }));

  return (
    <>
      {meteors.map((m) => (
        <span
          key={m.id}
          className={cn("ollamaChat__meteor", className)}
          style={{ left: m.left, animationDelay: m.delay, animationDuration: m.duration }}
        />
      ))}
    </>
  );
}
