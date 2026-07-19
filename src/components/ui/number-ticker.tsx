import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import {
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  })
  const isInView = useInView(ref, { once: true, margin: "0px" })
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      if (reduceMotion) {
        if (ref.current) {
          ref.current.textContent = formatTickerValue(value, decimalPlaces)
        }
      } else {
        timer = setTimeout(() => {
          motionValue.set(direction === "down" ? startValue : value)
        }, delay * 1000)
      }
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [
    motionValue,
    isInView,
    delay,
    value,
    direction,
    startValue,
    reduceMotion,
    decimalPlaces,
  ])

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) {
          ref.current.textContent = formatTickerValue(latest, decimalPlaces)
        }
      }),
    [springValue, decimalPlaces]
  )

  return (
    <span
      ref={ref}
      aria-label={formatTickerValue(value, decimalPlaces)}
      className={cn("inline-block tracking-wider tabular-nums", className)}
      {...props}
    >
      {reduceMotion ? formatTickerValue(value, decimalPlaces) : startValue}
    </span>
  )
}

function formatTickerValue(value: number, decimalPlaces: number): string {
  return Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(Number(value.toFixed(decimalPlaces)))
}
