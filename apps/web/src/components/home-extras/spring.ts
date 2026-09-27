import gsap from "gsap";

/**
 * A tiny damped spring, stepped at a fixed rate so it feels the same at 60
 * and 120 Hz. The homepage's playful bits (heading letters, card tilts, the
 * footer mark) all use it, so they share one feel: quick, a little jelly,
 * and always settling.
 */

export type Spring = { x: number; v: number };
/** Stiffness and damping. The damping ratio is c / (2 * sqrt(k)). */
export type SpringConfig = readonly [k: number, c: number];

export const SPRING_DT = 1 / 120;

export const spring = (x = 0): Spring => ({ x, v: 0 });

export function stepSpring(s: Spring, [k, c]: SpringConfig, target: number, dt = SPRING_DT) {
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
}

/** Whether `s` sits on `target` and has stopped moving. */
export function springAtRest(s: Spring, target: number, epsilon = 0.001, speed = 0.01) {
  return Math.abs(s.x - target) < epsilon && Math.abs(s.v) < speed;
}

export type SpringLoop = {
  /** Starts stepping (no-op while already awake). */
  wake: () => void;
  /** Stops stepping. */
  sleep: () => void;
  awake: () => boolean;
};

/**
 * Runs `step` at a fixed rate on the GSAP ticker while it reports motion,
 * then `write` once per frame. `step` returns true while anything still
 * moves; after `calmSteps` calm steps in a row the loop sleeps and calls
 * `onSleep`, so a resting effect costs nothing.
 */
export function createSpringLoop({
  frame,
  step,
  write,
  onSleep,
  calmSteps = 12,
}: {
  /** Once per frame before stepping: read the DOM here (rects, the pointer). */
  frame?: () => void;
  step: (dt: number) => boolean;
  write: () => void;
  onSleep?: () => void;
  calmSteps?: number;
}): SpringLoop {
  let running = false;
  let acc = 0;
  let calm = 0;

  const tick = (_time: number, deltaMs: number) => {
    frame?.();
    // Clamped, so a hitch or a tab coming back never fires a huge step.
    acc += Math.min(deltaMs, 50) / 1000;
    while (acc >= SPRING_DT) {
      acc -= SPRING_DT;
      calm = step(SPRING_DT) ? 0 : calm + 1;
    }
    write();
    if (calm > calmSteps) {
      sleep();
      onSleep?.();
    }
  };

  function wake() {
    if (running) return;
    running = true;
    acc = 0;
    calm = 0;
    gsap.ticker.add(tick);
  }

  function sleep() {
    if (!running) return;
    running = false;
    gsap.ticker.remove(tick);
  }

  return { wake, sleep, awake: () => running };
}
