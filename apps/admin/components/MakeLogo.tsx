"use client";

import { lookupMakeLogo, makeMonogram } from "@lume/types/vehicleMakeLogos";
import "./MakeLogo.css";

type MakeLogoProps = {
  make: string | null | undefined;
  /** Rendered box in px. Below ~20 the detailed marks stop being legible. */
  size?: number;
  className?: string;
  /**
   * Decorative by default. The make is almost always already written next to
   * the logo, and repeating it doubles up for screen readers.
   */
  title?: string;
};

/**
 * A vehicle make logo, or a monogram chip when none is curated.
 *
 * Colour comes entirely from `currentColor`, so light and dark are handled by
 * whatever text colour the surrounding context already uses — there is no
 * per-theme asset and nothing to keep in sync. Brand colours were measured and
 * rejected: 19 of 28 fail WCAG 3:1 against one of LUME's two backgrounds, and
 * seven marques are pure #000000, invisible on the dark site.
 *
 * Both branches render the same outer box so a mixed row (logo, logo, monogram)
 * keeps its rhythm instead of jumping.
 */
export function MakeLogo({ make, size = 20, className = "", title }: MakeLogoProps) {
  const logo = lookupMakeLogo(make);
  const label = title ?? undefined;
  const box = { width: size, height: size } as const;

  if (!logo) {
    return (
      <span
        className={`makeLogo makeLogo--monogram ${className}`}
        style={{ ...box, fontSize: Math.max(9, Math.round(size * 0.42)) }}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {makeMonogram(make)}
      </span>
    );
  }

  return (
    <svg
      className={`makeLogo ${className}`}
      style={box}
      viewBox={logo.viewBox}
      // Marks must never be stretched — trademark use depends on faithful
      // proportions, and the source viewBoxes are not square.
      preserveAspectRatio="xMidYMid meet"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {label ? <title>{label}</title> : null}
      {logo.paths.map((d, index) => (
        <path key={index} d={d} fill="currentColor" fillRule={logo.fillRule} />
      ))}
    </svg>
  );
}
