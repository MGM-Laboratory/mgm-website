import gsap from "gsap";

import type { ArticlesWorldApi, WorldMode } from "@/components/articles/world/world-api";
import { onWorldState } from "@/components/articles/world/world-registry";
import {
  isArticleCoverActive,
  waitForArticleReveal,
  type ArticleArrival,
} from "@/lib/article-transition";
import { isRouteCoverActive, waitForRouteReveal } from "@/lib/route-reveal";

/**
 * How the list appears (the articles entrance protocol, shared by every
 * articles page):
 *
 * - A fresh load plays at once, after the fonts (bounded): the title's
 *   letters rise, the search row follows, the world's lens
 *   settles from a strongly warped frame, and the cards on screen rise out
 *   of the fog row by row.
 * - Arriving under a cover (the portal from another page, the route
 *   curtain, or an in-world transition) the pieces wait hidden until
 *   every cover reveals, then play the same entrance (without the lens
 *   settle, which belongs to a first visit), so the list unrolls as the
 *   fog thins.
 * - Coming back from an article ("close", or a return note) the list is
 *   simply there, as it was left: the pieces show the moment the reveal
 *   starts and the transition carries everything in.
 * - Reduced motion: everything is visible at once, nothing moves.
 *
 * Hidden means `visibility` on the pieces (articles.css keys it on the
 * page's `data-entrance`), never a transform class and never the head
 * itself, which the transitions move. A visible-time failsafe plays the
 * entrance if a cover never reveals.
 */

export type EntranceKind = "fresh" | "held" | "return" | "instant";

/** Longest a fresh load waits for its fonts before playing anyway. */
const FONTS_MS = 700;
/** Visible time a held entrance waits for its covers before playing anyway. */
const HOLD_FAILSAFE_MS = 8000;
/** Visible time to wait for the world to decide its mode. */
const WORLD_MS = 1600;

export function entranceKind(options: {
  arrival: ArticleArrival | undefined;
  returning: boolean;
  motion: boolean;
}): EntranceKind {
  if (!options.motion) return "instant";
  if (options.returning || options.arrival?.kind === "close") return "return";
  if (options.arrival || isRouteCoverActive() || isArticleCoverActive()) return "held";
  return "fresh";
}

/** Resolves after `ms` of visible time (a hidden tab freezes the page, not timers: gotcha #18). */
export function visibleDelay(ms: number, signal: { cancelled: boolean }) {
  return new Promise<void>((resolve) => {
    let left = ms;
    let since = performance.now();
    let timer = 0;
    const stop = () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    const arm = () => {
      since = performance.now();
      timer = window.setTimeout(() => {
        stop();
        resolve();
      }, left);
    };
    const onVisibility = () => {
      if (signal.cancelled) {
        stop();
        return;
      }
      if (document.hidden) {
        window.clearTimeout(timer);
        left = Math.max(0, left - (performance.now() - since));
      } else {
        arm();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (document.hidden) onVisibility();
    else arm();
  });
}

/** Resolves with the world's mode once it is decided (bounded: "pending" if it never is). */
export function whenWorldDecided(signal: { cancelled: boolean }, ms = WORLD_MS) {
  return new Promise<{ mode: WorldMode; world: ArticlesWorldApi | null }>((resolve) => {
    let off: (() => void) | null = null;
    let done = false;
    const finish = (mode: WorldMode, world: ArticlesWorldApi | null) => {
      if (done) return;
      done = true;
      off?.();
      resolve({ mode, world });
    };
    off = onWorldState((mode, world) => {
      if (mode !== "pending") finish(mode, world);
    });
    if (done) off();
    void visibleDelay(ms, signal).then(() => finish("pending", null));
  });
}

export type ListEntrance = {
  /** Resolves when the pieces are visible (or the entrance was cancelled). */
  shown: Promise<void>;
  dispose(): void;
};

/**
 * Starts the list's entrance on `root` ([data-articles-page]). Returns at
 * once; the pieces play (or show) when their moment comes.
 */
export function startListEntrance(root: HTMLElement, kind: EntranceKind): ListEntrance {
  const signal = { cancelled: false };
  const timeline = gsap.timeline({ paused: true });
  const offs: (() => void)[] = [];
  let resolveShown: () => void = () => {};
  const shown = new Promise<void>((resolve) => {
    resolveShown = resolve;
  });
  let played = false;

  const setState = (state: "pending" | "playing" | "done") => {
    root.dataset.entrance = state;
  };

  // The world may arrive before or after the entrance: cards registered
  // before it plays wait deep in the fog; a world that turns up after it
  // played lifts its cards straight out of the fog instead of popping in.
  let worldSeen: ArticlesWorldApi | null = null;
  const followWorld = (withIntro: boolean, lens: boolean) => {
    offs.push(
      onWorldState((mode, world) => {
        if (mode !== "gl" || !world || world === worldSeen) return;
        worldSeen = world;
        if (!withIntro) return;
        if (played) {
          // Late: the cards registered in this same notification (their
          // listeners subscribed first), so they rise right away.
          requestAnimationFrame(() => {
            if (signal.cancelled) return;
            world.cards.playIntro();
            if (lens) world.fx.settleLens(1.5);
          });
        } else {
          world.cards.prepareIntro();
        }
      }),
    );
  };

  const reveal = (animate: boolean, lens: boolean) => {
    if (signal.cancelled || played) return;
    played = true;
    if (!animate) {
      setState("done");
      resolveShown();
      return;
    }
    const chars = root.querySelectorAll<HTMLElement>("[data-title-char]");
    const search = root.querySelector<HTMLElement>('[data-entrance-piece="search"]');
    gsap.set(chars, { yPercent: 118, rotate: 7 });
    if (search) gsap.set(search, { autoAlpha: 0, y: 18 });
    setState("playing");
    resolveShown();
    timeline
      .to(chars, { yPercent: 0, rotate: 0, duration: 1.15, ease: "expo.out", stagger: 0.045 }, 0)
      // clearProps: a leftover transform would make these rows the
      // containing block of the fixed filter sheet and its veil inside them.
      .to(
        search ?? [],
        { autoAlpha: 1, y: 0, duration: 0.9, ease: "power3.out", clearProps: "transform" },
        0.22,
      )
      .call(() => setState("done"), undefined, ">");
    timeline.play(0);
    if (worldSeen) {
      worldSeen.cards.playIntro();
      if (lens) worldSeen.fx.settleLens(1.5);
    }
  };

  setState(kind === "instant" || kind === "return" ? "done" : "pending");

  if (kind === "instant") {
    played = true;
    resolveShown();
  } else if (kind === "return") {
    // As it was left: visible as soon as nothing covers it any more.
    setState("pending");
    followWorld(false, false);
    void Promise.all([waitForRouteReveal(), waitForArticleReveal()]).then(() =>
      reveal(false, false),
    );
    void visibleDelay(HOLD_FAILSAFE_MS, signal).then(() => reveal(false, false));
  } else if (kind === "held") {
    followWorld(true, false);
    void Promise.all([waitForRouteReveal(), waitForArticleReveal()]).then(() =>
      reveal(true, false),
    );
    void visibleDelay(HOLD_FAILSAFE_MS, signal).then(() => reveal(true, false));
  } else {
    followWorld(true, true);
    const fonts = document.fonts?.ready ?? Promise.resolve();
    void Promise.race([fonts, visibleDelay(FONTS_MS, signal)]).then(() => reveal(true, true));
  }

  return {
    shown,
    dispose() {
      signal.cancelled = true;
      timeline.kill();
      for (const off of offs.splice(0)) off();
      // Never leave anything hidden behind (a remount starts afresh).
      if (root.dataset.entrance !== "done") setState("done");
      resolveShown();
    },
  };
}
