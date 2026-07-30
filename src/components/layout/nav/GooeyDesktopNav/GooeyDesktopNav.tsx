import { useRef, useEffect } from 'react';
import { useReducedMotion } from 'motion/react';
import { SITE_NAV_ITEMS, type SiteNavItem } from '../../siteNavigation';
import { NavOverflowMenu } from '../NavOverflowMenu';
import { splitNavForOverflow } from '../navOverflow';
import { useNavOverflow } from '../useNavOverflow';
import './GooeyNav.css';

type GooeyDesktopNavProps = {
  currentScreen: string;
  onNavigate: (screen: string) => void;
  onIntent?: (screen: string) => void;
  items?: SiteNavItem[];
  particleCount?: number;
  particleDistances?: [number, number];
  particleR?: number;
  animationTime?: number;
  timeVariance?: number;
  colors?: number[];
};

export function GooeyDesktopNav({
  currentScreen,
  onNavigate,
  onIntent,
  items = SITE_NAV_ITEMS,
  particleCount = 20,
  particleDistances = [70, 8],
  particleR = 120,
  animationTime = 500,
  timeVariance = 200,
  colors = [1, 2, 3, 1, 2, 4, 1, 3],
}: GooeyDesktopNavProps) {
  const reducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const filterRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // Collapse instead of overflowing the header track. The active item is
  // always kept inline (see splitNavForOverflow) because the particle effect
  // anchors to a rendered <li> — if the active tab collapsed into "More", the
  // effect would have nothing to attach to and the indicator would vanish.
  const { trackRef, probeRef, triggerRef, result } = useNavOverflow(items.length);
  const { visible: visibleItems, overflow: overflowItems } =
    splitNavForOverflow(items, result.visibleCount, currentScreen);

  const activeIndex = visibleItems.findIndex(item => item.screen === currentScreen);

  const noise = (n = 1) => n / 2 - Math.random() * n;

  const getXY = (distance: number, pointIndex: number, totalPoints: number): [number, number] => {
    const angle = ((360 + noise(8)) / totalPoints) * pointIndex * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };

  const updateEffectPosition = (element: HTMLElement) => {
    if (!containerRef.current || !filterRef.current || !textRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const pos = element.getBoundingClientRect();
    const styles = {
      left: `${pos.x - containerRect.x}px`,
      top: `${pos.y - containerRect.y}px`,
      width: `${pos.width}px`,
      height: `${pos.height}px`,
    };
    Object.assign(filterRef.current.style, styles);
    Object.assign(textRef.current.style, styles);
    textRef.current.innerText = element.innerText;
  };

  const makeParticles = (element: HTMLElement) => {
    if (reducedMotion) return;
    const d: [number, number] = particleDistances;
    const r = particleR;
    const bubbleTime = animationTime * 2 + timeVariance;
    element.style.setProperty('--time', `${bubbleTime}ms`);
    element.classList.remove('active');

    for (let i = 0; i < particleCount; i++) {
      const t = animationTime * 2 + noise(timeVariance * 2);
      const rotate = noise(r / 10);
      const p = {
        start: getXY(d[0], particleCount - i, particleCount),
        end: getXY(d[1] + noise(7), particleCount - i, particleCount),
        time: t,
        scale: 1 + noise(0.2),
        color: colors[Math.floor(Math.random() * colors.length)],
        rotate: rotate > 0 ? (rotate + r / 20) * 10 : (rotate - r / 20) * 10,
      };

      setTimeout(() => {
        const particle = document.createElement('span');
        const point = document.createElement('span');
        particle.classList.add('gooey-particle');
        particle.style.setProperty('--start-x', `${p.start[0]}px`);
        particle.style.setProperty('--start-y', `${p.start[1]}px`);
        particle.style.setProperty('--end-x', `${p.end[0]}px`);
        particle.style.setProperty('--end-y', `${p.end[1]}px`);
        particle.style.setProperty('--time', `${p.time}ms`);
        particle.style.setProperty('--scale', `${p.scale}`);
        particle.style.setProperty('--color', `var(--color-${p.color}, #C9A84C)`);
        particle.style.setProperty('--rotate', `${p.rotate}deg`);
        point.classList.add('gooey-point');
        particle.appendChild(point);
        element.appendChild(particle);
        requestAnimationFrame(() => element.classList.add('active'));
        setTimeout(() => {
          try { element.removeChild(particle); } catch { /* element already removed */ }
        }, t);
      }, 30);
    }
  };

  const handleClick = (liEl: HTMLElement, index: number) => {
    if (activeIndex === index) return;

    updateEffectPosition(liEl);

    if (filterRef.current) {
      filterRef.current.querySelectorAll('.gooey-particle').forEach(p => p.remove());
    }

    if (textRef.current) {
      textRef.current.classList.remove('active');
      void textRef.current.offsetWidth;
      textRef.current.classList.add('active');
    }

    if (filterRef.current) {
      makeParticles(filterRef.current);
    }

    onNavigate(items[index].screen);
  };

  useEffect(() => {
    if (!navRef.current || !containerRef.current) return;
    const activeLi = navRef.current.querySelectorAll('li')[activeIndex] as HTMLElement | undefined;
    if (activeLi) {
      updateEffectPosition(activeLi);
      textRef.current?.classList.add('active');
    }

    const resizeObserver = new ResizeObserver(() => {
      const currentLi = navRef.current?.querySelectorAll('li')[activeIndex] as HTMLElement | undefined;
      if (currentLi) updateEffectPosition(currentLi);
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reposition when the item list itself changes
  }, [activeIndex, visibleItems]);

  return (
    <div ref={trackRef} className="gooey-nav-track">
      {/* Measurement probe: real widths for every item, invisible and untabbable. */}
      <div
        ref={probeRef}
        aria-hidden="true"
        className="gooey-nav-probe"
      >
        {items.map((item) => (
          <span key={item.screen}>{item.label}</span>
        ))}
      </div>

      <div className="gooey-nav-container" ref={containerRef}>
      <nav aria-label="Main navigation">
        <ul ref={navRef}>
          {visibleItems.map((item, index) => (
            <li
              key={item.screen}
              className={activeIndex === index ? 'active' : ''}
              onClick={(e) => handleClick(e.currentTarget, index)}
            >
              <button
                type="button"
                aria-current={activeIndex === index ? 'page' : undefined}
                onMouseEnter={() => onIntent?.(item.screen)}
                onFocus={() => onIntent?.(item.screen)}
                onPointerDown={() => onIntent?.(item.screen)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick(e.currentTarget.parentElement as HTMLElement, index);
                  }
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <span className="effect filter" ref={filterRef} />
      <span className="effect text" ref={textRef} />
      </div>

      {result.hasOverflow && (
        <NavOverflowMenu
          items={overflowItems}
          currentScreen={currentScreen}
          onNavigate={onNavigate}
          onIntent={onIntent}
          triggerRef={triggerRef}
        />
      )}
    </div>
  );
}
