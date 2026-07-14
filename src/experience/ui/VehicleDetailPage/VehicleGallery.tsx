import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { VehicleGalleryImage } from "@/experience/vehicles/catalog";

const SWIPE_THRESHOLD_PX = 40;

type VehicleGalleryProps = {
  images: VehicleGalleryImage[];
  title: string;
  badge?: React.ReactNode;
};

function altFor(image: VehicleGalleryImage, title: string, index: number, count: number): string {
  if (image.alt) return image.alt;
  return count > 1 ? `${title} — photo ${index + 1} of ${count}` : title;
}

export default function VehicleGallery({ images, title, badge }: VehicleGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const count = images.length;
  const safeIndex = Math.min(activeIndex, Math.max(0, count - 1));
  const active = images[safeIndex];

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setActiveIndex(((next % count) + count) % count);
    },
    [count],
  );
  const goPrev = useCallback(() => goTo(safeIndex - 1), [goTo, safeIndex]);
  const goNext = useCallback(() => goTo(safeIndex + 1), [goTo, safeIndex]);

  useEffect(() => {
    // Reset when the vehicle (and therefore the image set) changes.
    setActiveIndex(0);
  }, [images]);

  const handleKeyNav = useCallback(
    (event: React.KeyboardEvent) => {
      if (count <= 1) return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrev();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      }
    },
    [count, goNext, goPrev],
  );

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null || count <= 1) return;
    const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    if (Math.abs(delta) >= SWIPE_THRESHOLD_PX) {
      if (delta < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  if (!active) return null;

  return (
    <div className="vehicleGallery">
      <div
        className="vehicleGallery__stage"
        role="group"
        aria-roledescription="carousel"
        aria-label={`${title} photos`}
        tabIndex={0}
        onKeyDown={handleKeyNav}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          className="vehicleGallery__main"
          src={active.src}
          alt={altFor(active, title, safeIndex, count)}
          loading="eager"
          draggable={false}
        />
        {badge}

        {count > 1 && (
          <>
            <button
              type="button"
              className="vehicleGallery__arrow vehicleGallery__arrow--prev"
              aria-label="Previous photo"
              onClick={goPrev}
            >
              <ChevronLeft size={22} />
            </button>
            <button
              type="button"
              className="vehicleGallery__arrow vehicleGallery__arrow--next"
              aria-label="Next photo"
              onClick={goNext}
            >
              <ChevronRight size={22} />
            </button>
            <span className="vehicleGallery__counter" aria-live="polite">
              {safeIndex + 1} / {count}
            </span>
          </>
        )}

        <button
          type="button"
          className="vehicleGallery__expand"
          aria-label="View photo full screen"
          onClick={() => setLightboxOpen(true)}
        >
          <Maximize2 size={16} />
        </button>
      </div>

      {count > 1 && (
        <ul className="vehicleGallery__thumbs">
          {images.map((image, index) => (
            <li key={`${image.src}-${index}`}>
              <button
                type="button"
                className={`vehicleGallery__thumb${
                  index === safeIndex ? " vehicleGallery__thumb--active" : ""
                }`}
                aria-label={`Show photo ${index + 1}`}
                aria-current={index === safeIndex}
                onClick={() => goTo(index)}
              >
                <img src={image.src} alt="" loading="lazy" draggable={false} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {lightboxOpen && (
        <GalleryLightbox
          images={images}
          title={title}
          index={safeIndex}
          onIndexChange={setActiveIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  );
}

function GalleryLightbox({
  images,
  title,
  index,
  onIndexChange,
  onClose,
}: {
  images: VehicleGalleryImage[];
  title: string;
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const count = images.length;
  const active = images[index];

  const goTo = useCallback(
    (next: number) => onIndexChange(((next % count) + count) % count),
    [count, onIndexChange],
  );

  useEffect(() => {
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft" && count > 1) {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key === "ArrowRight" && count > 1) {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === "Tab" && dialogRef.current) {
        const nodes = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled)"),
        );
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [count, goTo, index, onClose]);

  if (!active) return null;

  return (
    <div className="vehicleGallery__lightbox" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="vehicleGallery__lightboxInner"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} photo viewer`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="vehicleGallery__lightboxClose"
          aria-label="Close photo viewer"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <img
          className="vehicleGallery__lightboxImage"
          src={active.src}
          alt={altFor(active, title, index, count)}
          draggable={false}
        />

        {count > 1 && (
          <>
            <button
              type="button"
              className="vehicleGallery__arrow vehicleGallery__arrow--prev"
              aria-label="Previous photo"
              onClick={() => goTo(index - 1)}
            >
              <ChevronLeft size={26} />
            </button>
            <button
              type="button"
              className="vehicleGallery__arrow vehicleGallery__arrow--next"
              aria-label="Next photo"
              onClick={() => goTo(index + 1)}
            >
              <ChevronRight size={26} />
            </button>
            <span className="vehicleGallery__counter" aria-live="polite">
              {index + 1} / {count}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
