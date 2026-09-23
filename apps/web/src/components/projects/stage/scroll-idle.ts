/**
 * Whether the page is still scrolling, for the covers' hover effects.
 * Browsers fire mouseenter on every element a scroll slides under a resting
 * cursor, which kicked the hover focus pull on card after card mid-scroll;
 * lusion only starts a hover while the page is idle. Scrolling counts as
 * settled once no scroll event has arrived for SETTLE_MS (Lenis and native
 * scrolling both emit one per moved frame).
 *
 * The scroll listener only exists while someone tracks it (the cover stage,
 * the DOM covers' hover), so it never outlives /projects.
 */

const SETTLE_MS = 120;

let users = 0;
let lastScroll = Number.NEGATIVE_INFINITY;
let timer = 0;
const waiters = new Set<() => void>();

function flush() {
  timer = 0;
  const pending = [...waiters];
  waiters.clear();
  for (const waiter of pending) waiter();
}

function onScroll() {
  lastScroll = performance.now();
  window.clearTimeout(timer);
  timer = window.setTimeout(flush, SETTLE_MS);
}

/** Starts tracking (reference counted); returns the release function. */
export function trackScrollIdle() {
  if (users++ === 0) window.addEventListener("scroll", onScroll, { passive: true });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users > 0) return;
    window.removeEventListener("scroll", onScroll);
    window.clearTimeout(timer);
    timer = 0;
    lastScroll = Number.NEGATIVE_INFINITY;
    waiters.clear();
  };
}

/** True when no scroll has happened for a moment (or nothing tracks it). */
export function isScrollIdle() {
  return performance.now() - lastScroll >= SETTLE_MS;
}

/** Calls back once scrolling has settled (right away if it has); cancelable. */
export function whenScrollIdle(callback: () => void) {
  if (isScrollIdle()) {
    callback();
    return () => {};
  }
  waiters.add(callback);
  return () => {
    waiters.delete(callback);
  };
}
