"use client";
import dynamic from "next/dynamic";
import type { ShowcaseKind, ShowcaseProps } from "./types";
// Reserve the eventual layout before any lazy chunk or model bytes arrive.
const loading = () => (
  <section className="showcase__reserved">
    <div className="showcase__sticky">
      <p role="status">Preparing the showcase…</p>
    </div>
  </section>
);
const Landing = dynamic(() => import("./ShowcaseLanding"), {
  ssr: false,
  loading,
});
const Intro = dynamic(() => import("./ShowcaseIntro"), { ssr: false, loading });
const Experience = dynamic(() => import("./Experience"), {
  ssr: false,
  loading,
});
export default function ShowcaseIsland({
  kind,
  ...props
}: ShowcaseProps & { kind: ShowcaseKind }) {
  return kind === "landing" ? (
    <Landing {...props} />
  ) : kind === "intro" ? (
    <Intro {...props} />
  ) : (
    <Experience {...props} />
  );
}
