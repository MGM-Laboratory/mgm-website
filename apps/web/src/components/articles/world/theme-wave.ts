import {
  FRONT_AHEAD,
  FRONT_SECONDS,
  frontEase,
  frontPolygon,
  frontReach,
  type ThemeFront,
} from "@/components/articles/world/fx/theme-front";
import { addFrameCallback } from "@/components/projects/stage/frame-loop";
import type { ThemeSwitchRequest } from "@/lib/theme-switch";

/**
 * The DOM half of the articles theme switch.
 *
 * The world's shaders spread the new scheme from the toggle behind a ragged
 * front (engine `setScheme` with a wave). The page's own DOM (the header,
 * the list's head, an article's text) flips through a clip that follows the
 * very same edge, frame by frame: a View Transition whose old snapshot is
 * the page as it was, and whose live new state shows only where the front
 * has passed (`--articles-wave-clip`, a polygon on the front's edge from
 * fx/theme-front.ts, a few pixels ahead of it). The canvas is live inside
 * that clip, so the ink, the dawn gold and the sparks on the edge all show
 * through the new page.
 *
 * - With the world running, the engine owns the front's clock and this
 *   reads it back (`waveFront()`); the transition ends when the front lands.
 * - Without the world (the DOM list), the clip runs on its own clock.
 * - Without the View Transitions API, the theme commits at once and the
 *   articles DOM eases its colours instead (`data-theme-fade`, world.css),
 *   while the world still plays its front.
 *
 * Never drops a request: a second click mid-switch starts its own
 * transition (the browser skips the first, landing it on its end state),
 * and only the newest switch may clean up after itself.
 */

/** Longest the snapshot waits for next-themes to apply the class. */
const COMMIT_WAIT_MS = 400;
/** How long the colour fallback eases (world.css). */
const FADE_MS = 1100;

type ViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransition;
};

/** Whatever runs the front's clock (the engine), when the world is up. */
export type ThemeWaveSource = { waveFront(): ThemeFront | null };

let generation = 0;

/** Whether the switch will reveal the DOM behind the front (a view transition). */
export function themeWaveMasksDom() {
  return typeof (document as ViewTransitionDocument).startViewTransition === "function";
}

function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function runThemeWave(request: ThemeSwitchRequest, source: ThemeWaveSource | null) {
  const doc = document as ViewTransitionDocument;
  const root = document.documentElement;
  const run = ++generation;
  const wantDark = request.next === "dark";

  if (!themeWaveMasksDom() || !doc.startViewTransition) {
    root.dataset.themeFade = "";
    request.commit();
    window.setTimeout(() => {
      if (run === generation) delete root.dataset.themeFade;
    }, FADE_MS);
    return;
  }

  const { x, y } = request.origin;
  // The new page starts fully clipped (world.css reads this until the
  // front's own clip takes over), so it never flashes in whole.
  const initialClip = `circle(0px at ${x}px ${y}px)`;
  root.style.setProperty("--articles-wave-clip", initialClip);
  root.dataset.themeWave = "";

  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        // next-themes applies the class from a passive effect, one commit
        // after setTheme: the new snapshot must wait for that very change
        // (not any class mutation on <html>).
        const observer = new MutationObserver(() => {
          if (isDark() === wantDark) done();
        });
        const timer = window.setTimeout(() => done(), COMMIT_WAIT_MS);
        function done() {
          observer.disconnect();
          window.clearTimeout(timer);
          resolve();
        }
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        request.commit();
        if (isDark() === wantDark) done();
      }),
  );

  let offFrame: (() => void) | null = null;
  transition.ready
    .then(() => {
      if (run !== generation) return;
      // One animation on the new page's snapshot holds the transition open
      // while the front sweeps and carries its clip: its keyframes are
      // rewritten every frame, which restyles only that pseudo-element
      // (a custom property on <html> would restyle the whole page).
      const hold = root.animate([{ clipPath: initialClip }, { clipPath: initialClip }], {
        duration: (FRONT_SECONDS + 2.5) * 1000,
        pseudoElement: "::view-transition-new(root)",
      });
      const effect = hold.effect instanceof KeyframeEffect ? hold.effect : null;
      // Without the world, the clip keeps its own clock.
      const own: ThemeFront = { x, y, radius: 0, time: 0, to: wantDark ? 1 : 0 };
      const reach = frontReach(x, y, window.innerWidth, window.innerHeight);
      const started = performance.now();
      let seen = false;
      offFrame = addFrameCallback("render", () => {
        if (run !== generation) {
          offFrame?.();
          return;
        }
        let front: ThemeFront | null;
        if (source) {
          front = source.waveFront();
          seen ||= front !== null;
        } else {
          const t = (performance.now() - started) / 1000;
          own.time = t;
          own.radius = reach * frontEase(t / FRONT_SECONDS);
          front = t < FRONT_SECONDS ? own : null;
          seen = true;
        }
        if (!front) {
          // The front landed (or never started): show the page as it is.
          if (seen || performance.now() - started > 600) {
            offFrame?.();
            hold.finish();
          }
          return;
        }
        const clip = frontPolygon(front, FRONT_AHEAD);
        effect?.setKeyframes([{ clipPath: clip }, { clipPath: clip }]);
      });
    })
    .catch(() => {});

  transition.finished
    .catch(() => {})
    .finally(() => {
      offFrame?.();
      if (run !== generation) return;
      delete root.dataset.themeWave;
      root.style.removeProperty("--articles-wave-clip");
    });
}
