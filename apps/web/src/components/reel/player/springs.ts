/**
 * The small maths the full-screen reel player moves with: a second-order
 * spring (the "procedural animation" dynamics lusion.co's player cursor
 * uses, pole-matched so a long frame never makes it explode), and the
 * handful of easing curves its ratios are shaped by.
 */

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const saturate = (value: number) => clamp(value, 0, 1);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Maps `value` from [a, b] onto [c, d], clamped, optionally eased. */
export function fit(
  value: number,
  a: number,
  b: number,
  c: number,
  d: number,
  ease?: (t: number) => number,
) {
  let t = saturate((value - a) / (b - a));
  if (ease) t = ease(t);
  return c + t * (d - c);
}

/** Moves `current` toward `target` by at most `rate * dt`. */
export function approach(current: number, target: number, rate: number, dt: number) {
  const step = rate * dt;
  if (current < target) return Math.min(target, current + step);
  return Math.max(target, current - step);
}

/** A frame-rate independent exponential follow: `k` is the share left after one second. */
export function damp(current: number, target: number, k: number, dt: number) {
  return target + (current - target) * Math.pow(k, dt);
}

export function smoothstep(a: number, b: number, value: number) {
  const t = saturate((value - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const ax = 3 * x1 - 3 * x2 + 1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 3 * y1 - 3 * y2 + 1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const error = sampleX(t) - x;
      const slope = slopeX(t);
      if (Math.abs(error) < 1e-5 || Math.abs(slope) < 1e-6) break;
      t -= error / slope;
    }
    return sampleY(clamp(t, 0, 1));
  };
}

export const ease = {
  quadInOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubicOut: (t: number) => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Overshoots to about 1.1 before settling. */
  backOut: (t: number) => {
    const s = 1.70158;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  },
  /** Winds back about 10% first and overshoots about 10% at the end. */
  backInOut: (t: number) => {
    const s = 2.5949095;
    const u = t * 2;
    if (u < 1) return 0.5 * u * u * ((s + 1) * u - s);
    const v = u - 2;
    return 0.5 * (v * v * ((s + 1) * v + s) + 2);
  },
  /** Holds, then lands fast: cubic-bezier(.35, 0, 0, 1). */
  hold: cubicBezier(0.35, 0, 0, 1),
  /** The iris: answers the click at once, sweeps out, and settles softly. */
  iris: cubicBezier(0.3, 0.08, 0.08, 1),
};

/**
 * A second-order system following a target: frequency `f` (Hz), damping
 * `z` (below 1 overshoots), and response `r` (above 1 anticipates the
 * target's motion, below 0 winds up against it). Robust to long frames:
 * the gain is pole-matched whenever a step is too large for plain Euler.
 */
export class Spring {
  value: number;
  velocity = 0;
  private previous: number;
  private k1 = 0;
  private k2 = 0;
  private k3 = 0;
  private w = 0;
  private z = 0;
  private d = 0;

  constructor(
    initial: number,
    f: number,
    z: number,
    r: number,
    /** Integrate the value with the old velocity first (lusion's vector follow). */
    private explicit = false,
  ) {
    this.value = initial;
    this.previous = initial;
    this.tune(f, z, r);
  }

  tune(f: number, z: number, r: number) {
    const w = 2 * Math.PI * f;
    this.w = w;
    this.z = z;
    this.d = w * Math.sqrt(Math.abs(z * z - 1));
    this.k1 = z / (Math.PI * f);
    this.k2 = 1 / (w * w);
    this.k3 = (r * z) / w;
  }

  reset(value: number) {
    this.value = value;
    this.previous = value;
    this.velocity = 0;
  }

  update(dt: number, target: number) {
    if (dt <= 0) return this.value;
    const targetVelocity = (target - this.previous) / dt;
    this.previous = target;
    let k1 = this.k1;
    let k2 = this.k2;
    if (this.w * dt < this.z) {
      k2 = Math.max(this.k2, (dt * dt) / 2 + (dt * this.k1) / 2, dt * this.k1);
    } else {
      const t1 = Math.exp(-this.z * this.w * dt);
      const alpha = 2 * t1 * (this.z <= 1 ? Math.cos(dt * this.d) : Math.cosh(dt * this.d));
      const beta = t1 * t1;
      const t2 = dt / (1 + beta - alpha);
      k1 = (1 - beta) * t2;
      k2 = dt * t2;
    }
    if (this.explicit) this.value += dt * this.velocity;
    this.velocity +=
      (dt * (target + this.k3 * targetVelocity - this.value - k1 * this.velocity)) / k2;
    if (!this.explicit) this.value += dt * this.velocity;
    return this.value;
  }
}
