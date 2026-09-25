/**
 * Signals shared by the articles world and everything it connects: the
 * library world under app/articles/layout.tsx (which plays the list to
 * article, article to list and article to article transitions inside one
 * persistent WebGL scene), the portal in the root layout (which carries a
 * visitor from any other page into the library and back out), the pages
 * themselves, and the site header. Like lib/project-transition.ts it stays
 * free of heavy imports: the route curtain loads it on every page.
 *
 * - Kinds: `articleTransitionKind(from, to)` names the transition a route
 *   change is. "open" (list to article), "close" (article to list) and
 *   "swap" (article to article) play inside the world; "portal-in" (any
 *   other page to an articles route) and "portal-out" (the reverse) play in
 *   the root-level portal.
 * - Popstate: the curtain leaves browser back and forward between paths
 *   these hosts handle to them (`claimsArticlePopstate`) while the host for
 *   that kind is mounted (under reduced motion the host lets it navigate
 *   natively).
 * - Cover: while a transition covers the screen, a page that mounts
 *   underneath holds its entrance until `waitForArticleReveal()` resolves.
 * - Arrival: the transition leaves a note saying how the next page is being
 *   entered (`noteArticleArrival`); pages read it synchronously while
 *   rendering (`peekArticleArrival`), so their first frame already matches
 *   the transition's last one.
 * - Return: closing an article leaves the list a note (`setArticleReturn`)
 *   with the card to bring back into view and the scroll position to
 *   restore. The list reads it during render, like the arrival note.
 * - List address: the list remembers its filtered URL when a card opens
 *   (`rememberArticleListHref`), so "back to articles" returns to the same
 *   filters.
 * - Busy: while any articles transition runs, the adaptive header hands
 *   its colours to the transition's palette walk and other transitions
 *   stand down (`isArticleTransitionBusy`).
 *
 * Module state survives client-side navigation and resets on a hard load.
 */

type Waiter = () => void;

export const ARTICLES_LIST_PATH = "/articles";
const DETAIL_PATH = /^\/articles\/([^/]+)\/?$/;

export type ArticleTransitionKind = "open" | "close" | "swap" | "portal-in" | "portal-out";

export type ArticleArrival = {
  /** How the page is being entered. "next" is the end-of-article hand-off. */
  kind: "open" | "close" | "swap" | "next" | "portal-in";
  /** The pathname the note is meant for; any other page ignores it. */
  pathname: string;
  /** The article being arrived at or returned from, when there is one. */
  slug?: string;
};

export type ArticleReturn = {
  /** The article being closed: the list brings its card back into view. */
  slug: string;
  /** The list's scroll position when the card was opened, if the visit started there. */
  scrollY?: number;
  /** Reduced motion: no transition, the list only restores its position. */
  restoreOnly?: boolean;
};

const cover = { active: false, waiters: [] as Waiter[] };
const ready = { pathname: "", done: true, waiters: [] as Waiter[] };
const busyListeners = new Set<() => void>();

let worldLayers = 0;
let portalLayers = 0;
let busy = false;
let arrival: (ArticleArrival & { at: number }) | undefined;
let pendingReturn: ArticleReturn | undefined;
let listHref = ARTICLES_LIST_PATH;

/** An arrival note older than this is stale (the navigation it announced never happened). */
const ARRIVAL_TTL_MS = 10_000;

function flush(waiters: Waiter[]) {
  for (const resolve of waiters.splice(0)) resolve();
}

// ---------------------------------------------------------------- paths

/** The slug of an article detail path, or null for any other path. */
export function articleDetailSlug(pathname: string) {
  const match = DETAIL_PATH.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** The list or an article: every path the library world covers. */
export function isArticlesPath(pathname: string) {
  return pathname === ARTICLES_LIST_PATH || articleDetailSlug(pathname) !== null;
}

/** Which articles transition a route change is, or null for none. */
export function articleTransitionKind(from: string, to: string): ArticleTransitionKind | null {
  if (from === to) return null;
  if (from.startsWith("/admin") || to.startsWith("/admin")) return null;
  const fromIn = isArticlesPath(from);
  const toIn = isArticlesPath(to);
  if (!fromIn && !toIn) return null;
  if (!fromIn) return "portal-in";
  if (!toIn) return "portal-out";
  const fromSlug = articleDetailSlug(from);
  const toSlug = articleDetailSlug(to);
  if (!fromSlug && toSlug) return "open";
  if (fromSlug && !toSlug) return "close";
  if (fromSlug && toSlug && fromSlug !== toSlug) return "swap";
  return null;
}

// ---------------------------------------------------------------- hosts

/** The library world registers while mounted; returns the unregister function. */
export function registerArticleWorldLayer() {
  worldLayers += 1;
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    worldLayers -= 1;
  };
}

/** The root-level portal registers while mounted; returns the unregister function. */
export function registerArticlePortalLayer() {
  portalLayers += 1;
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    portalLayers -= 1;
  };
}

export function isArticleWorldMounted() {
  return worldLayers > 0;
}

/**
 * Whether an articles host handles a browser back or forward between these
 * paths, so the route curtain stays out of it. In-world kinds need the
 * world mounted, portal kinds the portal. Both hosts let a reduced-motion
 * visit navigate natively themselves, and the curtain (installed while
 * motion was allowed, if the preference changed since) must never cover a
 * way into, out of or around the library.
 */
export function claimsArticlePopstate(from: string, to: string) {
  const kind = articleTransitionKind(from, to);
  if (!kind) return false;
  if (kind === "portal-in" || kind === "portal-out") return portalLayers > 0;
  return worldLayers > 0;
}

// ---------------------------------------------------------------- cover

/** A transition covers the screen; pages mounting now hold their entrance. */
export function markArticleCoverStarted() {
  cover.active = true;
  cover.waiters = [];
}

/** The transition has started revealing (or was cancelled): entrances may play. */
export function markArticleRevealStarted() {
  if (!cover.active) return;
  cover.active = false;
  flush(cover.waiters);
}

export function isArticleCoverActive() {
  return cover.active;
}

/** Resolves once no articles transition covers the page. */
export function waitForArticleReveal(): Promise<void> {
  if (!cover.active) return Promise.resolve();
  return new Promise((resolve) => cover.waiters.push(resolve));
}

// ---------------------------------------------------------------- ready

/** The transition starts waiting for the page at `pathname` to be ready. */
export function expectArticlePage(pathname: string) {
  ready.pathname = pathname;
  ready.done = false;
  ready.waiters = [];
}

/** A page is laid out and can be shown; only the expected page counts. */
export function markArticlePageReady(pathname: string) {
  if (ready.done || ready.pathname !== pathname) return;
  ready.done = true;
  flush(ready.waiters);
}

/**
 * Whether the expected page has said it is ready (or none is expected).
 * For hosts that poll from their own visible-time clock instead of a timer
 * (the portal: a background tab must not run its bounded waits out).
 */
export function isArticlePageReady() {
  return ready.done;
}

/** Resolves when the expected page is ready, or after `timeoutMs`. */
export function waitForArticlePage(timeoutMs: number): Promise<void> {
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

// ---------------------------------------------------------------- notes

export function noteArticleArrival(note: ArticleArrival) {
  arrival = { ...note, at: Date.now() };
}

/**
 * The arrival note for `pathname`, if a transition is bringing that page
 * in. Safe to call while rendering (read-only).
 */
export function peekArticleArrival(pathname: string): ArticleArrival | undefined {
  if (!arrival || arrival.pathname !== pathname) return undefined;
  if (Date.now() - arrival.at > ARRIVAL_TTL_MS) return undefined;
  return arrival;
}

export function clearArticleArrival(pathname?: string) {
  if (!pathname || arrival?.pathname === pathname) arrival = undefined;
}

export function setArticleReturn(value: ArticleReturn | undefined) {
  pendingReturn = value;
}

/** The pending return note, if the list is being entered from an article. */
export function peekArticleReturn(): ArticleReturn | undefined {
  return pendingReturn;
}

export function clearArticleReturn() {
  pendingReturn = undefined;
}

/** The list's address (with its filters) when a card was opened from it. */
export function rememberArticleListHref(href: string) {
  listHref = href.startsWith(ARTICLES_LIST_PATH) ? href : ARTICLES_LIST_PATH;
}

/** Where "back to articles" goes: the list as it was left, else the plain list. */
export function articleListHref() {
  return listHref;
}

// ---------------------------------------------------------------- busy

/** An articles transition is running (from take-over until its cleanup). */
export function setArticleTransitionBusy(active: boolean) {
  if (busy === active) return;
  busy = active;
  for (const listener of [...busyListeners]) listener();
}

export function isArticleTransitionBusy() {
  return busy;
}

/** Calls `listener` whenever `isArticleTransitionBusy()` may have changed. */
export function onArticleTransitionChange(listener: () => void) {
  busyListeners.add(listener);
  return () => {
    busyListeners.delete(listener);
  };
}
