import { useRef, type RefObject } from "react"
import {
  motion,
  useInView,
  type MotionProps,
  type UseInViewOptions,
  type Variants,
} from "motion/react"

type MarginType = UseInViewOptions["margin"]

interface BlurFadeProps extends MotionProps {
  children: React.ReactNode
  className?: string
  variant?: {
    hidden: { y: number }
    visible: { y: number }
  }
  duration?: number
  delay?: number
  offset?: number
  direction?: "up" | "down" | "left" | "right"
  inView?: boolean
  inViewMargin?: MarginType
  blur?: string
}

const getFilter = (v: Variants[string]) =>
  typeof v === "function" ? undefined : v.filter

export function BlurFade({
  inView = false,
  ...props
}: BlurFadeProps) {
  return inView
    ? <ObservedBlurFade {...props} inView />
    : <BlurFadeMotion {...props} isVisible />
}

function ObservedBlurFade(props: BlurFadeProps) {
  const ref = useRef<HTMLDivElement>(null)
  const isVisible = useInView(ref, {
    once: true,
    margin: props.inViewMargin ?? "-50px",
  })
  return <BlurFadeMotion {...props} motionRef={ref} isVisible={isVisible} />
}

function BlurFadeMotion({
  children,
  className,
  variant,
  duration = 0.4,
  delay = 0,
  offset = 6,
  direction = "down",
  blur = "6px",
  motionRef,
  isVisible,
  inView: _inView,
  inViewMargin: _inViewMargin,
  ...props
}: BlurFadeProps & {
  motionRef?: RefObject<HTMLDivElement>
  isVisible: boolean
}) {
  const defaultVariants: Variants = {
    hidden: {
      [direction === "left" || direction === "right" ? "x" : "y"]:
        direction === "right" || direction === "down" ? -offset : offset,
      opacity: 0,
      filter: `blur(${blur})`,
    },
    visible: {
      [direction === "left" || direction === "right" ? "x" : "y"]: 0,
      opacity: 1,
      filter: `blur(0px)`,
    },
  }
  const combinedVariants = variant ?? defaultVariants

  const hiddenFilter = getFilter(combinedVariants.hidden)
  const visibleFilter = getFilter(combinedVariants.visible)

  const shouldTransitionFilter =
    hiddenFilter != null &&
    visibleFilter != null &&
    hiddenFilter !== visibleFilter

  return (
    <motion.div
      ref={motionRef}
      initial="hidden"
      animate={isVisible ? "visible" : "hidden"}
      variants={combinedVariants}
      transition={{
        delay: 0.04 + delay,
        duration,
        ease: "easeOut",
        ...(shouldTransitionFilter ? { filter: { duration } } : {}),
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  )
}
