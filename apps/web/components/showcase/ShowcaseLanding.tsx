"use client";
import Link from "next/link";
import type { ShowcaseProps } from "./types";
export default function ShowcaseLanding({ tenant, entry }: ShowcaseProps) {
  const query = new URLSearchParams({
    tenant,
    part: String(entry.part),
    chapter: String(entry.chapter),
  });
  return (
    <section className="showcase__reserved showcase__landing">
      <h2>Cinematic product showcase</h2>
      <p>A focused opening story, built around the product.</p>
      <Link
        className="showcase__button"
        href={`/showcase/intro?${query}`}
        prefetch={false}
      >
        Enter showcase
      </Link>
    </section>
  );
}
