import gsap from "gsap";

import type { ArticleCoverLayer } from "@/components/articles/world/detail/cover-layer";
import type { ArticlesWorldApi, WorldMode } from "@/components/articles/world/world-api";
import { getArticlesWorld, onWorldState } from "@/components/articles/world/world-registry";
import { startSmoothScroll } from "@/components/projects/stage/smooth-scroller";
import {
  articleDetailSlug,
  isArticleCoverActive,
  isArticleTransitionBusy,
  markArticlePageReady,
  onArticleTransitionChange,
  waitForArticleReveal,
  type ArticleArrival,
} from "@/lib/article-transition";
import { registerHeaderToneProvider, type HeaderToneSample } from "@/lib/header-tone";
import { sampleImageAt } from "@/lib/header-tone-probe";
import { scrollPageTo } from "@/lib/page-scroll";
import { PROJECT_THEMES } from "@/lib/project-themes";
import { motionAllowed, onReducedMotion } from "@/lib/reduced-motion";
import { isRouteCoverActive, waitForRouteReveal } from "@/lib/route-reveal";

import { DomCover } from "./cover-dom";
import type { ArticleDetailData } from "./detail-data";
import { heroParts, playHeroEntrance, showHero } from "./detail-entrance";
import { StoryMotion } from "./detail-motion";
import { StoryReveals } from "./detail-reveals";
import { ImageZoom } from "./image-zoom";
import { adoptFlood } from "./next-flood";
import { LinkMagnets } from "./detail-magnetic";
import { NextThreshold } from "./next-threshold";

/**
 * Everything on the article page that moves, kept out of React: the smooth
 * scroller, the hero's entrance (held under a transition until it reveals),
 * the cover (the world's sea emergence, or the DOM one), the story's reveals
 * and scroll motion, the next-article threshold, the world's theme and the
 * adaptive header's view of what the world draws.
 *
 * Entrance protocol (every articles page): an arrival note, the route cover
 * or an articles cover keeps the hero hidden until both reveals resolve
 * (with a visible-time failsafe); a fresh load plays once the fonts are in.
 * After the next-article hand-off the title is already in place and the
 * flood left on screen fades away as the rest of the hero appears.
 */

/** How long a pending cover waits for the world's picture before the DOM one plays. */
const GL_COVER_WAIT_MS = 1400;
/** A world picture that arrives later than that may still take over, up to this long. */
const LATE_GL_COVER_MS = 12000;
/** How long the DOM emergence takes to settle (detail.css, ad-sea-settle). */
const DOM_EMERGE_MS = 2700;
const FONT_WAIT_MS = 1200;
const REVEAL_WAIT_MS = 9000;
/** The page reports ready once laid out and its cover decoded, or after this. */
const READY_TIMEOUT_MS = 450;
const SITE_HEADER = 64;

export type ArticleControllerOptions = {
  root: HTMLElement;
  data: ArticleDetailData;
  pathname: string;
  arrival?: ArticleArrival;
  navigate: (href: string) => void;
  prefetch: (href: string) => void;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Resolves with the promise, or once `ms` of visible time has passed: a tab
 * opened in the background must not burn its failsafe unseen
 * (docs/animation-system.md gotcha #18).
 */
function withinVisible(promise: Promise<unknown>, ms: number) {
  return new Promise<void>((resolve) => {
    let waited = 0;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (!document.hidden) waited += now - last;
      last = now;
      if (waited >= ms) finish();
    }, 100);
    function finish() {
      window.clearInterval(timer);
      resolve();
    }
    void promise.then(finish, finish);
  });
}

export class ArticleController {
  private readonly reduced: boolean;
  private readonly fine: boolean;
  private stopLenis: (() => void) | null = null;
  private lenisOn = false;
  private reveals: StoryReveals | null = null;
  private motion: StoryMotion | null = null;
  private threshold: NextThreshold | null = null;
  private magnets: LinkMagnets | null = null;
  private zoom: ImageZoom | null = null;
  private entrance: gsap.core.Timeline | null = null;
  private world: ArticlesWorldApi | null = null;
  private glCover: ArticleCoverLayer | null = null;
  private glCoverLoading = false;
  private glCoverReady = false;
  private readonly glWaiters: ((layer: ArticleCoverLayer | null) => void)[] = [];
  private domCover: DomCover | null = null;
  private coverKind: "pending" | "gl" | "dom" = "pending";
  private coverEmerged = false;
  /** The DOM cover stays for the visit (reduced motion, a lost world). */
  private coverFinal = false;
  private offTone: (() => void) | null = null;
  private readonly cleanups: (() => void)[] = [];
  private disposed = false;
  private readonly figure: HTMLElement | null;
  private readonly frame: HTMLElement | null;
  private readonly coverImg: HTMLImageElement | null;
  private readonly content: HTMLElement | null;

  constructor(private readonly o: ArticleControllerOptions) {
    this.reduced = !motionAllowed();
    this.fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    this.figure = o.root.querySelector("[data-ad-cover]");
    this.frame = o.root.querySelector("[data-ad-cover-frame]");
    this.coverImg = o.root.querySelector("[data-ad-cover-img]");
    this.content = o.root.querySelector("[data-article-content]");
  }

  start() {
    const { root } = this.o;
    root.dataset.adLive = "";

    if (!this.reduced && this.fine) {
      void startSmoothScroll({ lerp: 0.085 }).then((stop) => {
        if (this.disposed) {
          stop();
          return;
        }
        this.stopLenis = stop;
        this.lenisOn = true;
        this.maybeGlCover();
      });
    }

    this.reveals = new StoryReveals(root, !this.reduced);
    this.motion = new StoryMotion(root, {
      animate: !this.reduced,
      peel: !this.reduced && window.innerWidth >= 768,
    });

    const section = root.querySelector<HTMLAnchorElement>("[data-article-next]");
    if (section && this.o.data.next && !this.reduced) {
      this.threshold = new NextThreshold({
        section,
        heroTitle: root.querySelector("[data-article-title]"),
        next: this.o.data.next,
        pathname: this.o.pathname,
        navigate: this.o.navigate,
        prefetch: this.o.prefetch,
      });
      this.threshold.start();
    }

    this.cleanups.push(onWorldState((mode, world) => this.onWorld(mode, world)));
    this.cleanups.push(onReducedMotion(() => this.toReduced()));
    // A transition slid the content: offsets measured meanwhile are stale.
    this.cleanups.push(onArticleTransitionChange(() => this.motion?.queueMeasure()));
    this.listenIndex();
    if (this.fine && !this.reduced) this.magnets = new LinkMagnets(root);
    this.zoom = new ImageZoom(root, !this.reduced);

    void this.signalReady();
    void this.runEntrance();

    if (process.env.NODE_ENV !== "production") {
      Object.assign(window, {
        __articleDetail: {
          state: () => ({
            cover: this.coverKind,
            lenis: this.lenisOn,
            reduced: this.reduced,
            world: Boolean(this.world),
          }),
          controller: this,
        },
      });
      // The transitions' signals, for scripted checks of the entrance
      // protocol before the transitions that send them exist.
      void import("@/lib/article-transition").then((signals) => {
        const probe = (window as { __articleDetail?: { controller: unknown } }).__articleDetail;
        if (probe?.controller === this) Object.assign(probe, { signals });
      });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopLenis?.();
    this.stopLenis = null;
    this.entrance?.kill();
    this.reveals?.dispose();
    this.motion?.dispose();
    this.threshold?.dispose();
    this.magnets?.dispose();
    this.zoom?.dispose();
    this.offTone?.();
    this.offTone = null;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    for (const resolve of this.glWaiters.splice(0)) resolve(null);
    this.glCover?.dispose();
    this.glCover = null;
    this.domCover?.dispose();
    this.domCover = null;
    // Leaving for anything but another article (or under a transition, which
    // owns the world's colours): the library goes back to its own palette.
    // Checked a beat later, once the address bar shows where we went.
    window.setTimeout(() => {
      if (isArticleTransitionBusy()) return;
      if (articleDetailSlug(window.location.pathname)) return;
      getArticlesWorld()?.setTheme(null);
    }, 0);
    if (process.env.NODE_ENV !== "production") {
      const probe = (window as { __articleDetail?: { controller: unknown } }).__articleDetail;
      if (probe?.controller === this)
        delete (window as { __articleDetail?: unknown }).__articleDetail;
    }
  }

  // ---------------------------------------------------------------- world

  private onWorld(mode: WorldMode, world: ArticlesWorldApi | null) {
    if (this.disposed) return;
    if (mode === "gl" && world) {
      this.world = world;
      const theme = PROJECT_THEMES[this.o.data.themeId];
      world.setTheme({ light: theme.light, dark: theme.dark });
      // Registered after the world's own provider, so this one answers first
      // for what the page draws through the world.
      this.offTone?.();
      this.offTone = registerHeaderToneProvider((zones) =>
        zones.map((zone) => zone.points.map((point) => this.toneAt(point.x, point.y))),
      );
      this.maybeGlCover();
      return;
    }
    this.world = null;
    this.offTone?.();
    this.offTone = null;
    if (mode !== "dom") return;
    this.coverFinal = true;
    if (this.coverKind === "gl") {
      // The world went away (a lost context): the DOM picture takes over, settled.
      this.glCover = null;
      delete this.figure?.dataset.cover;
      this.coverKind = "dom";
      this.useDomCover().emerge(true);
    }
    for (const resolve of this.glWaiters.splice(0)) resolve(null);
  }

  /** What the page draws through the world behind a header point, if anything. */
  private toneAt(x: number, y: number): HeaderToneSample | undefined {
    const inside = (rect: DOMRect) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    if (this.coverKind === "gl" && this.frame && this.coverImg) {
      if (inside(this.frame.getBoundingClientRect())) {
        const sample = sampleImageAt(this.coverImg, x, y);
        if (sample && sample.alpha > 0) return { color: sample.rgb, media: true };
      }
    }
    // Story pictures are mostly cross-origin (unreadable): the header must
    // hold over any colour there.
    for (const frame of this.o.root.querySelectorAll<HTMLElement>("[data-ad-frame]")) {
      if (inside(frame.getBoundingClientRect())) {
        return { color: [128, 128, 128], media: true, unknown: true };
      }
    }
    return undefined;
  }

  // ---------------------------------------------------------------- cover

  /** Starts the world's cover when everything it needs is there. */
  private maybeGlCover() {
    const world = this.world;
    const url = this.o.data.coverUrl;
    if (!world || !url || !this.frame || this.reduced || !this.fine || !this.lenisOn) return;
    if (this.glCover || this.glCoverLoading || this.coverFinal) return;
    this.glCoverLoading = true;
    void import("@/components/articles/world/detail/cover-layer").then(({ ArticleCoverLayer }) => {
      this.glCoverLoading = false;
      if (this.disposed || this.world !== world || this.coverFinal || !this.frame) return;
      const theme = PROJECT_THEMES[this.o.data.themeId];
      const layer = new ArticleCoverLayer(world, {
        frame: this.frame,
        url,
        tint: { light: theme.light.highlight, dark: theme.dark.highlight },
        content: this.content,
      });
      this.glCover = layer;
      layer.attach();
      void layer.ready.then((ok) => {
        if (this.disposed || this.glCover !== layer) return;
        if (!ok || this.coverFinal) {
          layer.dispose();
          this.glCover = null;
          for (const resolve of this.glWaiters.splice(0)) resolve(null);
          return;
        }
        this.glCoverReady = true;
        for (const resolve of this.glWaiters.splice(0)) resolve(layer);
      });
    });
  }

  private glCoverWithin(ms: number): Promise<ArticleCoverLayer | null> {
    if (this.glCover && this.glCoverReady) return Promise.resolve(this.glCover);
    if (this.reduced || !this.fine || !this.o.data.coverUrl) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        const index = this.glWaiters.indexOf(done);
        if (index >= 0) this.glWaiters.splice(index, 1);
        resolve(null);
      }, ms);
      const done = (layer: ArticleCoverLayer | null) => {
        window.clearTimeout(timer);
        resolve(layer);
      };
      this.glWaiters.push(done);
    });
  }

  private useDomCover() {
    if (!this.domCover && this.figure && this.frame) {
      this.domCover = new DomCover(this.figure, this.frame, !this.reduced);
    }
    return this.domCover ?? { emerge: () => {} };
  }

  private async emergeCover(instant = false) {
    if (this.coverEmerged || this.disposed) return;
    this.coverEmerged = true;
    if (!this.o.data.coverUrl) return;
    const layer = instant ? null : await this.glCoverWithin(GL_COVER_WAIT_MS);
    if (this.disposed) return;
    if (layer && this.glCover === layer) {
      this.showGlCover(layer, false);
      return;
    }
    // The world's picture isn't there yet (a first visit still loading the
    // world) or can't be: the DOM cover emerges now, and a world picture
    // that arrives later takes over once the DOM one has settled, so the
    // water stays interactive.
    this.coverKind = "dom";
    this.useDomCover().emerge(instant);
    if (instant || this.coverFinal) return;
    const settled = performance.now() + DOM_EMERGE_MS;
    const late = await this.glCoverWithin(LATE_GL_COVER_MS);
    if (!late || this.disposed || this.coverFinal || this.glCover !== late) return;
    await delay(Math.max(0, settled - performance.now()));
    if (this.disposed || this.coverFinal || this.glCover !== late) return;
    this.showGlCover(late, true);
    this.domCover?.dispose();
    this.domCover = null;
  }

  private showGlCover(layer: ArticleCoverLayer, settled: boolean) {
    this.coverKind = "gl";
    if (this.figure) this.figure.dataset.cover = "gl";
    layer.emerge(settled);
  }

  // ---------------------------------------------------------------- entrance

  private async signalReady() {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    if (this.disposed) return;
    const img = this.coverImg;
    await Promise.race([
      img ? img.decode().catch(() => undefined) : Promise.resolve(),
      delay(READY_TIMEOUT_MS),
    ]);
    if (!this.disposed) markArticlePageReady(this.o.pathname);
  }

  private async runEntrance() {
    const parts = heroParts(this.o.root);
    if (this.reduced) {
      showHero(parts);
      void this.emergeCover(true);
      this.reveals?.enable();
      return;
    }
    const arrival = this.o.arrival;
    const handedOff = arrival?.kind === "next";
    const flood = handedOff ? adoptFlood(this.o.data.slug) : null;
    const covered =
      Boolean(arrival && !handedOff) || isRouteCoverActive() || isArticleCoverActive();

    const fonts = document.fonts?.ready ?? Promise.resolve();
    await withinVisible(fonts, FONT_WAIT_MS);
    if (this.disposed) return;

    if (flood) {
      // The flood still covers the page: let the cover decode under it.
      const img = this.coverImg;
      await withinVisible(img ? img.decode().catch(() => undefined) : Promise.resolve(), 600);
      if (this.disposed) return;
      flood.reveal(0.9);
    } else if (covered) {
      await withinVisible(
        Promise.all([waitForRouteReveal(), waitForArticleReveal()]),
        REVEAL_WAIT_MS,
      );
      if (this.disposed) return;
    }

    this.entrance = playHeroEntrance(parts, {
      titleShown: handedOff,
      onCover: () => void this.emergeCover(),
      onStory: () => this.reveals?.enable(),
    });
  }

  // ---------------------------------------------------------------- index

  private listenIndex() {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("[data-ad-index]") : null;
      if (!(link instanceof HTMLElement)) return;
      const section = this.o.root.querySelector<HTMLElement>(
        `[data-ad-section="${link.dataset.adIndex}"]`,
      );
      if (!section) return;
      event.preventDefault();
      scrollPageTo(section, {
        duration: this.reduced ? 0 : 1.1,
        offset: -(SITE_HEADER + window.innerHeight * 0.08),
      });
      section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    };
    this.o.root.addEventListener("click", onClick);
    this.cleanups.push(() => this.o.root.removeEventListener("click", onClick));
  }

  // ---------------------------------------------------------------- reduced

  private toReduced() {
    if (this.disposed) return;
    this.stopLenis?.();
    this.stopLenis = null;
    this.lenisOn = false;
    this.entrance?.progress(1).kill();
    this.entrance = null;
    showHero(heroParts(this.o.root));
    this.reveals?.showAll();
    this.motion?.stopMotion();
    this.threshold?.dispose();
    this.magnets?.dispose();
    this.magnets = null;
    this.zoom?.setAnimate(false);
    this.threshold = null;
    this.coverFinal = true;
    if (this.coverKind === "gl") {
      this.glCover?.dispose();
      this.glCover = null;
      delete this.figure?.dataset.cover;
      this.coverKind = "dom";
    }
    this.useDomCover().emerge(true);
  }
}
