import { useSyncExternalStore } from "react";

/**
 * The visitor's live reduced-motion preference for the card text effects.
 * One MediaQueryList and one change listener serve every card, so a switch
 * in the OS setting reaches all fifteen footers in a single loop (one React
 * commit) instead of each card reacting on its own schedule.
 *
 * Effects gate on `motionAllowed()`, read live when they run, and list
 * `useMotionPreference()` in their dependencies only so a switch re-runs
 * them. The hook's value is not the gate: during hydration it reports the
 * server snapshot (motion allowed) until React re-renders with the real
 * value, and gating on it would briefly blank the text for a visitor who
 * already prefers reduced motion.
 */

const QUERY = "(prefers-reduced-motion: no-preference)";

let query: MediaQueryList | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

function getQuery() {
  query ??= window.matchMedia(QUERY);
  return query;
}

/** Whether decorative motion is allowed right now. Browser only. */
export function motionAllowed() {
  return getQuery().matches;
}

function subscribe(listener: () => void) {
  // The change listener exists only while some card is mounted, so leaving
  // /projects leaves nothing attached to the media query.
  if (!listeners.size) getQuery().addEventListener("change", notify);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) getQuery().removeEventListener("change", notify);
  };
}

/** Re-renders when the preference changes; use as an effect dependency. */
export function useMotionPreference() {
  return useSyncExternalStore(subscribe, motionAllowed, () => true);
}
