/**
 * Programmatic page scrolling that cooperates with whatever scroller the
 * current page runs. A page with its own JS smooth scroller (the /projects
 * wheel smoothing) registers it here; everyone else (the /projects hero
 * arrow, for one) scrolls through `scrollPageTo` instead of calling
 * `window.scrollTo` directly, which a running smooth scroller would
 * immediately fight back toward its own target.
 */

export type PageScrollTarget = number | Element;
export type PageScrollOptions = {
  /** Seconds; 0 jumps immediately. */
  duration?: number;
  /** Pixels added to the resolved target (negative leaves room above it). */
  offset?: number;
};

type PageScroller = (target: PageScrollTarget, options: PageScrollOptions) => void;

let scroller: PageScroller | null = null;

/** Installs the page's JS scroller; returns the uninstall function. */
export function setPageScroller(next: PageScroller) {
  scroller = next;
  return () => {
    if (scroller === next) scroller = null;
  };
}

function resolveY(target: PageScrollTarget, offset: number) {
  const y =
    typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
  return Math.max(0, y + offset);
}

/** Scrolls the page to `target`, through the registered scroller if any. */
export function scrollPageTo(target: PageScrollTarget, options: PageScrollOptions = {}) {
  if (scroller) {
    scroller(target, options);
    return;
  }
  const { duration = 1, offset = 0 } = options;
  window.scrollTo({ top: resolveY(target, offset), behavior: duration > 0 ? "smooth" : "auto" });
}
