import type { ArticlesWorldApi } from "@/components/articles/world/world-api";
import { getArticlesWorld, getWorldMode } from "@/components/articles/world/world-registry";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import type { PortalGl } from "@/components/transition/articles-portal-gl";
import { portalHeaderColors, portalPalette } from "@/components/transition/articles-portal-palette";
import type {
  PortalDirection,
  PortalStage,
  PortalTier,
} from "@/components/transition/articles-portal-stage";
import { HeaderTint, type ThemeColors } from "@/components/transition/project-zoom-colors";
import {
  articleDetailSlug,
  articleTransitionKind,
  clearArticleArrival,
  expectArticlePage,
  isArticlePageReady,
  isArticlesPath,
  isArticleTransitionBusy,
  markArticlePageReady,
  noteArticleArrival,
  setArticleTransitionBusy,
} from "@/lib/article-transition";
import { isProjectTransitionBusy } from "@/lib/project-transition";
import { PROJECT_THEMES } from "@/lib/project-themes";
import { motionAllowed } from "@/lib/reduced-motion";
import { isRouteCoverActive, markRouteCoverStarted, markRouteRevealDone } from "@/lib/route-reveal";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";

/**
 * The portal between the site and the articles library (mounted by
 * articles-portal.tsx in the root layout). It takes every navigation from
 * any other page into /articles or /articles/<slug> ("in") and from there
 * back out ("out"): link clicks through a window capture listener, and
 * browser back and forward through its own popstate listener (the route
 * curtain leaves those to it, see `claimsArticlePopstate`).
 *
 * The flow of a run, on one visible-time clock (a background tab pauses
 * it, and a software renderer's slow frames can't stretch it the way
 * GSAP's lag smoothing would):
 *
 * 1. load: a click that arrives before the stage chunk has loaded waits
 *    for it, briefly (it is warmed on intent: hovering, focusing or
 *    touching a link that leads through the portal). Past that, a plain
 *    cover plays instead.
 * 2. cover: the stage plays until the screen is covered, then gives the
 *    page's own elements back and the route is pushed (never earlier: a
 *    route committed under a half-drawn cover shows through it).
 * 3. hold: the covered screen waits, bounded, for the route to commit, the
 *    page to say it is ready and (in) the library world to decide its mode.
 * 4. reveal: the stage uncovers the destination, and `markRouteRevealDone`
 *    fires once the page is plainly visible, so its entrance plays as the
 *    cover clears.
 *
 * Back or forward covers at once, in the same task as the browser's
 * navigation, with a plain cover in the portal's colour that the stage
 * takes over when it can.
 *
 * Input is blocked the whole time (an inline `pointer-events` on the
 * portal's full-screen layer, which sits above the header and its menu,
 * and every click swallowed in the capture listener: programmatic clicks
 * ignore pointer-events). `finish()` ends every run, however it ended, and
 * releases everything it took.
 *
 * Under reduced motion nothing animates: links navigate plainly (through
 * the router, so the route curtain never covers a way into the library).
 */

const LOCK_OWNER = "articles-portal";
/** Above the header (50) and its menu, below the route curtain (999). */
const Z_INDEX = 60;
/** A cold click waits this long (visible time) for the stage chunk before the plain cover plays. */
const STAGE_WAIT = 0.35;
/** ...and this long for the WebGL renderer being built, before the DOM one plays. */
const GL_WAIT = 0.15;
/** Held covered this long without the route committing: give up and uncover the page. */
const COMMIT_CEILING = 12;
/** Held this long (a slow network), the cover shows that the library is still writing the page. */
const WAITING_AFTER = 1.2;
/**
 * Holding covered after the route commits, in seconds of visible time:
 * - content: for the destination's loading shell to give way to its content;
 * - page (in): once the content is in, for the page to say it is ready;
 * - world (in): for the library world to decide its mode (its host fails
 *   over to the DOM list at 6 s, far past this);
 * - cap: whatever is still missing, the portal uncovers after this long.
 * The DOM ones keep a visitor without WebGL (and the e2e suite, which
 * clicks the header logo 3.2 s after entering the library) well inside
 * three seconds for the whole way in.
 */
const HOLD = {
  gl: { content: 1.2, page: 0.45, world: 1.2, cap: 1.5 },
  dom: { content: 0.8, page: 0.3, world: 0.6, cap: 1.0 },
} as const;
/** The plain cover, when no stage could load. */
const PLAIN_COVER = 0.35;
const PLAIN_REVEAL = 0.4;
/** The plain cover's share of its reveal after which the page is the visitor's again. */
const PLAIN_INTERACTIVE = 0.75;
/** Undoing a cover the route never followed. */
const REWIND_SECONDS = 0.4;
/**
 * Idle warming, once the page has settled. On a library page any link may
 * leave it, so everything loads (the WebGL layer too). Elsewhere only the
 * stage's script loads, later: every page links into the library (the
 * menu does), a touch has no hover to warm on, and building the WebGL
 * layer (a context and three programs) waits for real intent.
 */
const WARM_IDLE_MS = { library: 1500, elsewhere: 2500 } as const;

type Phase = "load" | "cover" | "hold" | "reveal" | "rewind";

type StageModule = typeof import("@/components/transition/articles-portal-stage");

type Run = {
  direction: PortalDirection;
  /** The pathname the run started from, and the one it goes to. */
  source: string;
  target: string;
  /** What to push (null: the browser already navigated, back or forward). */
  href: string | null;
  instant: boolean;
  dark: boolean;
  /** Forces the DOM renderer (?noworld, the dev probe). */
  dom: boolean;
  phase: Phase;
  /** Seconds into the current phase. */
  t: number;
  /** Seconds covered and waiting, in total and since the route committed. */
  held: number;
  sinceCommit: number;
  /** ...and since its content arrived (its loading shell gone). */
  sinceContent: number;
  settleFrames: number;
  pushed: boolean;
  committed: boolean;
  /** Undoing (the route went back to the source): no theme, no push. */
  aborting: boolean;
  rewindFrom: number;
  stage: PortalStage | null;
  /** No stage: the plain cover plays for the whole run. */
  plain: boolean;
  signalled: boolean;
  /** The page is the visitor's again (the reveal's last beat still draws). */
  released: boolean;
  /** In: the article's theme, read once its page has committed. */
  theme: ThemeColors | null;
  log: RunLog;
};

type RunLog = {
  direction: PortalDirection;
  instant: boolean;
  renderer: "gl" | "dom" | "plain" | null;
  pushedAt: number | null;
  committedAt: number | null;
  revealAt: number | null;
  signalAt: number | null;
  releasedAt: number | null;
  finishedAt: number | null;
  started: number;
  aborted: boolean;
};

export type PortalControllerOptions = {
  navigate: (href: string) => void;
  /** Fetches a route's full payload ahead of the navigation. */
  prefetch: (href: string) => void;
  pathname: string;
};

function fit(t: number, from: number, to: number) {
  if (to <= from) return t >= to ? 1 : 0;
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function tier(): PortalTier {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency || 4;
  return coarse || cores <= 4 ? "low" : "high";
}

function portalKind(from: string, to: string): PortalDirection | null {
  const kind = articleTransitionKind(from, to);
  if (kind === "portal-in") return "in";
  if (kind === "portal-out") return "out";
  return null;
}

/** The same bail-outs as the route curtain's click filter. */
function navigationTarget(event: Event) {
  if (event instanceof MouseEvent) {
    if (event.defaultPrevented || event.button !== 0) return null;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  }
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const raw = anchor.getAttribute("href") ?? "";
  if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:")) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(raw, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname.startsWith("/admin") || window.location.pathname.startsWith("/admin")) {
    return null;
  }
  if (url.pathname === window.location.pathname) return null;
  return {
    pathname: url.pathname,
    href: url.pathname + url.search + url.hash,
    noworld: url.searchParams.has("noworld"),
  };
}

export class PortalController {
  private readonly navigate: PortalControllerOptions["navigate"];
  private readonly prefetch: PortalControllerOptions["prefetch"];
  private readonly tint = new HeaderTint();
  private run: Run | null = null;
  private shown: string;
  private root: HTMLElement | null = null;
  private plainCover: HTMLElement | null = null;
  private waiting: SVGSVGElement | null = null;
  private offTick: (() => void) | null = null;
  private lastTick = 0;
  private resumed = false;
  private stageModule: StageModule | null = null;
  private stageLoading: Promise<StageModule | null> | null = null;
  private gl: PortalGl | null = null;
  private glFailed = false;
  private glLoading: Promise<PortalGl | null> | null = null;
  private warmed = false;
  private warmTimer = 0;
  private disposed = false;
  private readonly reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Verification hooks (dev builds only).
  private slowdown = 1;
  private forceDom = false;
  private lastLog: RunLog | null = null;

  constructor({ navigate, prefetch, pathname }: PortalControllerOptions) {
    this.navigate = navigate;
    this.prefetch = prefetch;
    this.shown = pathname;
    window.addEventListener("click", this.onClick, true);
    window.addEventListener("popstate", this.onPopState);
    window.addEventListener("pointerover", this.onIntent, { capture: true, passive: true });
    window.addEventListener("pointerdown", this.onIntent, { capture: true, passive: true });
    window.addEventListener("touchstart", this.onIntent, { capture: true, passive: true });
    window.addEventListener("focusin", this.onIntent, true);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.reducedQuery.addEventListener("change", this.onMotionChange);
    this.scheduleWarm(pathname);
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, { __articlesPortal: this.debugView() });
    }
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("click", this.onClick, true);
    window.removeEventListener("popstate", this.onPopState);
    window.removeEventListener("pointerover", this.onIntent, true);
    window.removeEventListener("pointerdown", this.onIntent, true);
    window.removeEventListener("touchstart", this.onIntent, true);
    window.removeEventListener("focusin", this.onIntent, true);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.reducedQuery.removeEventListener("change", this.onMotionChange);
    window.clearTimeout(this.warmTimer);
    if (this.run) this.finish(this.run);
    if (process.env.NODE_ENV !== "production") {
      Reflect.deleteProperty(window, "__articlesPortal");
    }
  }

  /** The pathname on screen changed (a route committed). */
  routeChanged(pathname: string) {
    this.shown = pathname;
    const run = this.run;
    if (run) {
      if (pathname === run.target && !run.aborting) {
        if (!run.committed) run.log.committedAt = performance.now() - run.log.started;
        run.committed = true;
      } else if (pathname !== run.source && pathname !== run.target) {
        // Something else navigated (it can't have been a click: they are
        // swallowed). Whatever brought it in owns the screen now.
        this.finish(run);
      }
    }
    this.scheduleWarm(pathname);
  }

  // ------------------------------------------------------------- triggers

  private readonly onClick = (event: MouseEvent) => {
    if (this.run && !this.run.released) {
      // Mid-portal every click is swallowed: nothing may navigate or
      // toggle under the cover, programmatic clicks included.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const link = navigationTarget(event);
    if (!link) return;
    const from = window.location.pathname;
    const direction = portalKind(from, link.pathname);
    if (!direction) return;
    if (isArticleTransitionBusy()) {
      // An in-library transition covers the screen: it swallows clicks too.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // The curtain or the project zoom is mid-flight: its own gate drops the click.
    if (isRouteCoverActive() || isProjectTransitionBusy()) return;
    event.preventDefault();
    if (!motionAllowed()) {
      // A plain navigation, but through the router: the route curtain
      // (installed while motion was allowed, if the preference changed
      // since) must never cover a way into or out of the library.
      this.navigate(link.href);
      return;
    }
    this.start(direction, from, link.pathname, link.href, link.noworld);
  };

  private readonly onPopState = () => {
    const to = window.location.pathname;
    const from = this.shown;
    const current = this.run;
    if (to === from) {
      // Back to the page still on screen: the route this run pushed never
      // committed, so undo the cover.
      if (current) this.abort(current);
      return;
    }
    const direction = portalKind(from, to);
    if (!direction || !motionAllowed()) {
      // Not ours (the curtain or the library's own transitions cover it),
      // or reduced motion (a native navigation).
      if (current) this.finish(current);
      return;
    }
    // Cover right away, in the same task as the browser's navigation,
    // before anything of the destination can paint.
    if (current) this.finish(current);
    this.start(
      direction,
      from,
      to,
      null,
      new URLSearchParams(window.location.search).has("noworld"),
    );
  };

  /** A link through the portal is about to be used: load what it needs. */
  private readonly onIntent = (event: Event) => {
    if ((this.run && !this.run.released) || this.disposed) return;
    const pointerDown = event.type === "pointerdown";
    if (this.warmed && !pointerDown) return;
    const link = navigationTarget(event);
    if (!link || !portalKind(window.location.pathname, link.pathname)) return;
    if (!motionAllowed()) return;
    this.warm();
    if (pointerDown) this.prefetch(link.href);
  };

  private readonly onResize = () => {
    this.run?.stage?.resize();
  };

  /** Reduced motion switched on mid-run: finish at once, still going where the visitor asked. */
  private readonly onMotionChange = () => {
    const run = this.run;
    if (!this.reducedQuery.matches || !run) return;
    if (!run.pushed && run.href && !run.aborting) this.push(run);
    this.finish(run);
  };

  private readonly onVisibility = () => {
    // The clock counts visible time only: the gap a hidden tab leaves is
    // not time the portal played.
    if (!document.hidden) this.resumed = true;
  };

  // ------------------------------------------------------------- the run

  private start(
    direction: PortalDirection,
    source: string,
    target: string,
    href: string | null,
    noworld: boolean,
  ) {
    // A run still fading out its last beat gives way at once.
    if (this.run) this.finish(this.run);
    const instant = href === null;
    const dark = isDark();
    const run: Run = {
      direction,
      source,
      target,
      href,
      instant,
      dark,
      dom: noworld || this.forceDom || new URLSearchParams(window.location.search).has("noworld"),
      phase: instant ? "hold" : "load",
      t: 0,
      held: 0,
      sinceCommit: 0,
      sinceContent: 0,
      settleFrames: 0,
      pushed: instant,
      committed: false,
      aborting: false,
      rewindFrom: 0,
      stage: null,
      plain: false,
      signalled: false,
      released: false,
      theme: null,
      log: {
        direction,
        instant,
        renderer: null,
        pushedAt: instant ? 0 : null,
        committedAt: null,
        revealAt: null,
        signalAt: null,
        releasedAt: null,
        finishedAt: null,
        started: performance.now(),
        aborted: false,
      },
    };
    this.run = run;

    // Take over: block input, lock the page, hold the header and every
    // entrance that waits for a route reveal.
    this.mountRoot(run);
    acquireScrollLock(LOCK_OWNER);
    setArticleTransitionBusy(true);
    markRouteCoverStarted();

    if (direction === "in") {
      expectArticlePage(target);
      noteArticleArrival({
        kind: "portal-in",
        pathname: target,
        slug: articleDetailSlug(target) ?? undefined,
      });
      this.tint.start(this.tint.current(), this.tint.theme(portalHeaderColors(dark)));
      if (instant) this.tint.set(1);
    }
    if (href) this.prefetch(href);
    this.warm();
    // The library's engine loads with the page; start fetching it now, in
    // parallel with the route's payload (the world host's own import then
    // resolves from the module cache).
    if (direction === "in" && !run.dom && this.gl) {
      void import("@/components/articles/world/engine").catch(() => undefined);
    }

    this.lastTick = 0;
    this.offTick?.();
    this.offTick = addFrameCallback("scroll", this.tick);
    // A warm portal starts in this very frame.
    if (this.canBuildStage(run)) this.buildStage(run);
  }

  private readonly tick = () => {
    const run = this.run;
    if (!run) return;
    const now = performance.now();
    let dt = this.lastTick ? (now - this.lastTick) / 1000 : 0;
    this.lastTick = now;
    if (this.resumed) {
      dt = 0;
      this.resumed = false;
    }
    dt = Math.min(dt, 0.5) / this.slowdown;
    run.t += dt;
    try {
      this.step(run, dt, now);
    } catch (error) {
      this.recover(run, error);
    }
  };

  /** One frame of the run (the tick guards it). */
  private step(run: Run, dt: number, now: number) {
    const world = this.worldTransition();

    if (run.stage?.lost && !run.plain) {
      // The WebGL layer died mid-run: the plain cover stands in, fully
      // covering from here, and uncovers with the reveal.
      run.plain = true;
      run.stage.end();
      run.stage = null;
      this.setPlain(1);
    }

    switch (run.phase) {
      case "load": {
        if (this.canBuildStage(run)) this.buildStage(run);
        else if (run.t >= STAGE_WAIT) {
          run.plain = true;
          run.log.renderer = "plain";
          this.enter(run, "cover");
        }
        break;
      }
      case "cover": {
        let covered: boolean;
        if (run.stage) {
          run.stage.cover(run.t, dt, world);
          covered = run.t >= run.stage.coverSeconds;
        } else {
          this.setPlain(fit(run.t, 0, PLAIN_COVER));
          covered = run.t >= PLAIN_COVER;
        }
        if (run.direction === "in") {
          const seconds = run.stage?.coverSeconds ?? PLAIN_COVER;
          this.tint.set(fit(run.t, 0.1 * seconds, 0.8 * seconds));
        }
        if (covered) {
          run.stage?.release();
          this.push(run);
          this.enter(run, "hold");
        }
        break;
      }
      case "hold": {
        if (!run.stage && !run.plain) {
          // An instant cover waits in the plain colour for the stage.
          if (this.stageModule) this.buildStage(run);
          else if (run.held >= STAGE_WAIT) run.plain = true;
        }
        run.held += dt;
        if (run.committed) run.sinceCommit += dt;
        run.stage?.hold(dt, world);
        if (run.held >= WAITING_AFTER) this.showWaiting(run);
        if (this.ready(run, dt)) this.beginReveal(run);
        else if (!run.committed && run.held >= COMMIT_CEILING) this.abort(run);
        break;
      }
      case "reveal": {
        const seconds = run.stage?.revealSeconds ?? PLAIN_REVEAL;
        const signal = run.stage?.revealSignal ?? PLAIN_REVEAL * 0.5;
        if (run.stage) run.stage.reveal(run.t, dt, run.released ? null : world);
        else this.setPlain(1 - fit(run.t, 0, PLAIN_REVEAL));
        if (run.theme && !run.released) this.tint.set(fit(run.t, 0, 0.7 * seconds));
        if (!run.signalled && run.t >= signal) {
          run.signalled = true;
          run.log.signalAt = now - run.log.started;
          markRouteRevealDone();
        }
        const interactive = run.stage?.interactiveShare ?? PLAIN_INTERACTIVE;
        if (!run.released && run.t >= interactive * seconds) this.letGo(run);
        if (run.t >= seconds) this.finish(run);
        break;
      }
      case "rewind": {
        // Plays the cover backwards to where it began.
        const k = fit(run.t, 0, REWIND_SECONDS);
        const at = run.rewindFrom * (1 - k);
        const seconds = run.stage?.coverSeconds ?? PLAIN_COVER;
        if (run.stage) run.stage.cover(at, dt, world);
        else this.setPlain(fit(at, 0, PLAIN_COVER));
        if (run.direction === "in") this.tint.set(fit(at, 0.1 * seconds, 0.8 * seconds));
        if (k >= 1) this.finish(run);
        break;
      }
    }
  }

  /**
   * Something in the stage threw (an unusual page, a driver quirk): the
   * page is given back from under it and the plain cover carries the run
   * on to the destination. A second failure ends the run outright, so a
   * fault can never leave the site locked under a cover.
   */
  private recover(run: Run, error: unknown) {
    if (process.env.NODE_ENV !== "production") console.error("[articles-portal]", error);
    if (this.run !== run) return;
    if (run.plain) {
      if (!run.pushed && run.href) this.push(run);
      this.finish(run);
      return;
    }
    run.plain = true;
    run.log.renderer = "plain";
    const stage = run.stage;
    run.stage = null;
    try {
      stage?.end();
    } catch {
      // Its layers go with the portal's own layer in finish().
    }
    this.setPlain(run.phase === "load" || run.phase === "rewind" ? 0 : 1);
    if (run.phase === "load") this.enter(run, "cover");
  }

  /** Covered and waiting: may the destination be shown now? */
  private ready(run: Run, dt: number) {
    if (!run.committed) return false;
    const hold = HOLD[run.stage?.renderer ?? "dom"];
    // The route commits with its loading shell when its content isn't
    // there yet: the content has arrived once the shell's sentinel is gone.
    const content =
      !document.querySelector("[data-route-loading]") || run.sinceCommit >= hold.content;
    if (content) run.sinceContent += dt;
    let ready = content;
    if (ready && run.direction === "in") {
      const page = isArticlePageReady() || run.sinceContent >= hold.page;
      const world = getWorldMode() !== "pending" || run.sinceCommit >= hold.world;
      ready = page && world;
    }
    if (!ready && run.sinceCommit < hold.cap) return false;
    // One more frame, for the page (and the world) to lay out and draw.
    run.settleFrames += 1;
    return run.settleFrames > 1;
  }

  private beginReveal(run: Run) {
    run.log.revealAt = performance.now() - run.log.started;
    this.hideWaiting();
    if (run.direction === "in") {
      // An article wears its theme: the header walks on to it as the fog
      // clears (the page's own stylesheet carries the same values, so the
      // release at the end changes nothing).
      const id = document.querySelector<HTMLElement>("[data-article-detail]")?.dataset.articleTheme;
      const theme = id ? PROJECT_THEMES[id as keyof typeof PROJECT_THEMES] : undefined;
      if (theme) {
        const palette = isDark() ? theme.dark : theme.light;
        run.theme = palette;
        this.tint.start(this.tint.current(), this.tint.theme(palette));
      }
    }
    this.enter(run, "reveal");
  }

  private push(run: Run) {
    if (run.pushed || !run.href) return;
    run.pushed = true;
    run.log.pushedAt = performance.now() - run.log.started;
    this.navigate(run.href);
  }

  private enter(run: Run, phase: Phase) {
    run.phase = phase;
    run.t = 0;
  }

  /**
   * Undoes a run whose route won't follow (back to the page on screen, or
   * a route that never committed): a cover that hasn't hidden the page yet
   * plays backwards; one that has uncovers the page it hides.
   */
  private abort(run: Run) {
    if (this.run !== run || run.aborting) return;
    run.aborting = true;
    run.log.aborted = true;
    run.theme = null;
    if (run.direction === "in") clearArticleArrival(run.target);
    if (run.phase === "load") {
      this.finish(run);
      return;
    }
    if (run.phase === "cover") {
      run.rewindFrom = run.t;
      this.enter(run, "rewind");
      return;
    }
    if (run.phase === "hold") this.enter(run, "reveal");
  }

  /**
   * Hands the page back: input, scroll, the header and the library's
   * camera. Runs at the reveal's interactive point, or from finish() for a
   * run that ended before it. Idempotent per run.
   */
  private letGo(run: Run) {
    if (run.released) return;
    run.released = true;
    run.log.releasedAt = performance.now() - run.log.started;
    if (this.root) {
      this.root.style.pointerEvents = "none";
      this.root.style.touchAction = "";
    }
    releaseScrollLock(LOCK_OWNER);
    // The page under the portal carries the palette the header ended on.
    this.tint.release();
    const world = this.worldTransition();
    if (world) {
      world.setLift(0);
      world.setDolly(0);
      world.setFogSwallow(0);
    }
    if (run.direction === "in") clearArticleArrival(run.target);
    markRouteRevealDone();
    // Last: the header samples again, and other transitions may run.
    setArticleTransitionBusy(false);
  }

  /**
   * Ends a run, however it ended (revealed, undone, replaced by another,
   * unmounted): every lock, block, inline value, layer, note and signal it
   * held is released here.
   */
  private finish(run: Run) {
    if (this.run !== run) return;
    this.run = null;
    run.log.finishedAt = performance.now() - run.log.started;
    this.lastLog = run.log;
    this.offTick?.();
    this.offTick = null;
    run.stage?.end();
    run.stage = null;
    this.root?.remove();
    this.root = null;
    this.plainCover = null;
    this.waiting = null;
    this.letGo(run);
  }

  // ------------------------------------------------------------- layers

  /** The portal's full-screen layer: blocks input, holds the plain cover and the stage's front. */
  private mountRoot(run: Run) {
    this.root?.remove();
    const root = document.createElement("div");
    root.setAttribute("aria-hidden", "true");
    root.dataset.articlesPortal = run.direction;
    // Inline, never a class: see docs/page-transition.md.
    Object.assign(root.style, {
      position: "fixed",
      inset: "0",
      zIndex: String(Z_INDEX),
      overflow: "hidden",
      pointerEvents: "auto",
      touchAction: "none",
    });
    const cover = document.createElement("div");
    const palette = portalPalette(run.dark);
    Object.assign(cover.style, {
      position: "absolute",
      inset: "0",
      background: run.direction === "in" ? palette.fog : palette.paper,
      opacity: run.instant ? "1" : "0",
    });
    root.appendChild(cover);
    document.body.appendChild(root);
    this.root = root;
    this.plainCover = cover;
  }

  /**
   * A slow destination: a line of ink writing itself and fading, over and
   * over, low on the cover (the library is still writing the page). Web
   * Animations, so it needs no stylesheet, and it lives in the portal's
   * layer, so it goes with it.
   */
  private showWaiting(run: Run) {
    if (this.waiting || !this.root) return;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 140 24");
    svg.setAttribute("width", "140");
    svg.setAttribute("height", "24");
    Object.assign(svg.style, {
      position: "absolute",
      left: "50%",
      bottom: "12vh",
      marginLeft: "-70px",
      overflow: "visible",
      opacity: "0",
    });
    const path = document.createElementNS(ns, "path");
    path.setAttribute(
      "d",
      "M4 16c10-9 16-9 20 0s10 9 16 0 10-12 17-3 9 9 16 0 11-10 18-1 10 8 17-1 10-9 16-1",
    );
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", run.dark ? "#EDEDED" : "#0E1116");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-dasharray", "170");
    svg.appendChild(path);
    this.root.appendChild(svg);
    this.waiting = svg;
    svg.animate([{ opacity: 0 }, { opacity: 0.42 }], { duration: 500, fill: "forwards" });
    path.animate(
      [
        { strokeDashoffset: 170 },
        { strokeDashoffset: 0, offset: 0.55 },
        { strokeDashoffset: -170 },
      ],
      { duration: 2200, iterations: Infinity, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
    );
  }

  private hideWaiting() {
    const waiting = this.waiting;
    if (!waiting) return;
    this.waiting = null;
    const fade = waiting.animate([{ opacity: 0.42 }, { opacity: 0 }], {
      duration: 250,
      fill: "forwards",
    });
    fade.onfinish = () => waiting.remove();
  }

  private setPlain(opacity: number) {
    if (this.plainCover) this.plainCover.style.opacity = opacity.toFixed(3);
  }

  private canBuildStage(run: Run) {
    if (!this.stageModule) return false;
    if (run.dom || this.glFailed || this.gl) return true;
    // The WebGL renderer is still being built: wait for it, briefly.
    return run.t >= GL_WAIT || !this.glLoading;
  }

  private buildStage(run: Run) {
    const stages = this.stageModule;
    if (!stages || !this.root || run.stage) return;
    const gl = run.dom || !this.gl || this.gl.isLost ? null : this.gl;
    try {
      run.stage = stages.createPortalStage({
        direction: run.direction,
        instant: run.phase === "hold",
        dark: run.dark,
        tier: tier(),
        root: this.root,
        gl,
      });
    } catch (error) {
      this.recover(run, error);
      return;
    }
    run.log.renderer = run.stage.renderer;
    // The stage has drawn its first frame: an instant cover hands over.
    if (run.phase === "hold") this.setPlain(0);
    if (run.phase === "load") this.enter(run, "cover");
  }

  private worldTransition() {
    const world: ArticlesWorldApi | null = getArticlesWorld();
    return world ? world.transition : null;
  }

  // ------------------------------------------------------------- loading

  private warm() {
    this.warmed = true;
    void this.ensureStage();
    void this.ensureGl();
  }

  private ensureStage(): Promise<StageModule | null> {
    if (this.stageModule) return Promise.resolve(this.stageModule);
    this.stageLoading ??= import("@/components/transition/articles-portal-stage")
      .then((loaded) => {
        this.stageModule = loaded;
        return loaded;
      })
      .catch(() => {
        this.stageLoading = null;
        return null;
      });
    return this.stageLoading;
  }

  private ensureGl(): Promise<PortalGl | null> {
    if (this.gl && !this.gl.isLost) return Promise.resolve(this.gl);
    if (this.glFailed || this.disposed || !motionAllowed()) return Promise.resolve(null);
    this.glLoading ??= import("@/components/transition/articles-portal-gl")
      .then(({ PortalGl }) => {
        if (this.disposed) return null;
        const gl = PortalGl.create(() => {
          // A lost context: later runs use the DOM renderer.
          this.gl = null;
          this.glFailed = true;
        });
        if (gl) this.gl = gl;
        else this.glFailed = true;
        return gl;
      })
      .catch(() => {
        this.glLoading = null;
        return null;
      });
    return this.glLoading;
  }

  /** Loads what the portal needs once the page has settled (see WARM_IDLE_MS). */
  private scheduleWarm(pathname: string) {
    if (this.warmed) return;
    const library = isArticlesPath(pathname);
    if (!library && this.stageModule) return;
    window.clearTimeout(this.warmTimer);
    this.warmTimer = window.setTimeout(
      () => {
        const warm = () => {
          if (this.disposed || this.run || !motionAllowed()) return;
          if (library) this.warm();
          else void this.ensureStage();
        };
        if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 3000 });
        else warm();
      },
      library ? WARM_IDLE_MS.library : WARM_IDLE_MS.elsewhere,
    );
  }

  private debugView() {
    return {
      state: () => ({
        run: this.run
          ? {
              direction: this.run.direction,
              phase: this.run.phase,
              t: this.run.t,
              renderer: this.run.stage?.renderer ?? (this.run.plain ? "plain" : null),
              pushed: this.run.pushed,
              committed: this.run.committed,
              held: this.run.held,
            }
          : null,
        layer: Boolean(document.querySelector("[data-articles-portal]")),
        pieces: document.querySelectorAll("[data-articles-portal-layer]").length,
        overflow: document.documentElement.style.overflow,
        busy: isArticleTransitionBusy(),
        cover: isRouteCoverActive(),
        tint: this.tint.size,
        gl: this.gl ? "ready" : this.glFailed ? "failed" : this.glLoading ? "loading" : "idle",
        stage: Boolean(this.stageModule),
        last: this.lastLog,
      }),
      setSlowdown: (factor: number) => {
        this.slowdown = Math.max(0.1, factor);
      },
      forceDom: (on: boolean) => {
        this.forceDom = on;
      },
      // Stands in for an articles page reporting ready.
      markPageReady: (pathname: string) => markArticlePageReady(pathname),
    };
  }
}
