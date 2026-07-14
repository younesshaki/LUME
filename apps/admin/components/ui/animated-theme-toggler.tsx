"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  getThemeTransitionClipPaths,
  maxRevealRadius,
  type TransitionVariant,
} from "@/lib/themeTransition"

export type { TransitionVariant }

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {
  duration?: number
  variant?: TransitionVariant
  /** When true, the reveal expands from the viewport center instead of the button center. */
  fromCenter?: boolean
  /**
   * Controlled theme value. When provided, the parent owns persistence
   * (e.g. `next-themes`) and this component will not write to localStorage.
   */
  theme?: "light" | "dark"
  /** Called on toggle. Pair with `theme` for controlled usage. */
  onThemeChange?: (theme: "light" | "dark") => void
}

// Above app chrome but below nothing important; the overlay is inert.
const OVERLAY_Z_INDEX = 2147483000

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export const AnimatedThemeToggler = ({
  className,
  duration = 400,
  variant,
  fromCenter = false,
  theme,
  onThemeChange,
  ...props
}: AnimatedThemeTogglerProps) => {
  const shape = variant ?? "circle"
  const isControlled = theme !== undefined
  const [internalIsDark, setInternalIsDark] = useState(false)
  const isDark = isControlled ? theme === "dark" : internalIsDark
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Serializes toggles: a second click while a reveal is in flight is ignored,
  // so rapid clicking can never leave two overlays or a half-applied theme.
  const inFlightRef = useRef(false)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // Uncontrolled mode keeps the icon in sync with the <html> class.
  useEffect(() => {
    if (isControlled) return
    const updateTheme = () => {
      setInternalIsDark(document.documentElement.classList.contains("dark"))
    }
    updateTheme()
    const observer = new MutationObserver(updateTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [isControlled])

  // Guarantee the overlay is torn down if we unmount mid-transition.
  useEffect(() => {
    return () => {
      overlayRef.current?.remove()
      overlayRef.current = null
      inFlightRef.current = false
    }
  }, [])

  const commitTheme = useCallback(
    (next: "light" | "dark") => {
      // next-themes stays the authoritative persisted state in controlled mode.
      if (isControlled) {
        onThemeChange?.(next)
        return
      }
      document.documentElement.classList.toggle("dark", next === "dark")
      setInternalIsDark(next === "dark")
      try {
        localStorage.setItem("theme", next)
      } catch {
        // storage may be unavailable (private mode) — the class change still applies
      }
    },
    [isControlled, onThemeChange],
  )

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current
    if (!button || inFlightRef.current) return
    const next: "light" | "dark" = isDark ? "light" : "dark"

    // No DOM / no WAAPI → just switch, no animation.
    if (typeof document === "undefined" || typeof document.body === "undefined") {
      commitTheme(next)
      return
    }

    const reduced = prefersReducedMotion()

    const viewportWidth = Math.max(
      window.innerWidth,
      document.documentElement.clientWidth,
      window.visualViewport?.width ?? 0,
    )
    const viewportHeight = Math.max(
      window.innerHeight,
      document.documentElement.clientHeight,
      window.visualViewport?.height ?? 0,
    )

    let x: number
    let y: number
    if (fromCenter) {
      x = viewportWidth / 2
      y = viewportHeight / 2
    } else {
      const { top, left, width, height } = button.getBoundingClientRect()
      x = left + width / 2
      y = top + height / 2
    }
    const maxRadius = maxRevealRadius(x, y, viewportWidth, viewportHeight)
    const [fromClip, toClip] = getThemeTransitionClipPaths(
      shape,
      x,
      y,
      maxRadius,
      viewportWidth,
      viewportHeight,
    )

    // A fixed overlay painted in the *target* theme's own background. The `.dark`
    // class on the overlay makes `var(--background)` resolve to the target theme
    // regardless of the current <html> class, so no browser view-transition
    // snapshot is involved (that snapshot is the source of the Chrome/macOS
    // one-frame edge flash this replaces).
    const overlay = document.createElement("div")
    overlay.setAttribute("aria-hidden", "true")
    overlay.dataset.themeRevealOverlay = ""
    if (next === "dark") overlay.classList.add("dark")
    overlay.style.position = "fixed"
    overlay.style.inset = "0"
    overlay.style.zIndex = String(OVERLAY_Z_INDEX)
    overlay.style.pointerEvents = "none"
    overlay.style.background = "var(--background)"
    if (reduced) {
      overlay.style.opacity = "0"
    } else {
      overlay.style.clipPath = fromClip
      overlay.style.willChange = "clip-path"
    }
    document.body.appendChild(overlay)
    overlayRef.current = overlay
    inFlightRef.current = true

    let finalized = false
    const finalize = () => {
      if (finalized) return
      finalized = true
      // Commit while the overlay fully covers the viewport, so the underlying
      // page swap is never visible, then remove the overlay on the next frames.
      commitTheme(next)
      const remove = () => {
        overlay.remove()
        if (overlayRef.current === overlay) overlayRef.current = null
        inFlightRef.current = false
      }
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => requestAnimationFrame(remove))
      } else {
        remove()
      }
    }

    if (typeof overlay.animate !== "function") {
      finalize()
      return
    }

    // Force the from-state to paint before animating to the to-state.
    void overlay.getBoundingClientRect()

    const animation = reduced
      ? overlay.animate({ opacity: [0, 1] }, {
          duration: Math.min(duration, 200),
          easing: "ease-out",
          fill: "forwards",
        })
      : overlay.animate({ clipPath: [fromClip, toClip] }, {
          duration,
          // Star: linear avoids easing overshoot that fights polygon interpolation at t→1.
          easing: shape === "star" ? "linear" : "ease-in-out",
          fill: "forwards",
        })

    animation.addEventListener("finish", finalize)
    animation.addEventListener("cancel", finalize)
    // Safety net: never strand an overlay if `finish` fails to fire.
    window.setTimeout(finalize, duration + 500)
  }, [shape, fromCenter, duration, isDark, commitTheme])

  return (
    <button
      type="button"
      ref={buttonRef}
      onClick={toggleTheme}
      className={cn(className)}
      {...props}
    >
      {isDark ? <Sun /> : <Moon />}
      <span className="sr-only">Toggle theme</span>
    </button>
  )
}
