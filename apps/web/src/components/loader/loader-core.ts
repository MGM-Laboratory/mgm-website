import { LOADER_KEY, STORY_KEY, readBoot, updateBoot } from "@/components/loader/boot";
import { hardwareWebGL2 } from "@/components/reel/gl/webgl-probe";
import { LOADER_COPY } from "@/data/story";
import { NAV_ITEMS } from "@/data/nav";
import { motionAllowed } from "@/lib/reduced-motion";

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
 * - It never writes `html { overflow }` and never makes the page inert; it
 *   only swallows wheel and touch scrolling over itself while it shows.
 * - It waits for the story's assets and warm-up on a device that can run
 *   the WebGL story (hardware WebGL2, motion allowed), otherwise only for
 *   the fonts, and never longer than 12 s of visible time: the rest keeps
 *   loading behind the page. A short minimum keeps it from flashing (shorter
 *   again on a repeat load in the same tab).
 * - Every fetch it starts catches its own failure (no unhandled rejection).
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
  minVisibleRepeatMs: 450,
  capVisibleMs: 12_000,
  /** How long a view's exit may take before the core hides it anyway. */
  exitTimeoutMs: 1_200,
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
    if (this.started) return;
    this.started = true;
    this.pathname = pathname;
    this.prefetch = prefetch;
    const boot = readBoot();
    if (!boot.loader) {
      this.set({ phase: "done" });
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

  private async work(story: boolean) {
    if (story) {
      try {
        const { ensureStoryEngine } = await import("@/components/story/engine/story-engine");
        await ensureStoryEngine((build) => {
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
    try {
      await Promise.race([document.fonts.ready, wait(2000)]);
    } catch {
      // Fonts that never settle must not hold the page.
    }
    this.workDone = true;
    this.set({ progress: 1 });
  }

  /** Visible time only (gotcha #18): a hidden tab does not count toward any limit. */
  private tick() {
    const now = performance.now();
    const step = Math.min(250, now - this.last);
    this.last = now;
    if (document.hidden) return;
    const elapsed = this.snapshot.elapsed + step;
    const phase = this.snapshot.phase;
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
    this.set({ phase: "done" });
    updateBoot({ loader: false });
    try {
      window.sessionStorage.setItem(LOADER_KEY, "1");
    } catch {
      // The fast path is a nicety.
    }
    window.dispatchEvent(new Event("mgm:loader-done"));
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

export const siteLoader = new LoaderCore();
