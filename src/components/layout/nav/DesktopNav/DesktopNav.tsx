import { NavLink } from "../NavLink";
import { NavOverflowMenu } from "../NavOverflowMenu";
import { useNavOverflow } from "../useNavOverflow";
import { splitNavForOverflow } from "../navOverflow";
import { SITE_NAV_ITEMS, type SiteNavItem } from "../../siteNavigation";

type DesktopNavProps = {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  onIntent?: (screen: string) => void;
  items?: SiteNavItem[];
};

/**
 * Header navigation that collapses instead of overlapping.
 *
 * The nav lives in a real layout track now (see SiteHeader), so its width is
 * bounded by the logo and action cluster rather than expanding over them. When
 * the configured tabs cannot fit that track, the tail moves into a "More" menu.
 *
 * The hidden probe row renders every item so natural widths stay measurable.
 * Measuring only the visible row would be circular: a collapsed item has no
 * width, so the nav could never re-expand when the viewport grows again.
 */
export function DesktopNav({
  currentScreen,
  onNavigate,
  onIntent,
  items = SITE_NAV_ITEMS,
}: DesktopNavProps) {
  const { trackRef, probeRef, triggerRef, result } = useNavOverflow(items.length);
  const { visible, overflow } = splitNavForOverflow(items, result.visibleCount, currentScreen);

  return (
    <div ref={trackRef} className="relative hidden md:flex w-full items-center justify-center">
      {/* Measurement probe: laid out for width, but invisible and untabbable. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 flex items-center gap-8"
        style={{ visibility: "hidden" }}
      >
        {items.map((item) => (
          <span
            key={item.screen}
            className="px-1 py-0.5 text-sm tracking-widest uppercase whitespace-nowrap"
          >
            {item.label}
          </span>
        ))}
      </div>

      <nav aria-label="Main navigation" className="flex items-center gap-8 min-w-0">
        {visible.map((item) => (
          <NavLink
            key={item.screen}
            label={item.label}
            active={currentScreen === item.screen}
            onClick={() => onNavigate(item.screen)}
            onIntent={() => onIntent?.(item.screen)}
          />
        ))}
        {result.hasOverflow && (
          <NavOverflowMenu
            items={overflow}
            currentScreen={currentScreen}
            onNavigate={onNavigate}
            onIntent={onIntent}
            triggerRef={triggerRef}
          />
        )}
      </nav>
    </div>
  );
}
