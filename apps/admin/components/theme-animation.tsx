"use client";

/**
 * Per-user theme-toggle animation preference.
 *
 * The animation styles are the reveal shapes already implemented by
 * `AnimatedThemeToggler` (see `lib/themeTransition.ts`). This context lets each
 * admin pick which shape their light/dark toggle uses; the choice is stored in
 * localStorage only (no backend, no tenant scope) because it is a personal UI
 * preference, not tenant data.
 *
 * Note: Chrome on macOS falls back to a solid-circle cover for every shape (the
 * toggler avoids a one-frame compositor flash there), so the shape choice is
 * visible in Safari/Firefox and non-Mac Chrome.
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

function isVariant(value: string | null): value is TransitionVariant {
  return value !== null && VALID_VARIANTS.has(value as TransitionVariant);
}

type ThemeAnimationContextValue = {
  variant: TransitionVariant;
  setVariant: (variant: TransitionVariant) => void;
};

const ThemeAnimationContext = React.createContext<ThemeAnimationContextValue | null>(null);

export function ThemeAnimationProvider({ children }: { children: React.ReactNode }) {
  // Start from the default so server and first client render match; the stored
  // preference is applied after mount to avoid a hydration mismatch.
  const [variant, setVariantState] = React.useState<TransitionVariant>(DEFAULT_THEME_ANIMATION);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isVariant(stored)) setVariantState(stored);
    } catch {
      // No stored preference is fine — the default stands.
    }
  }, []);

  const setVariant = React.useCallback((next: TransitionVariant) => {
    setVariantState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this session when storage is unavailable.
    }
  }, []);

  const value = React.useMemo(() => ({ variant, setVariant }), [variant, setVariant]);

  return (
    <ThemeAnimationContext.Provider value={value}>
      {children}
    </ThemeAnimationContext.Provider>
  );
}

export function useThemeAnimation(): ThemeAnimationContextValue {
  const context = React.useContext(ThemeAnimationContext);
  if (!context) {
    throw new Error("useThemeAnimation must be used within a ThemeAnimationProvider");
  }
  return context;
}
