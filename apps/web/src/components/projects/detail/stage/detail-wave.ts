import { createScrollDeltaFilter } from "@/components/projects/stage/scroll-jump";
import { Spring } from "@/components/projects/stage/spring";

import { RIPPLE_WAVELENGTHS } from "./detail-shaders";

/**
 * Turns the page's per-frame scroll change into the screen pass's speed
 * effects. Speed is `s`: the scroll change per frame in viewport widths,
 * normalised to a 60 fps frame so a 120 Hz screen bends exactly like a 60 Hz
 * one, and clamped to +-SPEED_LIMIT in both directions.
 *
 * - Smear (lusion's): the picture is averaged along x over the distance one
 *   60 fps frame travels (|s| viewport widths), a full-frame shutter.
 * - Arch (lusion's): 2 s^2 viewport heights, sides down and middle up. It
 *   only shows on very fast flings (about 12 px at 7000 px/s).
 * - Ripple (this page's): a travelling wave whose amplitude grows with |s|
 *   past a dead zone, so a brisk fling visibly ripples the media while a
 *   reading scroll leaves them flat. The amplitude rides an underdamped
 *   spring, so the media settle like a soft sheet when the scroll stops
 *   (one small inverted swing), and land exactly flat.
 * - Split: red and blue drift apart by a few px at speed.
 *
 * Everything reads exactly 0 once the scroll has stopped and settled.
 */

const REFERENCE_FRAME = 1 / 60;
export const SPEED_LIMIT = 0.15;
// Evens out frame-to-frame jitter in the scroll steps (seconds).
const SPEED_SMOOTHING = 0.035;
const SPEED_EPSILON = 1e-5;

const SMEAR_GAIN = 1;
const ARCH_GAIN = 2;

// Ripple amplitude in viewport heights: RIPPLE_GAIN per unit of s past
// RIPPLE_DEADZONE[0], faded in across the dead zone window and eased into
// a soft cap. At 1440x900, near the viewport edges, that is nothing up to
// about 1200 px/s, then about 11 px at 2000 px/s, 19 px at 3000 px/s and
// 25 px at 4000 px/s (arch included).
const RIPPLE_DEADZONE = [0.012, 0.02] as const;
const RIPPLE_GAIN = 1.35;
const RIPPLE_MAX = 0.034;
const RIPPLE_SPRING = [2.4, 0.45, 0] as const;
const RIPPLE_EPSILON = 0.02; // CSS px
// How fast each ripple sine drifts on screen, as a share of the scroll
// speed (in the content's direction). Below 1, the media flow through the
// wave, which is what makes every point rise and fall as it travels.
const RIPPLE_DRIFT = [0.35, -0.2] as const;

const SPLIT_MAX = 3; // CSS px
const SPLIT_RAMP = [0.008, 0.06] as const;

const TAU = Math.PI * 2;

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export type WaveUniforms = {
  /** Smear length, CSS px, signed. */
  blur: number;
  arch: number;
  ripple: number;
  /** Phase of each ripple sine, radians. */
  phase: [number, number];
  split: number;
};

export class SpeedWave {
  /** Normalised speed after smoothing (viewport widths per 60 fps frame). */
  speed = 0;
  /** Last raw (unsmoothed) normalised speed, for the dev probe. */
  rawSpeed = 0;
  /** Dev-only: pins the speed (verification stills). */
  pinned: number | null = null;

  private readonly filter = createScrollDeltaFilter();
  private readonly ripple = new Spring(...RIPPLE_SPRING);
  readonly uniforms: WaveUniforms = { blur: 0, arch: 0, ripple: 0, phase: [0, 0], split: 0 };

  /**
   * Steps the wave. `scrollDelta` is the frame's signed scroll change in
   * viewport widths (the page's), `scroll` the scroll position in CSS px.
   * Returns whether anything is still moving.
   */
  step(scrollDelta: number, scroll: number, vw: number, vh: number, dt: number) {
    // A jump (a resize re-clamping the scroll, a programmatic jump) moves
    // the media but feeds none of the physics (stage/scroll-jump.ts).
    const moved = this.filter(scrollDelta * vw, vw);
    let raw = dt > 0 && vw > 0 ? ((moved / vw) * REFERENCE_FRAME) / dt : 0;
    raw = Math.min(SPEED_LIMIT, Math.max(-SPEED_LIMIT, raw));
    if (this.pinned !== null) raw = this.pinned;
    this.rawSpeed = raw;

    if (dt > 0) this.speed += (raw - this.speed) * (1 - Math.exp(-dt / SPEED_SMOOTHING));
    if (this.pinned !== null) this.speed = this.pinned;
    if (raw === 0 && Math.abs(this.speed) < SPEED_EPSILON) this.speed = 0;

    const s = this.speed;
    const size = Math.abs(s);
    const linear = vh * RIPPLE_GAIN * Math.max(0, size - RIPPLE_DEADZONE[0]);
    const cap = vh * RIPPLE_MAX;
    const target = cap * Math.tanh(linear / cap) * smoothstep(...RIPPLE_DEADZONE, size);
    this.ripple.step(dt, target);
    this.ripple.settle(RIPPLE_EPSILON);

    const u = this.uniforms;
    u.blur = s * vw * SMEAR_GAIN;
    u.arch = ARCH_GAIN * s * s * vh;
    u.ripple = this.ripple.value;
    u.split = SPLIT_MAX * smoothstep(...SPLIT_RAMP, size);
    for (let i = 0; i < 2; i++) {
      const wavelength = RIPPLE_WAVELENGTHS[i] * vw;
      u.phase[i] = ((TAU * RIPPLE_DRIFT[i] * scroll) / wavelength) % TAU;
    }
    return s !== 0 || !this.ripple.atRest;
  }
}
