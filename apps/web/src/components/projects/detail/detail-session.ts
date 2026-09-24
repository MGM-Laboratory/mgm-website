/**
 * Detail page state that outlives one page instance. Module state survives
 * client-side navigation and resets on a hard load, like
 * `lib/project-transition.ts`.
 *
 * - Arrival: the next-project hand-off ends on a full-screen panel in the
 *   next project's colours with its title already in the title's place.
 *   The page it navigates to reads this note while rendering, so its first
 *   frame matches that last one (background, title shown), and only the
 *   rest of the page fades in.
 * - Hint: "Scroll to explore" leaves after the first scroll of the session
 *   and doesn't come back on later projects.
 */

const ARRIVAL_TTL_MS = 10_000;

let arrival: { slug: string; at: number } | undefined;
let hintDismissed = false;

/** The hand-off to `slug` finished and navigation starts now. */
export function noteNextArrival(slug: string) {
  arrival = { slug, at: performance.now() };
}

/**
 * Whether the page for `slug` is being entered from the previous project's
 * hand-off. Read-only (safe to call during render, even twice under Strict
 * Mode); the page clears it with `clearNextArrival` once mounted.
 */
export function isNextArrival(slug: string) {
  return Boolean(
    arrival && arrival.slug === slug && performance.now() - arrival.at < ARRIVAL_TTL_MS,
  );
}

export function clearNextArrival(slug: string) {
  if (arrival?.slug === slug) arrival = undefined;
}

export function isScrollHintDismissed() {
  return hintDismissed;
}

export function dismissScrollHint() {
  hintDismissed = true;
}
