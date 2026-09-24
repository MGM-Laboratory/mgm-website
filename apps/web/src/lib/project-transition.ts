/**
 * Signals shared by the project zoom transition (the overlay that carries a
 * card's cover from /projects into /projects/<slug> and back,
 * components/transition/project-transition.tsx) and the pages it connects.
 * The overlay lives in the root layout and outlives both pages, so they
 * coordinate through this module instead of props. It stays free of heavy
 * imports: the route curtain and the smooth scroller load it on every page.
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
 *   Under reduced motion the note only asks for the scroll position.
 * - Scroll reset: the root layout's smooth scroller jumps every new route
 *   to the top after the page's own layout effects. `skipScrollReset()`
 *   exempts one destination (the list restoring its position).
 * - Popstate: the curtain (route-transition.tsx) leaves browser back and
 *   forward between the list and a project, or between two projects, to
 *   the overlay, but only while the overlay is mounted and motion is
 *   allowed (`claimsProjectPopstate`).
 * - Busy: while the zoom runs, or a detail page's hand-off walks the
 *   header palette, the adaptive header (hooks/use-header-tone.ts) hands
 *   its colours back to the walk (`isProjectTransitionBusy`).
 *
 * Module state survives client-side navigation and resets on a hard load.
 * Promises resolve asynchronously, which keeps React Strict Mode's
 * rehearsal mount from acting on a stale value.
 */

import { motionAllowed } from "@/lib/reduced-motion";

type Waiter = () => void;

const cover = { active: false, waiters: [] as Waiter[] };
const ready = { slug: "", done: true, waiters: [] as Waiter[] };

export type ProjectReturn = {
  /** The project being left: the list lands the zoom-out on its card. */
  slug: string;
  /** The list's scroll position when it was left, if the visit started there. */
  scrollY?: number;
  /**
   * Reduced motion: no zoom-out, the list only restores its scroll
   * position (to the card) and otherwise renders as it always does.
   */
  restoreOnly?: boolean;
};

let pendingReturn: ProjectReturn | undefined;
let detailHandoff = false;
let zoomRunning = false;
const transitionListeners = new Set<() => void>();
let scrollResetSkip: string | null = null;
let layers = 0;

export const PROJECTS_LIST_PATH = "/projects";
const DETAIL_PATH = /^\/projects\/([^/]+)$/;

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

/** The next route change to `pathname` keeps its scroll position. */
export function skipScrollReset(pathname: string | null) {
  scrollResetSkip = pathname;
}

/**
 * Called by the smooth scroller on every route change: true when this
 * destination asked to keep its scroll position. Any route change uses up
 * the request, so a navigation that went elsewhere never leaves it armed.
 */
export function consumeScrollResetSkip(pathname: string) {
  const skip = scrollResetSkip === pathname;
  scrollResetSkip = null;
  return skip;
}

/** The slug of a project detail path, or null for any other path. */
export function projectDetailSlug(pathname: string) {
  const match = DETAIL_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // A malformed escape (/projects/%E0) is no project page.
    return null;
  }
}

export type ProjectTransitionKind = "enter" | "exit" | "swap";

/**
 * Which project transition a route change is: list to project ("enter"),
 * project to list ("exit"), project to another project ("swap"), or none.
 */
export function projectTransitionKind(from: string, to: string): ProjectTransitionKind | null {
  const fromSlug = projectDetailSlug(from);
  const toSlug = projectDetailSlug(to);
  if (from === PROJECTS_LIST_PATH && toSlug) return "enter";
  if (fromSlug && to === PROJECTS_LIST_PATH) return "exit";
  if (fromSlug && toSlug && fromSlug !== toSlug) return "swap";
  return null;
}

/** The overlay registers while mounted; returns the unregister function. */
export function registerProjectTransitionLayer() {
  layers += 1;
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    layers -= 1;
  };
}

/**
 * Whether the project overlay handles a browser back or forward between
 * these paths (the curtain then stays out of it). Only while the overlay is
 * mounted and motion is allowed: otherwise the curtain covers as usual.
 */
export function claimsProjectPopstate(from: string, to: string) {
  if (layers === 0 || !motionAllowed()) return false;
  return projectTransitionKind(from, to) !== null;
}

/**
 * A detail page's next-project hand-off is covering the screen (its wipe
 * runs and the navigation follows). While it does, the overlay swallows
 * clicks like it does during its own zoom: a Back pill or menu link clicked
 * mid-wipe would otherwise race the hand-off's navigation and lose.
 */
export function setDetailHandoffActive(active: boolean) {
  const changed = detailHandoff !== active;
  detailHandoff = active;
  if (changed) notifyTransitionChange();
}

export function isDetailHandoffActive() {
  return detailHandoff;
}

/**
 * The zoom is running: from the moment it takes over until its `finish()`,
 * which is later than `markProjectRevealStarted()` (the overlay still fades
 * out and walks the header palette after that).
 */
export function setProjectZoomRunning(running: boolean) {
  const changed = zoomRunning !== running;
  zoomRunning = running;
  if (changed) notifyTransitionChange();
}

/**
 * Whether a project transition drives the header's colours right now: the
 * zoom (its palette walk) or a detail page's next-project hand-off (its own
 * walk). The adaptive header hands its colours back while this holds.
 */
export function isProjectTransitionBusy() {
  return zoomRunning || detailHandoff;
}

/** Calls `listener` whenever `isProjectTransitionBusy()` may have changed. Returns the unsubscribe. */
export function onProjectTransitionChange(listener: () => void) {
  transitionListeners.add(listener);
  return () => {
    transitionListeners.delete(listener);
  };
}

function notifyTransitionChange() {
  for (const listener of [...transitionListeners]) listener();
}
