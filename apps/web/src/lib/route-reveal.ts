/** Who covers the page: the route curtain (and the articles portal), or the site loader. */
export type RouteCover = "curtain" | "loader";

const covers = new Set<RouteCover>();
let waiters: Array<() => void> = [];
const changeListeners = new Set<() => void>();

/**
 * Shared signal between whatever covers the page and the entrance
 * animations that must not start until the page is actually visible: the
 * full-screen route curtain marks itself as covering on navigation and as
 * fully revealed once its reveal timeline completes, the site loader does
 * the same on a first visit, and page components await the reveal before
 * playing their entrances.
 *
 * Each cover is kept under its own key, so one cover lifting can never
 * release another: a navigation that starts under the loader keeps waiting
 * for the curtain, and the loader opening keeps nothing waiting that the
 * curtain still covers. The page counts as covered while any cover is on.
 *
 * Module-level state survives client-side navigation (the covers and the
 * pages share one session) and resets on a hard reload. Without a loader no
 * cover is on after a fresh load, so waiters resolve immediately.
 */

function notifyChange() {
  for (const listener of [...changeListeners]) listener();
}

/** The given cover (the route curtain unless named) just started covering the page. */
export function markRouteCoverStarted(cover: RouteCover = "curtain") {
  const changed = covers.size === 0;
  covers.add(cover);
  if (changed) notifyChange();
}

/** The given cover (the route curtain unless named) has fully revealed the page. */
export function markRouteRevealDone(cover: RouteCover = "curtain") {
  if (!covers.delete(cover) || covers.size > 0) return;
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve();
  notifyChange();
}

/** Resolves now when nothing covers the page, else when the last cover has revealed it. */
export function waitForRouteReveal(): Promise<void> {
  if (covers.size === 0) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

/** Whether anything covers the page right now (the adaptive header holds still). */
export function isRouteCoverActive() {
  return covers.size > 0;
}

/** Calls `listener` whenever the page goes from uncovered to covered or back. Returns the unsubscribe. */
export function onRouteCoverChange(listener: () => void) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}
