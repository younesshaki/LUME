"use client";

/**
 * Per-user theme-toggle animation preference.
 *
 * The animation styles are the reveal shapes already implemented by
 * `AnimatedThemeToggler` (see `lib/themeTransition.ts`). Each admin picks which
 * shape their light/dark toggle uses; the choice is stored in localStorage only
 * (no backend, no tenant scope) because it is a personal UI preference.
 *
 * Deliberately a module-level store read via `useSyncExternalStore` rather than
 * a React context provider: the preference is consumed in two far-apart places
 * (the header toggle and this settings dialog), and a provider high in the tree
 * would re-render the ENTIRE admin shell on every selection. Doing that while
 * the modal settings dialog is open corrupts Radix's body pointer-events lock
 * and freezes the page until refresh. A subscription store re-renders only the
 * actual consumers, so selecting an option never touches the rest of the tree.
 *
 * Every shape works in every browser: on Chrome/macOS the toggler animates the
 * shape with a solid clip-path cover (no iframe snapshot) to stay flash-free;
 * elsewhere it reveals the destination snapshot through the same shape.
 */
import * as React from "react";
import type { TransitionVariant } from "@/lib/themeTransition";

const STORAGE_KEY = "lume.admin.theme-animation.v1";

export type ThemeAnimationOption = {
  value: TransitionVariant;
  label: string;
  description: string;
};

export const THEME_ANIMATIONS: readonly ThemeAnimationOption[] = [
  { value: "circle", label: "Circle", description: "A smooth radial wipe out from the toggle. The classic." },
  { value: "square", label: "Square", description: "A square that grows to fill the screen." },
  { value: "rectangle", label: "Blinds", description: "A rectangle that expands edge to edge." },
  { value: "diamond", label: "Diamond", description: "A rotated square sweeping outward." },
  { value: "triangle", label: "Triangle", description: "A triangle unfolding across the view." },
  { value: "hexagon", label: "Hexagon", description: "A six-sided reveal for a bit of flair." },
  { value: "star", label: "Star", description: "A five-point star bursting open." },
] as const;

export const DEFAULT_THEME_ANIMATION: TransitionVariant = "circle";

const VALID_VARIANTS = new Set<TransitionVariant>(
  THEME_ANIMATIONS.map((option) => option.value),
);

function readStored(): TransitionVariant {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_VARIANTS.has(stored as TransitionVariant)) {
      return stored as TransitionVariant;
    }
  } catch {
    // No stored preference (or storage blocked) — fall back to the default.
  }
  return DEFAULT_THEME_ANIMATION;
}

// Hydrated eagerly on the client. The variant only affects a click handler, not
// any rendered DOM, so a client value differing from the SSR default causes no
// hydration mismatch.
let currentVariant: TransitionVariant =
  typeof window === "undefined" ? DEFAULT_THEME_ANIMATION : readStored();

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): TransitionVariant {
  return currentVariant;
}

function getServerSnapshot(): TransitionVariant {
  return DEFAULT_THEME_ANIMATION;
}

export function setThemeAnimation(variant: TransitionVariant): void {
  if (variant === currentVariant) return;
  currentVariant = variant;
  try {
    localStorage.setItem(STORAGE_KEY, variant);
  } catch {
    // The choice still applies for this session when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

export function useThemeAnimation(): {
  variant: TransitionVariant;
  setVariant: (variant: TransitionVariant) => void;
} {
  const variant = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { variant, setVariant: setThemeAnimation };
}
