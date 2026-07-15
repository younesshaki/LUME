"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { cn } from "../../lib/utils"
import {
  buildThemeSnapshotMarkup,
  getThemeTransitionClipPaths,
  maxRevealRadius,
  rootMatchesTheme,
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

type RevealSession = {
  controller: AbortController
  overlay: HTMLDivElement | null
  animation: Animation | null
}

const SNAPSHOT_LOAD_TIMEOUT_MS = 1_500
const THEME_APPLY_TIMEOUT_MS = 500

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function waitForSnapshotLoad(
  iframe: HTMLIFrameElement,
  theme: "light" | "dark",
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"))
      return
    }
    let settled = false
    let timeout = 0
    let readinessFrame = 0
    const cleanup = () => {
      window.clearTimeout(timeout)
      cancelAnimationFrame(readinessFrame)
      iframe.removeEventListener("load", checkReady)
      iframe.removeEventListener("error", onError)
      signal.removeEventListener("abort", onAbort)
    }
    const checkReady = () => {
      if (settled) return
      try {
        if (iframe.contentDocument?.documentElement.dataset.themeRevealSnapshot === theme) {
          settled = true
          cleanup()
          resolve()
          return
        }
      } catch {
        // A restrictive frame policy will fall through to the safe timeout.
      }
      readinessFrame = requestAnimationFrame(checkReady)
    }
    const onError = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error("Theme snapshot failed to load"))
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new DOMException("Theme reveal aborted", "AbortError"))
    }
    iframe.addEventListener("load", checkReady)
    iframe.addEventListener("error", onError, { once: true })
    signal.addEventListener("abort", onAbort, { once: true })
    readinessFrame = requestAnimationFrame(checkReady)
    timeout = window.setTimeout(
      () => onError(),
      SNAPSHOT_LOAD_TIMEOUT_MS,
    )
  })
}

function waitForAnimation(animation: Animation, duration: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"))
      return
    }
    let settled = false
    const cleanup = () => {
      window.clearTimeout(timeout)
      signal.removeEventListener("abort", onAbort)
    }
    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onAbort = () => {
      animation.cancel()
      fail(new DOMException("Theme reveal aborted", "AbortError"))
    }
    const timeout = window.setTimeout(() => {
      try {
        animation.finish()
      } finally {
        finish()
      }
    }, Math.max(0, duration) + 250)
    signal.addEventListener("abort", onAbort, { once: true })
    void animation.finished.then(finish, fail)
  })
}

function waitForThemeApplication(
  root: HTMLElement,
  theme: "light" | "dark",
  signal: AbortSignal,
): Promise<void> {
  if (rootMatchesTheme(root, theme)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"))
      return
    }
    let timeout = 0
    const observer = new MutationObserver(() => {
      if (rootMatchesTheme(root, theme)) finish()
    })
    const cleanup = () => {
      observer.disconnect()
      window.clearTimeout(timeout)
      signal.removeEventListener("abort", onAbort)
    }
    const finish = () => {
      cleanup()
      resolve()
    }
    const onAbort = () => {
      cleanup()
      reject(new DOMException("Theme reveal aborted", "AbortError"))
    }
    observer.observe(root, { attributes: true, attributeFilter: ["class"] })
    signal.addEventListener("abort", onAbort, { once: true })
    timeout = window.setTimeout(finish, THEME_APPLY_TIMEOUT_MS)
  })
}

function waitForStablePaint(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Theme reveal aborted", "AbortError"))
      return
    }
    let firstFrame = 0
    let secondFrame = 0
    const onAbort = () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
      reject(new DOMException("Theme reveal aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        signal.removeEventListener("abort", onAbort)
        resolve()
      })
    })
  })
}

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
  const sessionRef = useRef<RevealSession | null>(null)

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

  const cancelSession = useCallback(() => {
    const session = sessionRef.current
    if (!session) return
    session.controller.abort()
    session.animation?.cancel()
    session.overlay?.remove()
    sessionRef.current = null
    inFlightRef.current = false
  }, [])

  useEffect(() => cancelSession, [cancelSession])

  const commitTheme = useCallback((nextTheme: "light" | "dark") => {
    if (isControlled) {
      onThemeChange?.(nextTheme)
      return
    }
    document.documentElement.classList.toggle("dark", nextTheme === "dark")
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

    if (duration <= 0 || prefersReducedMotion() || typeof document.documentElement.animate !== "function") {
      commitTheme(nextTheme)
      return
    }

    inFlightRef.current = true
    const session: RevealSession = {
      controller: new AbortController(),
      overlay: null,
      animation: null,
    }
    sessionRef.current = session

    const run = async () => {
      let committed = false
      try {
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

        const overlay = document.createElement("div")
        overlay.dataset.themeRevealOverlay = ""
        overlay.setAttribute("aria-hidden", "true")
        overlay.inert = true
        overlay.style.visibility = "hidden"
        overlay.style.clipPath = fromClip

        const iframe = document.createElement("iframe")
        iframe.title = ""
        iframe.tabIndex = -1
        iframe.setAttribute("aria-hidden", "true")
        iframe.setAttribute("sandbox", "allow-same-origin")
        overlay.append(iframe)
        session.overlay = overlay

        const loaded = waitForSnapshotLoad(iframe, nextTheme, session.controller.signal)
        document.body.append(overlay)
        iframe.srcdoc = buildThemeSnapshotMarkup(nextTheme)
        await loaded
        if (session.controller.signal.aborted) return

        try {
          iframe.contentWindow?.scrollTo(window.scrollX, window.scrollY)
        } catch {
          // Access can be unavailable under an unusually strict CSP.
        }
        await waitForStablePaint(session.controller.signal)
        overlay.style.visibility = "visible"
        void overlay.getBoundingClientRect()

        const animation = overlay.animate(
          { clipPath: [fromClip, toClip] },
          {
            duration,
            easing: variant === "star" ? "linear" : "ease-in-out",
            fill: "forwards",
          },
        )
        session.animation = animation
        await waitForAnimation(animation, duration, session.controller.signal)
        if (session.controller.signal.aborted) return

        commitTheme(nextTheme)
        committed = true
        await waitForThemeApplication(root, nextTheme, session.controller.signal)
        await waitForStablePaint(session.controller.signal)
      } catch (error) {
        if (!session.controller.signal.aborted && !committed) commitTheme(nextTheme)
      } finally {
        if (sessionRef.current === session) {
          session.overlay?.remove()
          sessionRef.current = null
          inFlightRef.current = false
        }
      }
    }

    void run()
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
