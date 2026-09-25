import gsap from "gsap";

import type { ArticlesWorldApi } from "@/components/articles/world/world-api";
import { getArticlesWorld } from "@/components/articles/world/world-registry";
import {
  HeaderTint,
  walkHeaderPalette,
  type HeaderPaletteWalk,
} from "@/components/transition/project-zoom-colors";
import {
  ARTICLES_LIST_PATH,
  articleDetailSlug,
  articleTransitionKind,
  clearArticleArrival,
  expectArticlePage,
  isArticleTransitionBusy,
  markArticleCoverStarted,
  markArticleRevealStarted,
  noteArticleArrival,
  rememberArticleListHref,
  setArticleReturn,
  setArticleTransitionBusy,
  waitForArticlePage,
} from "@/lib/article-transition";
import { isProjectTransitionBusy, skipScrollReset } from "@/lib/project-transition";
import { PROJECT_THEMES } from "@/lib/project-themes";
import { motionAllowed } from "@/lib/reduced-motion";
import { isRouteCoverActive } from "@/lib/route-reveal";
import { acquireScrollLock, releaseScrollLock } from "@/lib/scroll-lock";
import { isThemeId, themeIdFor } from "@/lib/theme-pick";

/**
 * The transitions inside the library world, after unseen.co's list and
 * project pages (research: ~/lab/tmp/unseen/research/transitions.md):
 *
 * - open (list to article): the whole list scene pans left (2800 px at the
 *   card plane, 2 s power4.inOut) while the head slides away and the
 *   article's theme colour sweeps in from the right edge with a soft front
 *   (1.7 s) and the lens relaxes; the route changes once the colour covers
 *   the list, and when the article is ready its content slides in from a
 *   quarter screen to the right as the colour dissolves onto the themed
 *   library behind it.
 * - close (article to list): the content drifts right and fades while the
 *   fog swallows the library; the list is pushed in return mode (scrolled
 *   so the opened card is in view) and arrives from the left as the colour
 *   recedes to the right; the lens comes back last.
 * - swap (article to article, not the next-article pull, which plays its
 *   own flood): the content falls away into the fog and the next one
 *   rises out of it.
 *
 * Browser back and forward cover at once in the popstate handler (the
 * route changes under us) and play the second half. Without the WebGL
 * world a DOM overlay plays the same colour sweep. Reduced motion is never
 * intercepted: the list's return note alone brings the card back into view.
 *
 * One `finish()` releases everything on every path (landed, aborted,
 * superseded, unmounted, timed out).
 */

type Kind = "open" | "close" | "swap";

type Run = {
  kind: Kind;
  from: string;
  to: string;
  href: string;
  /** The article being left (close, swap) or entered (open). */
  slug: string | null;
  /** The flat colour of the wipe (the article theme's page colour). */
  color: string;
  world: ArticlesWorldApi | null;
  timeline: gsap.core.Timeline | null;
  release: (() => void) | null;
  walk: HeaderPaletteWalk | null;
  overlay: HTMLElement | null;
  committed: boolean;
  commitWaiters: (() => void)[];
  ended: boolean;
  instant: boolean;
};

const LOCK = "articles-transition";
/** The list's pan at the card plane (unseen's 1400 units at 2 px each). */
const PAN = 2800;
const COMMIT_CEILING_MS = 8000;
const READY_MS = 2200;
/** When the route changes during an open, once the colour covers the list. */
const OPEN_PUSH_AT = 1.2;
const CLOSE_PUSH_AT = 1.15;
const SWAP_PUSH_AT = 0.85;
/** Visible time after which a run that never ended is ended anyway. */
const RUN_CEILING_MS = 16000;
/** No timeline runs slower than real, visible time divided by this (see `paced`). */
const WALL_STRETCH = 1.5;

/** The list's scroll position when a card was opened, for the way back. */
let openedFrom: { slug: string; scrollY: number } | null = null;

function isDark() {
  return document.documentElement.classList.contains("dark");
}

function themePalette(themeId: string | undefined, slug: string) {
  const id = isThemeId(themeId) ? themeId : themeIdFor({ slug });
  return PROJECT_THEMES[id][isDark() ? "dark" : "light"];
}

/** The page colour the article on screen paints (its theme's --project-bg). */
function currentPageColor() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--project-bg").trim();
  if (value) return value;
  const root = document.querySelector<HTMLElement>("[data-article-detail]");
  const slug = root?.dataset.articleSlug ?? "";
  return themePalette(root?.dataset.articleTheme, slug).bg;
}

/** The same bail-outs as the route curtain's click filter. */
function linkOf(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  const target = anchor.getAttribute("target");
  if (target && target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;
  const raw = anchor.getAttribute("href") ?? "";
  if (!raw || raw.startsWith("#") || /^(mailto|tel):/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  return { anchor, url };
}

function fit(t: number, from: number, to: number) {
  return Math.min(1, Math.max(0, (t - from) / (to - from)));
}

export type ArticleTransitionsOptions = {
  navigate: (href: string, options?: { scroll?: boolean }) => void;
  prefetch: (href: string) => void;
  pathname: string;
};

export class ArticleTransitions {
  private run: Run | null = null;
  private shown: string;
  private disposed = false;

  constructor(private readonly o: ArticleTransitionsOptions) {
    this.shown = o.pathname;
    window.addEventListener("click", this.onClick, true);
    window.addEventListener("popstate", this.onPopState);
    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, {
        __articleTransition: {
          state: () => ({
            run: this.run && {
              kind: this.run.kind,
              from: this.run.from,
              to: this.run.to,
              committed: this.run.committed,
            },
            shown: this.shown,
            openedFrom,
            busy: isArticleTransitionBusy(),
            htmlAttr: document.documentElement.dataset.articleTransition ?? null,
            overflow: document.documentElement.style.overflow,
          }),
        },
      });
    }
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener("click", this.onClick, true);
    window.removeEventListener("popstate", this.onPopState);
    if (this.run) this.finish(this.run);
    if (process.env.NODE_ENV !== "production") {
      delete (window as { __articleTransition?: unknown }).__articleTransition;
    }
  }

  /** The host forwards every committed pathname. */
  routeChanged(pathname: string) {
    this.shown = pathname;
    const run = this.run;
    if (!run || run.committed) return;
    if (pathname === run.to) {
      run.committed = true;
      for (const resolve of run.commitWaiters.splice(0)) resolve();
    } else if (pathname !== run.from) {
      // The visitor went somewhere else mid-flight.
      this.finish(run);
    }
  }

  // ---------------------------------------------------------------- input

  private readonly onClick = (event: MouseEvent) => {
    if (this.run && !this.run.ended) {
      // Mid-transition every click is swallowed: nothing may navigate or
      // toggle under the cover.
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const link = linkOf(event);
    if (!link) return;
    const from = window.location.pathname;
    const to = link.url.pathname;
    const kind = articleTransitionKind(from, to);
    if (kind !== "open" && kind !== "close" && kind !== "swap") return;
    // The next-article pull plays its own flood (the article page owns it).
    if (link.anchor.closest("[data-article-next]")) return;
    if (to.startsWith("/admin")) return;

    const href = link.url.pathname + link.url.search + link.url.hash;
    if (!motionAllowed()) {
      // Native navigation; the list only needs to know where to come back to.
      this.noteQuietly(kind, from, to);
      return;
    }
    if (isArticleTransitionBusy() || isRouteCoverActive() || isProjectTransitionBusy()) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    this.start(kind, from, to, href, link.anchor, false);
  };

  private readonly onPopState = () => {
    const to = window.location.pathname;
    const from = this.shown;
    if (to === from) return;
    const kind = articleTransitionKind(from, to);
    if (kind !== "open" && kind !== "close" && kind !== "swap") return;
    if (!motionAllowed()) {
      if (kind === "close") {
        const slug = articleDetailSlug(from);
        if (slug) setArticleReturn({ slug, restoreOnly: true });
      }
      return;
    }
    if (this.run) this.finish(this.run);
    const card =
      kind === "open"
        ? document.querySelector<HTMLAnchorElement>(
            `a[data-article-card][data-article-slug="${CSS.escape(articleDetailSlug(to) ?? "")}"]`,
          )
        : null;
    this.start(kind, from, to, to + window.location.search, card, true);
  };

  /** Reduced motion: leave the notes a native navigation still needs. */
  private noteQuietly(kind: Kind, from: string, to: string) {
    if (kind === "open") {
      const slug = articleDetailSlug(to);
      if (slug) openedFrom = { slug, scrollY: window.scrollY };
      rememberArticleListHref(window.location.pathname + window.location.search);
    } else if (kind === "close") {
      const slug = articleDetailSlug(from);
      if (slug) {
        setArticleReturn({
          slug,
          scrollY: openedFrom?.slug === slug ? openedFrom.scrollY : undefined,
          restoreOnly: true,
        });
      }
    }
  }

  // ---------------------------------------------------------------- run

  private start(
    kind: Kind,
    from: string,
    to: string,
    href: string,
    anchor: HTMLAnchorElement | null,
    instant: boolean,
  ) {
    const world = getArticlesWorld();
    const toSlug = articleDetailSlug(to);
    const fromSlug = articleDetailSlug(from);
    let color: string;
    if (kind === "open") {
      const themeHost = anchor?.closest<HTMLElement>("[data-article-theme]");
      color = themePalette(themeHost?.dataset.articleTheme, toSlug ?? "").bg;
    } else {
      color = currentPageColor();
    }

    const run: Run = {
      kind,
      from,
      to,
      href,
      slug: kind === "open" ? toSlug : fromSlug,
      color,
      world,
      timeline: null,
      release: null,
      walk: null,
      overlay: null,
      committed: false,
      commitWaiters: [],
      ended: false,
      instant,
    };
    this.run = run;
    this.armFailsafe(run);

    setArticleTransitionBusy(true);
    acquireScrollLock(LOCK);
    markArticleCoverStarted();
    expectArticlePage(to);
    if (!instant) this.o.prefetch(href);

    if (kind === "open") {
      if (toSlug) openedFrom = { slug: toSlug, scrollY: window.scrollY };
      rememberArticleListHref(window.location.pathname + window.location.search);
      noteArticleArrival({ kind: "open", pathname: to, slug: toSlug ?? undefined });
      run.release = world?.cards.hold() ?? null;
      const palette = themePalette(
        anchor?.closest<HTMLElement>("[data-article-theme]")?.dataset.articleTheme,
        toSlug ?? "",
      );
      run.walk = walkHeaderPalette(palette);
    } else if (kind === "close") {
      noteArticleArrival({
        kind: "close",
        pathname: ARTICLES_LIST_PATH,
        slug: fromSlug ?? undefined,
      });
      if (fromSlug) {
        setArticleReturn({
          slug: fromSlug,
          scrollY: openedFrom?.slug === fromSlug ? openedFrom.scrollY : undefined,
        });
      }
      skipScrollReset(ARTICLES_LIST_PATH);
      // Back to the site's own header colours (the list wears no theme).
      const tint = new HeaderTint();
      tint.start(tint.current(), tint.site());
      run.walk = {
        set: (t) => tint.set(Math.min(1, Math.max(0, t))),
        release: () => tint.release(),
      };
    } else {
      noteArticleArrival({ kind: "swap", pathname: to, slug: toSlug ?? undefined });
    }

    document.documentElement.dataset.articleTransition = `${kind}-out`;
    if (!world) run.overlay = this.makeOverlay(color);

    if (instant) {
      this.coverAtOnce(run);
      void this.enter(run);
      return;
    }
    run.timeline = this.paced(
      run,
      kind === "open"
        ? this.openOut(run)
        : kind === "close"
          ? this.closeOut(run)
          : this.swapOut(run),
    );
  }

  /**
   * GSAP's lag smoothing advances a timeline by at most 33 ms a frame once
   * frames take over half a second, so on a software renderer the open's
   * two-second pan took over twenty, and the run's ceiling ended it before
   * it had navigated. A timer keeps every timeline at least at two thirds
   * of real, visible speed: slow frames drop, the choreography keeps time
   * (docs/animation-system.md gotcha #27).
   */
  private paced(run: Run, timeline: gsap.core.Timeline) {
    let visible = 0;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) visible += (now - last) / 1000;
      last = now;
      if (run.ended || run.timeline !== timeline || timeline.progress() >= 1) {
        window.clearInterval(timer);
        return;
      }
      const floor = Math.min(visible / WALL_STRETCH, timeline.duration());
      // Jumping the playhead fires every callback it passes (the push, the end).
      if (timeline.time() < floor) this.guard(run, () => timeline.time(floor));
    }, 100);
    return timeline;
  }

  /**
   * Whatever happens (a fault in a frame callback, a route that never
   * commits, a tab left hidden), a run always ends: nothing may stay
   * locked, busy or covered. Counts visible time only.
   */
  private armFailsafe(run: Run) {
    let left = RUN_CEILING_MS;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) left -= now - last;
      last = now;
      if (run.ended) window.clearInterval(timer);
      else if (left <= 0) {
        window.clearInterval(timer);
        this.finish(run);
      }
    }, 250);
  }

  /** Runs a frame callback; a fault ends the run cleanly instead of freezing it. */
  private guard(run: Run, step: () => void) {
    try {
      step();
    } catch (error) {
      console.error("[articles transition]", error);
      this.finish(run);
    }
  }

  private makeOverlay(color: string) {
    const overlay = document.createElement("div");
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.articleTransitionOverlay = "";
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "45",
      background: color,
      pointerEvents: "auto",
      clipPath: "inset(0 0 0 100%)",
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  /** Browser back/forward: the route is already changing, cover right now. */
  private coverAtOnce(run: Run) {
    const world = run.world;
    if (world) {
      world.transition.setWipe(1, run.color, 1);
      world.transition.setLensAmount(0);
      if (run.kind === "close") world.transition.setPan(PAN);
    } else if (run.overlay) {
      run.overlay.style.clipPath = "inset(0 0 0 0%)";
    }
    run.walk?.set(1);
    const content = document.querySelector<HTMLElement>("[data-article-content]");
    if (content) gsap.set(content, { autoAlpha: 0 });
    const head = document.querySelector<HTMLElement>("[data-articles-head]");
    if (head && run.kind === "open") gsap.set(head, { autoAlpha: 0 });
  }

  private wipe(run: Run, progress: number, opacity = 1) {
    if (run.world) {
      run.world.transition.setWipe(progress, run.color, opacity);
    } else if (run.overlay) {
      // The same soft front as the world's wipe, as a clip from the right.
      const left = Math.max(0, (1 - progress) * 100);
      run.overlay.style.clipPath = `inset(0 0 0 ${left}%)`;
      run.overlay.style.opacity = String(opacity);
    }
  }

  // ---------------------------------------------------------------- out

  private openOut(run: Run) {
    const world = run.world;
    const head = document.querySelector<HTMLElement>("[data-articles-head]");
    const chrome = document.querySelectorAll<HTMLElement>("[data-articles-top]");
    const grid = world ? null : document.querySelector<HTMLElement>("[data-articles-grid]");
    const state = { pan: 0, wipe: 0, lens: 1, walk: 0 };
    const tl = gsap.timeline({
      defaults: { duration: 2, ease: "power4.inOut" },
      onUpdate: () =>
        this.guard(run, () => {
          world?.transition.setPan(state.pan);
          world?.transition.setLensAmount(state.lens);
          this.wipe(run, state.wipe);
          run.walk?.set(state.walk);
        }),
      onComplete: () => void this.enter(run),
    });
    tl.to(state, { pan: PAN }, 0)
      .to(state, { wipe: 1, duration: 1.7 }, 0)
      .to(state, { lens: 0, duration: 1 }, 0)
      .to(state, { walk: 1, duration: 1.6, ease: "power2.inOut" }, 0);
    if (head) tl.to(head, { xPercent: -100, autoAlpha: 0 }, 0);
    if (grid) tl.to(grid, { x: () => -0.45 * window.innerWidth, autoAlpha: 0 }, 0);
    if (chrome.length) tl.to(chrome, { autoAlpha: 0, duration: 0.5 }, 0);
    tl.call(() => this.push(run, false), undefined, OPEN_PUSH_AT);
    return tl;
  }

  private closeOut(run: Run) {
    const world = run.world;
    const content = document.querySelector<HTMLElement>("[data-article-content]");
    const state = { swallow: 0, walk: 0, fade: 0 };
    const tl = gsap.timeline({
      defaults: { duration: 1.5, ease: "power4.inOut" },
      onUpdate: () =>
        this.guard(run, () => {
          world?.transition.setFogSwallow(state.swallow);
          run.walk?.set(fit(state.walk, 0, 1) * 0.35);
          if (!world) this.wipe(run, 1, state.fade);
        }),
      onComplete: () => void this.enter(run),
    });
    if (!world && run.overlay) {
      run.overlay.style.clipPath = "inset(0 0 0 0%)";
      run.overlay.style.opacity = "0";
    }
    if (content) {
      tl.to(content, { x: () => 0.25 * window.innerWidth }, 0).to(
        content,
        { autoAlpha: 0, duration: 1 },
        0.17,
      );
    }
    tl.to(state, { swallow: 1, fade: 1, duration: 1 }, 0.17).to(
      state,
      { walk: 1, duration: 1.5 },
      0,
    );
    tl.call(
      () => {
        // The fog is the page's own colour by now: swap it for the flat
        // wipe (the same colour), and park the list off to the left.
        world?.transition.setWipe(1, run.color, 1);
        world?.transition.setLensAmount(0);
        world?.transition.setPan(PAN);
        this.push(run, true);
      },
      undefined,
      CLOSE_PUSH_AT,
    );
    return tl;
  }

  private swapOut(run: Run) {
    const world = run.world;
    const content = document.querySelector<HTMLElement>("[data-article-content]");
    const state = { swallow: 0, dolly: 0, fade: 0 };
    const tl = gsap.timeline({
      defaults: { duration: 1, ease: "power3.in" },
      onUpdate: () =>
        this.guard(run, () => {
          world?.transition.setFogSwallow(state.swallow);
          world?.transition.setDolly(state.dolly);
          if (!world) this.wipe(run, 1, state.fade);
        }),
      onComplete: () => void this.enter(run),
    });
    if (!world && run.overlay) {
      run.overlay.style.clipPath = "inset(0 0 0 0%)";
      run.overlay.style.opacity = "0";
    }
    if (content) tl.to(content, { scale: 0.92, autoAlpha: 0, transformOrigin: "50% 30%" }, 0);
    tl.to(state, { swallow: 1, dolly: 700, fade: 1 }, 0);
    tl.call(() => this.push(run, false), undefined, SWAP_PUSH_AT);
    return tl;
  }

  private push(run: Run, keepScroll: boolean) {
    if (run.ended || this.run !== run) return;
    if (window.location.pathname === run.to) return;
    this.o.navigate(run.href, keepScroll ? { scroll: false } : undefined);
  }

  // ---------------------------------------------------------------- in

  private waitForCommit(run: Run) {
    if (run.committed || (window.location.pathname === run.to && this.shown === run.to)) {
      run.committed = true;
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(false), COMMIT_CEILING_MS);
      run.commitWaiters.push(() => {
        window.clearTimeout(timer);
        resolve(true);
      });
    });
  }

  private async enter(run: Run) {
    try {
      await this.enterSteps(run);
    } catch (error) {
      console.error("[articles transition]", error);
      this.finish(run);
    }
  }

  private async enterSteps(run: Run) {
    if (run.ended || this.run !== run) return;
    const committed = await this.waitForCommit(run);
    if (run.ended || this.run !== run) return;
    if (!committed) {
      this.finish(run);
      return;
    }
    await waitForArticlePage(READY_MS);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (run.ended || this.run !== run) return;
    document.documentElement.dataset.articleTransition = `${run.kind}-in`;
    run.timeline?.kill();
    run.timeline = this.paced(
      run,
      run.kind === "close"
        ? this.closeIn(run)
        : run.kind === "open"
          ? this.openIn(run)
          : this.swapIn(run),
    );
  }

  private openIn(run: Run) {
    const world = run.world;
    const content = document.querySelector<HTMLElement>("[data-article-content]");
    const width = window.innerWidth;
    world?.transition.setPan(0);
    world?.transition.setFogSwallow(0.85);
    // The world leaves the cards to a running transition: the list's are
    // gone with it now.
    world?.transition.setCardsVisible(false);
    run.release?.();
    run.release = null;
    const state = { swallow: 0.85, wipe: 1 };
    const tl = gsap.timeline({
      onUpdate: () =>
        this.guard(run, () => {
          world?.transition.setFogSwallow(state.swallow);
          this.wipe(run, 1, state.wipe);
        }),
      onComplete: () => this.finish(run),
    });
    if (content) {
      gsap.set(content, { x: 0.25 * width, autoAlpha: 0 });
      tl.to(content, { x: 0, duration: 1, ease: "power2.out", clearProps: "transform" }, 0).to(
        content,
        { autoAlpha: 1, duration: 0.8, ease: "power2.out" },
        0,
      );
    }
    tl.to(state, { wipe: 0, duration: 0.9, ease: "power2.out" }, 0).to(
      state,
      { swallow: 0, duration: 1.1, ease: "power2.out" },
      0,
    );
    markArticleRevealStarted();
    return tl;
  }

  private closeIn(run: Run) {
    const world = run.world;
    const head = document.querySelector<HTMLElement>("[data-articles-head]");
    const grid = world ? null : document.querySelector<HTMLElement>("[data-articles-grid]");
    world?.transition.setFogSwallow(0);
    world?.transition.setPan(PAN);
    world?.transition.setCardsVisible(true);
    const state = { pan: PAN, wipe: 1, lens: 0, walk: 0.35 };
    const tl = gsap.timeline({
      defaults: { duration: 2, ease: "power4.inOut" },
      onUpdate: () =>
        this.guard(run, () => {
          world?.transition.setPan(state.pan);
          world?.transition.setLensAmount(state.lens);
          this.wipe(run, state.wipe);
          run.walk?.set(state.walk);
        }),
      onComplete: () => this.finish(run),
    });
    tl.to(state, { pan: 0 }, 0)
      .to(state, { wipe: 0, duration: 1.7 }, 0)
      .to(state, { walk: 1, duration: 1.4, ease: "power2.inOut" }, 0)
      .to(state, { lens: 1, duration: 1, ease: "power2.out" }, 2);
    if (head) {
      tl.fromTo(
        head,
        { xPercent: -100, autoAlpha: 0 },
        { xPercent: 0, autoAlpha: 1, clearProps: "transform,opacity,visibility" },
        0,
      );
    }
    if (grid) {
      tl.fromTo(
        grid,
        { x: () => -0.45 * window.innerWidth, autoAlpha: 0 },
        { x: 0, autoAlpha: 1, clearProps: "transform,opacity,visibility" },
        0,
      );
    }
    markArticleRevealStarted();
    return tl;
  }

  private swapIn(run: Run) {
    const world = run.world;
    const content = document.querySelector<HTMLElement>("[data-article-content]");
    const root = document.querySelector<HTMLElement>("[data-article-detail]");
    const palette = themePalette(root?.dataset.articleTheme, root?.dataset.articleSlug ?? "");
    run.walk?.release();
    run.walk = walkHeaderPalette(palette);
    const state = { swallow: 1, dolly: -500, walk: 0, fade: 1 };
    const tl = gsap.timeline({
      defaults: { duration: 1.2, ease: "power2.out" },
      onUpdate: () =>
        this.guard(run, () => {
          world?.transition.setFogSwallow(state.swallow);
          world?.transition.setDolly(state.dolly);
          run.walk?.set(state.walk);
          // Browser back and forward covered at once with the page colour
          // being left: it dissolves as the new article rises.
          if (!world || run.instant) this.wipe(run, 1, state.fade);
        }),
      onComplete: () => this.finish(run),
    });
    if (content) {
      gsap.set(content, { scale: 1.04, autoAlpha: 0, transformOrigin: "50% 20%" });
      tl.to(content, { scale: 1, autoAlpha: 1, duration: 0.9, clearProps: "transform" }, 0.1);
    }
    tl.to(state, { swallow: 0, dolly: 0, walk: 1, fade: 0 }, 0);
    markArticleRevealStarted();
    return tl;
  }

  // ---------------------------------------------------------------- end

  private finish(run: Run) {
    if (run.ended) return;
    run.ended = true;
    run.timeline?.kill();
    run.timeline = null;
    for (const resolve of run.commitWaiters.splice(0)) resolve();
    const world = run.world;
    if (world && getArticlesWorld() === world) {
      world.transition.setWipe(0, run.color, 1);
      world.transition.setFogSwallow(0);
      world.transition.setPan(0);
      world.transition.setDolly(0);
      const detail = articleDetailSlug(window.location.pathname) !== null;
      world.transition.setLensAmount(detail ? 0 : 1);
      world.transition.setCardsVisible(!detail);
    }
    run.release?.();
    run.release = null;
    run.overlay?.remove();
    run.overlay = null;
    // The page underneath now carries its own colours (the article's
    // theme <style>, or the site tokens on the list).
    run.walk?.release();
    run.walk = null;
    for (const selector of [
      "[data-articles-head]",
      "[data-article-content]",
      "[data-articles-grid]",
    ]) {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) gsap.set(element, { clearProps: "transform,opacity,visibility" });
    }
    for (const element of document.querySelectorAll<HTMLElement>("[data-articles-top]")) {
      gsap.set(element, { clearProps: "opacity,visibility" });
    }
    delete document.documentElement.dataset.articleTransition;
    clearArticleArrival();
    markArticleRevealStarted();
    releaseScrollLock(LOCK);
    if (this.run === run) this.run = null;
    setArticleTransitionBusy(false);
  }
}
