"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";

export type CarouselSlide = {
  id: string;
  title: string;
  description: string;
  imageSrc?: string;
  footer: ReactNode;
};

type CarouselProps = {
  slides: CarouselSlide[];
};

/**
 * Adapted from the Aceternity carousel interaction for product use. Unlike the
 * demo-only registry component, each slide carries an accessible page summary
 * and a footer slot for real page-management actions.
 */
export default function Carousel({ slides }: CarouselProps) {
  const [current, setCurrent] = useState(0);
  const id = useId();
  const safeCurrent = Math.min(current, Math.max(slides.length - 1, 0));

  useEffect(() => {
    if (current !== safeCurrent) setCurrent(safeCurrent);
  }, [current, safeCurrent]);

  if (slides.length === 0) return null;
  const slide = slides[safeCurrent];
  const previous = () => setCurrent((index) => (index - 1 + slides.length) % slides.length);
  const next = () => setCurrent((index) => (index + 1) % slides.length);

  return (
    <section
      className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-950 py-6 shadow-sm dark:border-neutral-800 sm:py-8"
      aria-labelledby={`page-carousel-${id}`}
    >
      <div className="relative mx-auto h-[min(35vmin,20rem)] w-[min(35vmin,20rem)]">
        <ul
          className="absolute flex -ml-[2vmin] transition-transform duration-1000 ease-in-out"
          style={{ transform: `translateX(-${safeCurrent * (100 / slides.length)}%)` }}
        >
          {slides.map((item, index) => (
            <li
              key={item.id}
              onClick={() => setCurrent(index)}
              className="relative mx-[2vmin] flex h-[min(35vmin,20rem)] w-[min(35vmin,20rem)] shrink-0 cursor-pointer items-end justify-center overflow-hidden rounded-[1%] bg-neutral-900 text-center text-white transition-transform duration-500 ease-in-out"
              style={{
                opacity: index === safeCurrent ? 1 : 0.5,
                transform: index === safeCurrent ? "scale(1) rotateX(0deg)" : "scale(0.98) rotateX(8deg)",
                transformOrigin: "bottom",
              }}
            >
              {item.imageSrc ? (
                <img
                  src={item.imageSrc}
                  alt={`Screenshot of ${item.title}`}
                  className="size-full object-contain object-center transition-opacity duration-600"
                  loading={index === safeCurrent ? "eager" : "lazy"}
                />
              ) : (
                <div className="size-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_35%),linear-gradient(135deg,#292524,#0a0a0a)]" aria-hidden="true" />
              )}
              <div className={`absolute inset-0 bg-black/35 transition-opacity duration-500 ${index === safeCurrent ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
              <div className={`absolute inset-x-0 bottom-0 p-4 transition-opacity duration-500 ${index === safeCurrent ? "visible opacity-100" : "invisible opacity-0"}`}>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/65">
                  Page {index + 1} of {slides.length}
                </p>
                <h2 id={index === safeCurrent ? `page-carousel-${id}` : undefined} className="mt-1 text-lg font-semibold sm:text-xl">
                  {item.title}
                </h2>
                <p className="mt-1 text-xs text-white/75">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mx-auto mt-5 flex w-fit items-center gap-2" aria-label="Carousel controls">
          <button
            type="button"
            onClick={previous}
            aria-label="Previous page"
            className="inline-flex size-9 items-center justify-center rounded-full border border-white/15 bg-neutral-800 text-white transition hover:-translate-y-0.5 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next page"
            className="inline-flex size-9 items-center justify-center rounded-full border border-violet-400 bg-neutral-800 text-white transition hover:-translate-y-0.5 hover:bg-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <div className="ml-2 flex gap-1" aria-label="Select page">
            {slides.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrent(index)}
                aria-label={`Show ${item.title}`}
                aria-current={index === safeCurrent ? "true" : undefined}
                className={`h-1.5 rounded-full transition-all ${
                  index === safeCurrent ? "w-6 bg-white" : "w-1.5 bg-white/35 hover:bg-white/60"
                }`}
              />
            ))}
          </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-4">
        {slide.footer}
      </div>
    </section>
  );
}
