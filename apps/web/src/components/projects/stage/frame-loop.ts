import gsap from "gsap";

/**
 * One ordered per-frame loop for the /projects stage, riding GSAP's ticker
 * (so it shares the same rAF as every tween on the page).
 *
 * The order is the point: every "scroll" callback runs before any
 * "render" callback in the same tick. The smooth scroller moves the page
 * first, then the WebGL stage draws the covers against that exact scroll
 * position, so the fixed canvas and the DOM text land in the same frame.
 * Drawing a fixed canvas from a separate rAF (or against the compositor's
 * native scroll) visibly trails the text by a frame on fast scrolls.
 */

type FrameCallback = (time: number, dt: number) => void;
type Phase = "scroll" | "render";

const phases: Record<Phase, Set<FrameCallback>> = {
  scroll: new Set(),
  render: new Set(),
};
let installed = false;

function tick(time: number, deltaTimeMs: number) {
  // Clamp the step so a hitch or a resumed tab can't fling any physics.
  const dt = Math.min(deltaTimeMs, 50) / 1000;
  for (const callback of phases.scroll) callback(time, dt);
  for (const callback of phases.render) callback(time, dt);
}

/** Adds a per-frame callback to `phase`; returns the remove function. */
export function addFrameCallback(phase: Phase, callback: FrameCallback) {
  phases[phase].add(callback);
  if (!installed) {
    installed = true;
    gsap.ticker.add(tick);
  }
  return () => {
    phases[phase].delete(callback);
    if (installed && phases.scroll.size === 0 && phases.render.size === 0) {
      installed = false;
      gsap.ticker.remove(tick);
    }
  };
}
