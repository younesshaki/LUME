import { motion, useReducedMotion } from "motion/react";

type NavLinkProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  onIntent?: () => void;
  layoutId?: string;
};

export function NavLink({ label, active, onClick, onIntent, layoutId = "nav-indicator" }: NavLinkProps) {
  const shouldReduce = useReducedMotion();

  return (
    <button
      onClick={onClick}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onPointerDown={onIntent}
      className={`relative px-1 py-0.5 text-sm tracking-widest uppercase transition-colors duration-200 cursor-pointer
        ${active ? "text-[#C9A84C]" : "text-white/60 hover:text-white/90"}`}
      aria-current={active ? "page" : undefined}
    >
      {label}
      {active && !shouldReduce && (
        <motion.span
          layoutId={layoutId}
          className="absolute inset-x-0 -bottom-px h-px bg-[#C9A84C]"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      {active && shouldReduce && (
        <span className="absolute inset-x-0 -bottom-px h-px bg-[#C9A84C]" />
      )}
    </button>
  );
}
