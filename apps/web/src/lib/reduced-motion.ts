import { useSyncExternalStore } from "react";

/**
 * The visitor's live reduced-motion preference, shared by everything on a
 * page that has to react when the OS setting changes mid-visit. One
 * MediaQueryList and one change listener serve every subscriber, so a
 * switch reaches all of them in a single loop instead of each one on its
 * own schedule.
 *
 * - `motionAllowed()` reads the preference live: gate on it when an effect
 *   runs.
 * - `onReducedMotion(fn)` calls `fn` once, when reduced motion turns on:
 *   for effects that tear themselves down to the static page and don't
 *   restart mid-visit (the /projects cover stage and covers).
 * - `useMotionPreference()` re-renders on every switch: list it as an
 *   effect dependency so the effect re-runs (the /projects card text). It
 *   is not a gate: during hydration it reports the server snapshot (motion
 *   allowed) until React re-renders with the real value.
 */

const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)";

let query: MediaQueryList | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of [...listeners]) listener();
}

function getQuery() {
  query ??= window.matchMedia(NO_PREFERENCE);
  return query;
}

function subscribe(listener: () => void) {
  // The change listener exists only while someone subscribes, so leaving
  // the page leaves nothing attached to the media query.
  if (!listeners.size) getQuery().addEventListener("change", notify);
  listeners.add(listener);
  return () => {
    if (!listeners.delete(listener)) return;
    if (!listeners.size) getQuery().removeEventListener("change", notify);
  };
}

/** Whether decorative motion is allowed right now. Browser only. */
export function motionAllowed() {
  return getQuery().matches;
}

/** Calls `listener` once, when reduced motion turns on; returns the unsubscribe. */
export function onReducedMotion(listener: () => void) {
  const off = subscribe(() => {
    if (motionAllowed()) return;
    off();
    listener();
  });
  return off;
}

/** Re-renders when the preference changes; use as an effect dependency. */
export function useMotionPreference() {
  return useSyncExternalStore(subscribe, motionAllowed, () => true);
}
