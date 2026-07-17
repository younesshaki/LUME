type InvitationCTAProps = {
  onClick: () => void;
  onIntent?: () => void;
  className?: string;
  /** Configurable per tenant (theme.header.ctaLabel). */
  label?: string;
};

export function InvitationCTA({ onClick, onIntent, className = "", label }: InvitationCTAProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onIntent}
      onFocus={onIntent}
      onPointerDown={onIntent}
      className={`relative group px-5 py-2 text-xs tracking-[0.2em] uppercase text-[var(--theme-lume-gold,#C9A84C)]
        border border-[color-mix(in_srgb,var(--theme-lume-gold,#C9A84C)_60%,transparent)] hover:border-[var(--theme-lume-gold,#C9A84C)] rounded-full
        transition-all duration-300 overflow-hidden cursor-pointer
        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]
        ${className}`}
    >
      {/* shimmer fill on hover */}
      <span
        className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%]
          transition-transform duration-700 ease-in-out
          bg-gradient-to-r from-transparent via-[#C9A84C]/15 to-transparent"
        aria-hidden
      />
      <span className="relative">{label?.trim() || "Request Invitation"}</span>
    </button>
  );
}
