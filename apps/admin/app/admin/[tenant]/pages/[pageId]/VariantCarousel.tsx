"use client";

import { useEffect, useRef } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { BlockVariant } from "@lume/blocks";

type VariantCarouselProps = {
  variants: readonly BlockVariant[];
  /** Currently applied variant id. */
  value: string;
  onChange: (variantId: string) => void;
};

/**
 * Slideshow picker for block variants.
 *
 * Deliberately a slideshow rather than a dropdown: a variant is a *design*
 * choice, and a design choice made from a list of words is a guess. Stepping
 * through them applies each one as you land on it, so the live preview beside
 * the inspector becomes the thumbnail — always accurate, and nothing to
 * maintain as variants change.
 *
 * The tradeoff is that browsing mutates the draft. That is acceptable here
 * because the draft is not published until the dealer says so, and the editor
 * already has undo. It is also why the applied variant is labelled explicitly
 * rather than merely implied by position.
 */
export function VariantCarousel({ variants, value, onChange }: VariantCarouselProps) {
  const activeIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.id === value),
  );
  const current = variants[activeIndex];
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the selected chip in view when stepping with the arrows or keyboard.
  useEffect(() => {
    const list = listRef.current;
    const chip = list?.children[activeIndex] as HTMLElement | undefined;
    chip?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeIndex]);

  function step(delta: number) {
    // Wraps, so stepping never dead-ends on a disabled arrow.
    const next = (activeIndex + delta + variants.length) % variants.length;
    onChange(variants[next].id);
  }

  if (variants.length === 0) return null;

  return (
    <section
      aria-labelledby="variant-picker-heading"
      className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id="variant-picker-heading" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Design
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous design"
            onClick={() => step(-1)}
            className="rounded p-1 text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </button>
          <span className="text-xs tabular-nums text-muted-foreground" aria-hidden="true">
            {activeIndex + 1}/{variants.length}
          </span>
          <button
            type="button"
            aria-label="Next design"
            onClick={() => step(1)}
            className="rounded p-1 text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Radiogroup, not a listbox: exactly one applies, and arrow keys are the
          expected interaction. */}
      <div
        ref={listRef}
        role="radiogroup"
        aria-label="Block design"
        className="mt-3 flex gap-2 overflow-x-auto pb-1"
      >
        {variants.map((variant, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(variant.id)}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                selected
                  ? "border-neutral-950 bg-neutral-950 text-white dark:border-white dark:bg-white dark:text-neutral-950"
                  : "border-neutral-300 text-muted-foreground hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              }`}
            >
              {selected && <Check className="size-3" aria-hidden="true" />}
              {variant.label}
            </button>
          );
        })}
      </div>

      {current && (
        <p aria-live="polite" className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{current.label}</span> — {current.description}
        </p>
      )}
      <p className="mt-1 text-[11px] text-muted-foreground">
        Applied to the draft as you browse. The preview updates immediately.
      </p>
    </section>
  );
}
