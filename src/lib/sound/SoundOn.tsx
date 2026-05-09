/**
 * LUME Sound System — <SoundOn> declarative wrapper
 *
 * Wraps a single child element to fire a sound on click/hover/focus
 * without changing markup. Existing event handlers are preserved
 * (called after the sound is triggered).
 *
 * Usage:
 *   <SoundOn click="navbar.tab.click" hover="navbar.tab.hover">
 *     <button>Products</button>
 *   </SoundOn>
 *
 *   <SoundOn enter="showcase.enter" leave="showcase.exit">
 *     <ShowcasePanel />
 *   </SoundOn>
 */

import { Children, cloneElement, isValidElement, useEffect, type ReactElement } from "react";
import { play as enginePlay } from "./audioEngine";
import type { ActionKey } from "./actions";

type SoundOnProps = {
  click?: ActionKey;
  hover?: ActionKey;
  focus?: ActionKey;
  /** Fires on mount */
  enter?: ActionKey;
  /** Fires on unmount */
  leave?: ActionKey;
  children: ReactElement;
};

export function SoundOn({ click, hover, focus, enter, leave, children }: SoundOnProps) {
  useEffect(() => {
    if (enter) enginePlay(enter);
    return () => {
      if (leave) enginePlay(leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const child = Children.only(children);
  if (!isValidElement(child)) return child;

  type EventProps = {
    onClick?: (e: unknown) => void;
    onMouseEnter?: (e: unknown) => void;
    onFocus?: (e: unknown) => void;
  };

  const childProps = child.props as EventProps;
  const next: EventProps = {};

  if (click) {
    const original = childProps.onClick;
    next.onClick = (e: unknown) => {
      enginePlay(click);
      original?.(e);
    };
  }
  if (hover) {
    const original = childProps.onMouseEnter;
    next.onMouseEnter = (e: unknown) => {
      enginePlay(hover);
      original?.(e);
    };
  }
  if (focus) {
    const original = childProps.onFocus;
    next.onFocus = (e: unknown) => {
      enginePlay(focus);
      original?.(e);
    };
  }

  return cloneElement(child, next as Record<string, unknown>);
}
