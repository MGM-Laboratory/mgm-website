import type { ThemeSwitchRequest } from "@/lib/theme-switch";

/**
 * The DOM half of the articles theme switch. The world's shaders spread the
 * new scheme from the toggle as a ragged circular front (engine setScheme
 * with a wave); this reveals the page's own DOM (header, hero, controls)
 * through a matching circle, with the View Transitions API: the old page is
 * a still snapshot, the new one is live underneath (the canvas keeps
 * animating inside it), and the circle grows at the same pace and from the
 * same point as the world's front, a little ahead of it so the ragged edge
 * shows inside.
 *
 * Without the API the theme simply commits; the world still plays its wave.
 */

export const THEME_WAVE_SECONDS = 1.6;
/** power2.inOut, the world wave's ease. */
const EASING = "cubic-bezier(0.45, 0, 0.55, 1)";
/** Longest the snapshot waits for next-themes to apply the class. */
const COMMIT_WAIT_MS = 400;

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void> | void) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

export function runThemeWave(request: ThemeSwitchRequest) {
  const doc = document as ViewTransitionDocument;
  const root = document.documentElement;
  if (typeof doc.startViewTransition !== "function") {
    request.commit();
    return;
  }
  const { x, y } = request.origin;
  const reach =
    Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 320;

  root.dataset.themeWave = "";
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        // next-themes applies the class from a passive effect, one commit
        // after setTheme: the new snapshot must wait for it.
        const observer = new MutationObserver(() => done());
        const timer = window.setTimeout(() => done(), COMMIT_WAIT_MS);
        function done() {
          observer.disconnect();
          window.clearTimeout(timer);
          resolve();
        }
        observer.observe(root, { attributes: true, attributeFilter: ["class"] });
        request.commit();
      }),
  );
  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`],
        },
        {
          duration: THEME_WAVE_SECONDS * 1000,
          easing: EASING,
          pseudoElement: "::view-transition-new(root)",
        },
      );
    })
    .catch(() => {});
  transition.finished
    .catch(() => {})
    .finally(() => {
      delete root.dataset.themeWave;
    });
}
