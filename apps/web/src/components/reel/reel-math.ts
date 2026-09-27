/**
 * Small, allocation-free maths for the reel: remapping, the easing curves
 * its timing is built on, the eased pin offset and a tiny spring. Shared by
 * the DOM controller and the WebGL layer so both move identically.
 */

export const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export const saturate = (value: number) => clamp(value, 0, 1);

export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Maps `value` from [a, b] to [c, d], clamped, through an optional ease. */
export function fit(
  value: number,
  a: number,
  b: number,
  c: number,
  d: number,
  ease?: (t: number) => number,
) {
  const t = saturate((value - a) / (b - a));
  return c + (ease ? ease(t) : t) * (d - c);
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** A 1D cubic Bézier through p0..p3 at t. */
export function bezier1(p0: number, p1: number, p2: number, p3: number, t: number) {
  const c = (p1 - p0) * 3;
  const b = (p2 - p1) * 3 - c;
  const a = p3 - p0 - c - b;
  return ((a * t + b) * t + c) * t + p0;
}

/**
 * A CSS-style cubic-bezier(x1, y1, x2, y2) easing, solved for x with a few
 * Newton steps and a bisection fallback.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i += 1) {
      const error = sampleX(t) - x;
      if (Math.abs(error) < 1e-5) return sampleY(t);
      const slope = slopeX(t);
      if (Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 24; i += 1) {
      const value = sampleX(t);
      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** The reel's house curve: a slow start and a long, soft landing. */
export const easeSettle = cubicBezier(0.35, 0, 0, 1);

export function expoInOut(t: number) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 0.5 * Math.pow(2, 20 * t - 10) : 0.5 * (2 - Math.pow(2, -20 * t + 10));
}

export function expoOut(t: number) {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

export function quadInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * The pin: how far the big video lags the page, in px, for a scroll
 * position `e` px past the point where it is centred on screen.
 *
 * The video travels one viewport height while the page scrolls two. It
 * eases in over the first 0.75 vh, holds perfectly still for 0.5 vh and
 * eases out over the last 0.75 vh. The velocity relative to the page runs
 * 1 → 0 → 1 without a jump, so the hold engages and lets go smoothly.
 */
export function pinOffset(e: number, vh: number) {
  const k = Math.min(1, (e + 0.5 * vh) / (2 * vh));
  if (k <= 0) return 0;
  const m = 4 * k;
  let held: number;
  if (m <= 1.5) held = bezier1(0, 0.5, 1, 1, m / 1.5);
  else if (m <= 2.5) held = 1;
  else held = bezier1(1, 1, 1.5, 2, (m - 2.5) / 1.5);
  return ((m - held) / 2) * vh;
}

/**
 * A critically-underdamped spring toward `target`, stepped by `dt` seconds.
 * `state` is [value, velocity], updated in place. Frame-rate independent
 * (semi-implicit Euler in fixed substeps).
 */
export function stepSpring(
  state: [number, number],
  target: number,
  dt: number,
  stiffness = 170,
  damping = 14,
) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i += 1) {
    const force = (target - state[0]) * stiffness - state[1] * damping;
    state[1] += force * h;
    state[0] += state[1] * h;
  }
  return state[0];
}

/** A deterministic PRNG (mulberry32) for seeded shapes that must never vary between loads. */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
