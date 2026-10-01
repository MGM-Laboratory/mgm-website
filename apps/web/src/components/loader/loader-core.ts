import {
  LOADER_KEY,
  STORY_KEY,
  markBootLive,
  readBoot,
  updateBoot,
} from "@/components/loader/boot";
import { hardwareWebGL2 } from "@/components/reel/gl/webgl-probe";
import type { StoryTier } from "@/components/story/assets/types";
import { LOADER_COPY } from "@/data/story";
import { NAV_ITEMS } from "@/data/nav";
import { motionAllowed } from "@/lib/reduced-motion";
import { markRouteCoverStarted, markRouteRevealDone } from "@/lib/route-reveal";

/**
 * The site loader's core (docs/homepage-story.md, "The loader"): what it
 * waits for, how long it may stay, and when it goes. The visuals are a
 * separate view (`loader-view.tsx`) that reads `LoaderSnapshot`; the core
 * owns every rule a view must not break:
 *
 * - It shows on a hard load of a public route only (the boot script sets
 *   `html[data-loader="active"]`: not `/admin`, `/forms/*`, `/s/*`, and not
 *   under `navigator.webdriver` unless `?loader=1`). A client navigation
 *   never shows it again (it mounts once, in the root layout).
 * - It never writes `html { overflow }` and never makes the page inert; while
 *   it covers the page it swallows wheel and touch scrolling over itself, and
 *   the boot script keeps the keyboard from scrolling or moving focus underneath.
 * - It waits for the story's assets and warm-up on a device that can run
 *   the WebGL story (hardware WebGL2, motion allowed), otherwise only for
 *   the fonts, and never longer than 12 s of visible time: the rest keeps
 *   loading behind the page. A short minimum keeps it from flashing.
 * - A repeat load in the same tab (a reload) is the fast path: the view
 *   starts on the finished box. On a fast device (the story's high tier) it
 *   waits only for the fonts and the story builds behind the page, which it
 *   does without a dropped frame. Anywhere else the build (from the HTTP
 *   cache it is mostly parsing and shader compiles) would share a slow main
 *   thread with the reveal and the page's entrance, so it waits for that
 *   too, for at most `repeatBuildCapMs` of visible time; what is left
 *   finishes behind the page (the story section shows its own waiting
 *   state if someone gets there first).
 * - Every fetch it starts catches its own failure (no unhandled rejection).
 * - While it shows it counts as a route cover (`lib/route-reveal.ts`), so
 *   every entrance that waits for the route curtain (the header, the
 *   projects and articles pages) waits for the loader's reveal too, and the
 *   visitor sees each page start from its first frame.
 * - When it is done: `html[data-loader="done"]`, a `mgm:loader` flag for the
 *   fast path, and a full prefetch of the menu's routes at idle (skipped
 *   under webdriver).
 */

export type LoaderPhase = "waiting" | "loading" | "leaving" | "done";

export type LoaderSnapshot = Readonly<{
  phase: LoaderPhase;
  /** Real work progress, 0..1. */
  progress: number;
  loadedBytes: number;
  totalBytes: number;
  /** The WebGL story's assets are part of the wait (a capable device). */
  story: boolean;
  /** A loader already finished in this tab: the fast path. */
  repeat: boolean;
  reducedMotion: boolean;
  /** Visible milliseconds since it showed. */
  elapsed: number;
  /** What the polite live region says. */
  announcement: string;
}>;

export const LOADER_TIMING = {
  minVisibleMs: 900,
  minVisibleRepeatMs: 100,
  capVisibleMs: 12_000,
  /**
   * The longest a reload's fast path waits for the story's build below the
   * high tier (from the HTTP cache it takes about 2 to 3 s on a mid phone).
   * Leaving earlier would not be quicker: the build would share the main
   * thread with the reveal and the page's entrance.
   */
  repeatBuildCapMs: 4_000,
  /**
   * How long a view's exit may take before the core hides it anyway. The
   * deal's longest outro (the last cards land and print, the fold, the
   * peek, the tap and the reveal) is about 4.5 s, and timers slip on a busy
   * phone; this is only the failsafe for a view that never calls `onExited`.
   */
  exitTimeoutMs: 8_000,
  /** Once the view starts its reveal, it always gets at least this long to finish it. */
  revealGraceMs: 1_500,
} as const;

const INITIAL: LoaderSnapshot = {
  phase: "waiting",
  progress: 0,
  loadedBytes: 0,
  totalBytes: 0,
  story: false,
  repeat: false,
  reducedMotion: false,
  elapsed: 0,
  announcement: "",
};

type PrefetchRoute = (href: string) => void;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function storyCapable(pathname: string) {
  const boot = readBoot();
  if (pathname === "/") return boot.story === "gl";
  try {
    if (window.sessionStorage.getItem(STORY_KEY) === "dom") return false;
  } catch {
    // No storage: decide on the device alone.
  }
  return motionAllowed() && hardwareWebGL2();
}

/** The story's tier guess for this device (no three.js needed); "low" when it cannot be read. */
function storyTier(): Promise<StoryTier> {
  return import("@/components/story/engine/quality")
    .then(({ guessStoryTier, storyTierOverride }) => {
      return storyTierOverride(window.location.search) ?? guessStoryTier();
    })
    .catch((): StoryTier => "low");
}

class LoaderCore {
  private snapshot: LoaderSnapshot = INITIAL;
  private readonly listeners = new Set<() => void>();
  private started = false;
  private workDone = false;
  private leavingFor = 0;
  private clock = 0;
  private last = 0;
  private prefetch: PrefetchRoute | null = null;
  private pathname = "/";
  private revealed = false;
  private readonly revealWaiters = new Set<() => void>();
  private readonly goneWaiters = new Set<() => void>();
  private readonly visibleWaiters = new Set<{ ms: number; resolve: () => void }>();

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = () => this.snapshot;

  readonly getServerSnapshot = () => INITIAL;

  private set(patch: Partial<LoaderSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  /** Starts once per document (the root layout mounts the loader once). */
  start(pathname: string, prefetch: PrefetchRoute) {
    // The bundle runs: the boot script's own give-up timer is no longer needed.
    markBootLive();
    if (this.started) return;
    this.started = true;
    this.pathname = pathname;
    this.prefetch = prefetch;
    const boot = readBoot();
    if (!boot.loader) {
      // Nothing covers the page (or the boot script's failsafe already took the loader down).
      this.revealing();
      this.set({ phase: "done" });
      this.gone();
      this.afterDone();
      return;
    }
    const story = storyCapable(pathname);
    this.set({
      phase: "loading",
      story,
      repeat: boot.repeat,
      reducedMotion: !motionAllowed(),
      announcement: LOADER_COPY.started,
    });
    this.last = performance.now();
    this.clock = window.setInterval(() => {
      this.tick();
    }, 100);
    void this.work(story);
  }

  /** The view's exit animation finished. */
  readonly exited = () => {
    if (this.snapshot.phase === "leaving") this.finish();
  };

  /** The view starts to uncover the page (its reveal); the page's own entrance may start. */
  readonly revealing = () => {
    if (this.revealed) return;
    this.revealed = true;
    // A reveal that started is never cut short by the failsafe.
    if (this.snapshot.phase === "leaving") {
      this.leavingFor = Math.min(
        this.leavingFor,
        LOADER_TIMING.exitTimeoutMs - LOADER_TIMING.revealGraceMs,
      );
    }
    if (coverMarked) markRouteRevealDone("loader");
    for (const resolve of [...this.revealWaiters]) resolve();
    this.revealWaiters.clear();
  };

  /** Resolves when the page starts to show from under the loader, at once when there is none. */
  whenRevealed(): Promise<void> {
    if (this.revealed || !readBoot().loader) return Promise.resolve();
    return new Promise((resolve) => {
      this.revealWaiters.add(resolve);
    });
  }

  /** Resolves when the loader has gone (its exit has played), at once when there is none. */
  whenGone(): Promise<void> {
    if (this.snapshot.phase === "done" || !readBoot().loader) return Promise.resolve();
    return new Promise((resolve) => {
      this.goneWaiters.add(resolve);
    });
  }

  private gone() {
    for (const resolve of [...this.goneWaiters]) resolve();
    this.goneWaiters.clear();
  }

  /** Resolves once the loader has shown for `ms` of visible time. */
  private visibleFor(ms: number) {
    return new Promise<void>((resolve) => {
      if (this.snapshot.elapsed >= ms) resolve();
      else this.visibleWaiters.add({ ms, resolve });
    });
  }

  private async work(story: boolean) {
    if (story) {
      const build = this.buildStory();
      if (!this.snapshot.repeat) {
        await build;
      } else if ((await storyTier()) !== "high") {
        // The fast path waits for the build too, but only so long: the rest
        // finishes behind the page.
        await Promise.race([build, this.visibleFor(LOADER_TIMING.repeatBuildCapMs)]);
      }
    }
    try {
      await Promise.race([document.fonts.ready, wait(2000)]);
    } catch {
      // Fonts that never settle must not hold the page.
    }
    this.workDone = true;
    this.set({ progress: 1 });
  }

  /** Starts (or joins) the story's build, reporting its progress; never rejects. */
  private async buildStory() {
    try {
      // The bytes start at once, beside the engine's own (larger) chunk: the
      // byte cache and the tier guess need no three.js, and the engine's
      // preload joins this run (same tier, same groups).
      void this.preloadBytes();
      const { ensureStoryEngine } = await import("@/components/story/engine/story-engine");
      await ensureStoryEngine((build) => {
        if (this.snapshot.phase !== "loading") return;
        this.set({
          progress: Math.max(this.snapshot.progress, build.fraction),
          loadedBytes: build.bytes.loadedBytes,
          totalBytes: build.bytes.totalBytes,
        });
      });
    } catch {
      // The story decides again on `/`; the loader only waited for it.
    }
  }

  /** The story's byte download, reported as the fetch share of the build (0 to 0.8). */
  private async preloadBytes() {
    try {
      const [{ preloadStory }, tier] = await Promise.all([
        import("@/components/story/assets/cache"),
        storyTier(),
      ]);
      await preloadStory(tier, (bytes) => {
        if (this.snapshot.phase !== "loading" || bytes.totalBytes <= 0) return;
        this.set({
          progress: Math.max(this.snapshot.progress, (bytes.loadedBytes / bytes.totalBytes) * 0.8),
          loadedBytes: bytes.loadedBytes,
          totalBytes: bytes.totalBytes,
        });
      });
    } catch {
      // The engine's own build fetches them too.
    }
  }

  /** Visible time only (gotcha #18): a hidden tab does not count toward any limit. */
  private tick() {
    const now = performance.now();
    const step = Math.min(250, now - this.last);
    this.last = now;
    if (document.hidden) return;
    const elapsed = this.snapshot.elapsed + step;
    const phase = this.snapshot.phase;
    for (const waiter of [...this.visibleWaiters]) {
      if (elapsed < waiter.ms) continue;
      this.visibleWaiters.delete(waiter);
      waiter.resolve();
    }
    if (phase === "loading") {
      const min = this.snapshot.repeat
        ? LOADER_TIMING.minVisibleRepeatMs
        : LOADER_TIMING.minVisibleMs;
      if ((this.workDone && elapsed >= min) || elapsed >= LOADER_TIMING.capVisibleMs) {
        this.set({ elapsed, phase: "leaving", announcement: LOADER_COPY.ready });
        this.leavingFor = 0;
        return;
      }
      this.set({ elapsed });
      return;
    }
    if (phase === "leaving") {
      this.leavingFor += step;
      if (this.leavingFor >= LOADER_TIMING.exitTimeoutMs) this.finish();
    }
  }

  private finish() {
    window.clearInterval(this.clock);
    this.revealing();
    this.set({ phase: "done" });
    updateBoot({ loader: false });
    try {
      window.sessionStorage.setItem(LOADER_KEY, "1");
    } catch {
      // The fast path is a nicety.
    }
    window.dispatchEvent(new Event("mgm:loader-done"));
    this.gone();
    this.afterDone();
  }

  /** The menu's routes, fully prefetched once the browser is idle (never under `navigator.webdriver`). */
  private afterDone() {
    const prefetch = this.prefetch;
    if (!prefetch || navigator.webdriver) return;
    const run = () => {
      for (const item of NAV_ITEMS) {
        if (item.kind !== "link" || item.href === this.pathname) continue;
        try {
          prefetch(item.href);
        } catch {
          // A prefetch that fails only costs the next navigation a round trip.
        }
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 4000 });
    } else {
      window.setTimeout(run, 1500);
    }
  }
}

/**
 * A loader that shows covers the first page like the route curtain does.
 * Marked when this module first runs on the client, before any page effect
 * can ask (`waitForRouteReveal`); released when the view starts its reveal.
 */
const coverMarked = typeof window !== "undefined" && readBoot().loader;
if (coverMarked) markRouteCoverStarted("loader");

export const siteLoader = new LoaderCore();

/**
 * For a page's entrance: resolves when the loader starts to uncover the
 * page (the view's reveal), or at once when no loader shows (a client
 * navigation, `navigator.webdriver`, a route without one). The homepage
 * hero waits for it so its entrance is the first thing the visitor sees.
 */
export function whenLoaderRevealed() {
  return siteLoader.whenRevealed();
}

/**
 * Resolves when the loader has fully gone (its exit has played), or at once
 * when no loader shows. Heavy setup that would cost the reveal its frames
 * (the compact hero's physics) waits for this instead.
 */
export function whenLoaderGone() {
  return siteLoader.whenGone();
}
