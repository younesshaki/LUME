"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { cn } from "../../lib/utils"
import {
  getThemeTransitionClipPaths,
  maxRevealRadius,
  type TransitionVariant,
} from "../../lib/themeTransition"

export type { TransitionVariant }

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number
  variant?: TransitionVariant
  /** When true, the reveal expands from the viewport center instead of the button center. */
  fromCenter?: boolean
  /** Controlled theme; next-themes remains the persistence authority. */
  theme?: "light" | "dark"
  onThemeChange?: (theme: "light" | "dark") => void
}

type ViewTransition = { ready: Promise<void>; finished: Promise<void> }
type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => ViewTransition
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/**
 * Theme control with a clip-path reveal powered by the browser-native View
 * Transitions API — the browser snapshots the current render (no DOM cloning,
 * no font re-download, no sandboxed-iframe scripts). Browsers without it apply
 * the theme instantly.
 */
export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  variant = "circle",
  fromCenter = false,
  theme,
  onThemeChange,
  onClick,
  ...props
}: AnimatedThemeTogglerProps) => {
  const isControlled = theme !== undefined
  const [internalIsDark, setInternalIsDark] = useState(false)
  const isDark = isControlled ? theme === "dark" : internalIsDark
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inFlightRef = useRef(false)

  useEffect(() => {
    if (isControlled) return
    const updateTheme = () => {
      setInternalIsDark(document.documentElement.classList.contains("dark"))
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [isControlled])

  const commitTheme = useCallback((nextTheme: "light" | "dark") => {
    // Apply the class synchronously so a View Transition snapshots the final
    // render; next-themes (via onThemeChange) remains the persistence authority.
    document.documentElement.classList.toggle("dark", nextTheme === "dark")
    if (isControlled) {
      onThemeChange?.(nextTheme)
      return
    }
    setInternalIsDark(nextTheme === "dark")
    try {
      localStorage.setItem("theme", nextTheme)
    } catch {
      // The visible theme still updates when storage is unavailable.
    }
  }, [isControlled, onThemeChange])

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current
    if (!button || inFlightRef.current) return
    const nextTheme: "light" | "dark" = isDark ? "light" : "dark"

    const doc = document as ViewTransitionDocument
    if (
      duration <= 0 ||
      prefersReducedMotion() ||
      typeof doc.startViewTransition !== "function" ||
      typeof document.documentElement.animate !== "function"
    ) {
      commitTheme(nextTheme)
      return
    }

    inFlightRef.current = true
    const root = document.documentElement
    const viewportWidth = Math.max(
      window.innerWidth,
      root.clientWidth,
      window.visualViewport?.width ?? 0,
    )
    const viewportHeight = Math.max(
      window.innerHeight,
      root.clientHeight,
      window.visualViewport?.height ?? 0,
    )
    const rect = button.getBoundingClientRect()
    const x = fromCenter ? viewportWidth / 2 : rect.left + rect.width / 2
    const y = fromCenter ? viewportHeight / 2 : rect.top + rect.height / 2
    const radius = maxRevealRadius(x, y, viewportWidth, viewportHeight)
    const [fromClip, toClip] = getThemeTransitionClipPaths(
      variant,
      x,
      y,
      radius,
      viewportWidth,
      viewportHeight,
    )

    const transition = doc.startViewTransition!(() => commitTheme(nextTheme))
    transition.ready
      .then(() => {
        root.animate(
          { clipPath: [fromClip, toClip] },
          {
            duration,
            easing: variant === "star" ? "linear" : "ease-in-out",
            pseudoElement: "::view-transition-new(root)",
          },
        )
      })
      .catch(() => {
        // A skipped/interrupted transition still committed the theme.
      })
    transition.finished
      .catch(() => {})
      .finally(() => {
        inFlightRef.current = false
      })
  }, [commitTheme, duration, fromCenter, isDark, variant])

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) toggleTheme()
      }}
      className={cn(className)}
      {...props}
    >
      <Sun className="hidden dark:block" />
      <Moon className="block dark:hidden" />
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
