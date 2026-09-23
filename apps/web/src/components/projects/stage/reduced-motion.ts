/**
 * The visitor turning reduced motion on while /projects is open. Every
 * decorative effect here decides once, at mount, whether it runs; this is
 * how each one hears about a later switch and tears itself down to the
 * static page a reduced-motion visit gets. Turning it back off takes a
 * reload (effects never restart mid-visit, so nothing replays over a page
 * that is already scrolled and read).
 */

const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)";

export function motionAllowed() {
  return window.matchMedia(NO_PREFERENCE).matches;
}

/** Calls `listener` once, when reduced motion turns on; returns the unsubscribe. */
export function onReducedMotion(listener: () => void) {
  const query = window.matchMedia(NO_PREFERENCE);
  const onChange = () => {
    if (query.matches) return;
    query.removeEventListener("change", onChange);
    listener();
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
