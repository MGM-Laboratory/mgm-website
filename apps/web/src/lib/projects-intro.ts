/**
 * Choreography signals for the /projects page, shared by siblings that the
 * server-rendered page composes independently (the hero and the grid):
 *
 * 1. Intro: the hero's entrance plays alone, with scrolling locked and the
 *    project list hidden. `beginProjectsIntro()` opens a new intro (the
 *    hero calls it on mount), `finishProjectsIntro()` ends it (entrance
 *    complete, reduced motion, empty list, or a failsafe), and
 *    `waitForProjectsIntro()` resolves once it has ended.
 * 2. Grid reveal: after the intro, the grid decides how its covers render
 *    (WebGL stage or DOM fallback) and then fades the list in, calling
 *    `markGridRevealStarted()` at that moment. Per-card effects that must
 *    not play before the list is visible (category typing, title drop)
 *    await `waitForGridReveal()`.
 *
 * Module state survives client-side navigation, so each visit must open a
 * fresh intro: `beginProjectsIntro()` resets both signals. Waiters from a
 * previous visit belong to effects that were already cleaned up (they
 * check their own `cancelled` flag), so resolving them late is harmless.
 * Resolution is always async (a promise), which also keeps React Strict
 * Mode's synchronous mount/unmount/remount from acting on a stale value.
 */

type Signal = { done: boolean; waiters: Array<() => void> };

// Both start "done": a page that never opens an intro (or code that runs
// before the hero mounts) must never wait forever.
const intro: Signal = { done: true, waiters: [] };
const gridReveal: Signal = { done: true, waiters: [] };

function open(signal: Signal) {
  signal.done = false;
}

function settle(signal: Signal) {
  if (signal.done) return;
  signal.done = true;
  const pending = signal.waiters;
  signal.waiters = [];
  for (const resolve of pending) resolve();
}

function wait(signal: Signal): Promise<void> {
  if (signal.done) return Promise.resolve();
  return new Promise((resolve) => {
    signal.waiters.push(resolve);
  });
}

/** The hero is mounting: open a new intro (and a new pending grid reveal). */
export function beginProjectsIntro() {
  open(intro);
  open(gridReveal);
}

/** The intro has ended; the list may appear and scrolling is unlocked. */
export function finishProjectsIntro() {
  settle(intro);
}

export function isProjectsIntroDone() {
  return intro.done;
}

/** Resolves once the current intro has ended (immediately if none is open). */
export function waitForProjectsIntro(): Promise<void> {
  return wait(intro);
}

/** The grid has started fading the list in. */
export function markGridRevealStarted() {
  settle(gridReveal);
}

/** Resolves once the list has started appearing (immediately if no intro). */
export function waitForGridReveal(): Promise<void> {
  return wait(gridReveal);
}
