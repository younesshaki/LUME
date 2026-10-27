"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
const Lightbox = dynamic(() => import("./Lightbox"), { ssr: false });
export default function GalleryEnhancement({
  images,
}: {
  images: { src: string; alt: string }[];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [open, setOpen] = useState(false);
  if (!hydrated) return null;
  return (
    <div className="enhancement">
      <button type="button" onClick={() => setOpen(true)}>
        Enlarge photographs
      </button>
      {open && <Lightbox images={images} close={() => setOpen(false)} />}
    </div>
  );
}
