"use client";
import { useEffect, useRef, useState } from "react";
export default function Lightbox({
  images,
  close,
}: {
  images: { src: string; alt: string }[];
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog ref={dialog} onCancel={close} aria-label="Vehicle photographs">
      <button autoFocus onClick={close}>
        Close photographs
      </button>
      <img src={images[index].src} alt={images[index].alt} />
      <p aria-live="polite">
        Photo {index + 1} of {images.length}
      </p>
      <button disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
        Previous photo
      </button>
      <button
        disabled={index === images.length - 1}
        onClick={() => setIndex((i) => i + 1)}
      >
        Next photo
      </button>
    </dialog>
  );
}
