let transitionInProgress = false;
let waiters: Array<() => void> = [];
const changeListeners = new Set<() => void>();

/**
 * Shared signal between the full-screen route-transition curtain and the
 * entrance animations that must not start until the page is actually
 * visible again: the curtain marks itself as covering on navigation and as
 * fully revealed once its reveal timeline completes, and page components
 * await the reveal before playing their entrances.
 *
 * Module-level state survives client-side navigation (the curtain and the
 * pages share one session) and resets on a hard reload — on a fresh load no
 * cover ever started, so waiters resolve immediately.
 */

function notifyChange() {
  for (const listener of [...changeListeners]) listener();
}

/** The curtain just started covering the page (internal navigation). */
export function markRouteCoverStarted() {
  const changed = !transitionInProgress;
  transitionInProgress = true;
  if (changed) notifyChange();
}

/** The curtain's reveal timeline has fully completed: nothing covers the page. */
export function markRouteRevealDone() {
  const changed = transitionInProgress;
  transitionInProgress = false;
  const pending = waiters;
  waiters = [];
  for (const resolve of pending) resolve();
  if (changed) notifyChange();
}

/** Resolves now when no transition is in flight, else when the reveal completes. */
export function waitForRouteReveal(): Promise<void> {
  if (!transitionInProgress) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
  });
}

/** Whether the curtain covers the page right now (the adaptive header holds still). */
export function isRouteCoverActive() {
  return transitionInProgress;
}

/** Calls `listener` whenever the curtain starts covering or has revealed. Returns the unsubscribe. */
export function onRouteCoverChange(listener: () => void) {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}
