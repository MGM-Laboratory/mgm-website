/**
 * Signals shared by the project zoom transition (the overlay that carries a
 * card's cover from /projects into /projects/<slug> and back) and the two
 * pages it connects. The overlay lives in the root layout and outlives both
 * pages, so they coordinate through this module instead of props.
 *
 * - Cover: while the overlay covers the screen, a detail page that mounts
 *   underneath holds its entrance. `waitForProjectReveal()` resolves once
 *   the overlay starts clearing (immediately when no transition runs).
 * - Ready: the overlay holds its final frame until the detail page reports
 *   it can be shown (`markProjectPageReady`), bounded by a timeout, so a
 *   slow page never reveals half laid out.
 * - Return: going back to the list, the overlay leaves a note for the list
 *   page (`setProjectReturn`), which reads it synchronously while rendering
 *   (`peekProjectReturn`) to skip its intro, restore its scroll position
 *   and keep the target card's cover hidden until the overlay lands on it.
 *
 * Module state survives client-side navigation and resets on a hard load.
 * Promises resolve asynchronously, which keeps React Strict Mode's
 * rehearsal mount from acting on a stale value.
 */

type Waiter = () => void;

const cover = { active: false, waiters: [] as Waiter[] };
const ready = { slug: "", done: true, waiters: [] as Waiter[] };

export type ProjectReturn = {
  /** The project being left: the list lands the zoom-out on its card. */
  slug: string;
  /** The list's scroll position when it was left, if the visit started there. */
  scrollY?: number;
};

let pendingReturn: ProjectReturn | undefined;

function flush(waiters: Waiter[]) {
  for (const resolve of waiters.splice(0)) resolve();
}

/** The overlay has covered the screen; pages mounting now hold their entrance. */
export function markProjectCoverStarted() {
  cover.active = true;
  cover.waiters = [];
}

/** The overlay has started clearing (or was cancelled): entrances may play. */
export function markProjectRevealStarted() {
  if (!cover.active) return;
  cover.active = false;
  flush(cover.waiters);
}

export function isProjectCoverActive() {
  return cover.active;
}

/** Resolves once no project transition covers the page. */
export function waitForProjectReveal(): Promise<void> {
  if (!cover.active) return Promise.resolve();
  return new Promise((resolve) => cover.waiters.push(resolve));
}

/** The overlay starts waiting for the detail page of `slug` to be ready. */
export function expectProjectPage(slug: string) {
  ready.slug = slug;
  ready.done = false;
  ready.waiters = [];
}

/**
 * A detail page is laid out and its first screen of media can be shown.
 * Pages call it on every mount; only the page the overlay waits for counts.
 */
export function markProjectPageReady(slug: string) {
  if (ready.done || ready.slug !== slug) return;
  ready.done = true;
  flush(ready.waiters);
}

/** Resolves when the expected page is ready, or after `timeoutMs`. */
export function waitForProjectPage(timeoutMs: number): Promise<void> {
  if (ready.done) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timer);
      resolve();
    }
    ready.waiters.push(done);
  });
}

export function setProjectReturn(value: ProjectReturn | undefined) {
  pendingReturn = value;
}

/** The pending return note, if the list is being entered from a project. */
export function peekProjectReturn(): ProjectReturn | undefined {
  return pendingReturn;
}

/** Consumes the note once the zoom-out has landed (or was abandoned). */
export function clearProjectReturn() {
  pendingReturn = undefined;
}
