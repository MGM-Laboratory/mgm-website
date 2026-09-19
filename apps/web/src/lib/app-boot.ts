let appHasBooted = false;

/**
 * Called once, from a component mounted at the root layout so it persists
 * across every client-side navigation. A hard reload re-evaluates this
 * module from scratch, resetting it back to false — which is exactly what
 * distinguishes a fresh visit (or a reload) from the user navigating back
 * to a page internally within an already-running session.
 */
export function markAppBooted() {
  appHasBooted = true;
}

/**
 * Read synchronously during a component's first render (not from an effect,
 * and never from inside an async callback) — see hero.tsx, which captures
 * this into a ref up front specifically so a later `.then()` callback sees
 * the value as it was at mount, not whatever it's become by the time that
 * promise resolves.
 */
export function hasAppAlreadyBooted() {
  return appHasBooted;
}
