"use client";
import Link from "next/link";
import type { ShowcaseProps } from "./types";
/** Title-card entry surface; sound and full intro choreography belong to 5d. */
export default function ShowcaseIntro({ tenant, entry }: ShowcaseProps) {
  const query = new URLSearchParams({
    tenant,
    part: String(entry.part),
    chapter: String(entry.chapter),
  });
  return (
    <section className="showcase__reserved showcase__intro">
      <p>Cinematic Product Showcase</p>
      <h2>The opening story</h2>
      <Link
        className="showcase__button"
        href={`/showcase/experience?${query}`}
        prefetch={false}
      >
        Play
      </Link>
      <p>You can leave at any time using the navigation.</p>
    </section>
  );
}
