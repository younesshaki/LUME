/** Pure geometry and snapshot preparation for the admin theme reveal. */

export type TransitionVariant =
  | "circle"
  | "square"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "rectangle"
  | "star";

export const TRANSITION_OVERSCAN_PX = 24;

export function polygonCollapsed(cx: number, cy: number, vertexCount: number): string {
  return `polygon(${Array.from({ length: vertexCount }, () => `${cx}px ${cy}px`).join(", ")})`;
}

export function maxRevealRadius(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  return Math.ceil(
    Math.hypot(Math.max(x, viewportWidth - x), Math.max(y, viewportHeight - y)),
  ) + TRANSITION_OVERSCAN_PX;
}

export function getThemeTransitionClipPaths(
  variant: TransitionVariant,
  cx: number,
  cy: number,
  maxRadius: number,
  viewportWidth: number,
  viewportHeight: number,
): [string, string] {
  switch (variant) {
    case "square": {
      const halfSide = Math.max(
        Math.max(cx, viewportWidth - cx),
        Math.max(cy, viewportHeight - cy),
      ) * 1.05;
      return [polygonCollapsed(cx, cy, 4), `polygon(${[
        `${cx - halfSide}px ${cy - halfSide}px`,
        `${cx + halfSide}px ${cy - halfSide}px`,
        `${cx + halfSide}px ${cy + halfSide}px`,
        `${cx - halfSide}px ${cy + halfSide}px`,
      ].join(", ")})`];
    }
    case "triangle": {
      const scale = maxRadius * 2.2;
      const dx = (Math.sqrt(3) / 2) * scale;
      return [polygonCollapsed(cx, cy, 3), `polygon(${[
        `${cx}px ${cy - scale}px`,
        `${cx + dx}px ${cy + 0.5 * scale}px`,
        `${cx - dx}px ${cy + 0.5 * scale}px`,
      ].join(", ")})`];
    }
    case "diamond": {
      const radius = maxRadius * Math.SQRT2;
      return [polygonCollapsed(cx, cy, 4), `polygon(${[
        `${cx}px ${cy - radius}px`,
        `${cx + radius}px ${cy}px`,
        `${cx}px ${cy + radius}px`,
        `${cx - radius}px ${cy}px`,
      ].join(", ")})`];
    }
    case "hexagon": {
      const radius = maxRadius * Math.SQRT2;
      const vertices = Array.from({ length: 6 }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI) / 3;
        return `${cx + radius * Math.cos(angle)}px ${cy + radius * Math.sin(angle)}px`;
      });
      return [polygonCollapsed(cx, cy, 6), `polygon(${vertices.join(", ")})`];
    }
    case "rectangle": {
      const halfWidth = Math.max(cx, viewportWidth - cx);
      const halfHeight = Math.max(cy, viewportHeight - cy);
      return [polygonCollapsed(cx, cy, 4), `polygon(${[
        `${cx - halfWidth}px ${cy - halfHeight}px`,
        `${cx + halfWidth}px ${cy - halfHeight}px`,
        `${cx + halfWidth}px ${cy + halfHeight}px`,
        `${cx - halfWidth}px ${cy + halfHeight}px`,
      ].join(", ")})`];
    }
    case "star": {
      const radius = maxRadius * Math.SQRT2 * 1.03;
      const star = (outerRadius: number) => {
        const vertices: string[] = [];
        for (let index = 0; index < 5; index += 1) {
          const outerAngle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
          const innerAngle = outerAngle + Math.PI / 5;
          vertices.push(`${cx + outerRadius * Math.cos(outerAngle)}px ${cy + outerRadius * Math.sin(outerAngle)}px`);
          vertices.push(`${cx + outerRadius * 0.42 * Math.cos(innerAngle)}px ${cy + outerRadius * 0.42 * Math.sin(innerAngle)}px`);
        }
        return `polygon(${vertices.join(", ")})`;
      };
      return [star(Math.max(2, radius * 0.025)), star(radius)];
    }
    case "circle":
    default:
      return [
        `circle(0px at ${cx}px ${cy}px)`,
        `circle(${maxRadius}px at ${cx}px ${cy}px)`,
      ];
  }
}

/**
 * Clone the rendered document into inert, script-free markup and apply the
 * destination theme to that clone. Running it in a same-origin sandboxed
 * iframe isolates light snapshots from a dark parent (and vice versa).
 */
export function buildThemeSnapshotMarkup(
  targetTheme: "light" | "dark",
  source: Document = document,
): string {
  const clone = source.documentElement.cloneNode(true) as HTMLElement;
  clone.classList.toggle("dark", targetTheme === "dark");
  clone.dataset.theme = targetTheme;
  clone.dataset.themeRevealSnapshot = targetTheme;
  clone.style.colorScheme = targetTheme;
  delete clone.dataset.magicuiThemeVt;

  clone.querySelectorAll(
    "script, noscript, link[rel='modulepreload'], link[rel='prefetch'], [data-theme-reveal-overlay]",
  ).forEach((node) => node.remove());

  const head = clone.querySelector("head");
  if (head) {
    head.querySelectorAll("base").forEach((node) => node.remove());
    const base = source.createElement("base");
    base.href = source.location.href;
    head.prepend(base);
    const freeze = source.createElement("style");
    freeze.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}";
    head.append(freeze);
  }

  return `<!doctype html>${clone.outerHTML}`;
}

export function rootMatchesTheme(root: HTMLElement, theme: "light" | "dark"): boolean {
  return root.classList.contains("dark") === (theme === "dark");
}
