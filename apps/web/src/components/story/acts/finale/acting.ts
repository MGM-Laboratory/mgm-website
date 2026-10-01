import { beatOf } from "@/components/story/engine/timeline";
import type { GodetteBodyLayer } from "@/components/story/props/godette";

/**
 * Godette's performance in the finale as a pure function of the story
 * position `t` (vh), so the same scroll position is always the same
 * moment, in either direction and after any jump.
 *
 * `t` maps to an acting time `A` in seconds (piecewise linear, knots at
 * the beat edges). At each beat's hands-off speed `A` runs at about real
 * time; a faster scroll plays it faster, like scrubbing a film. Every clip
 * is scrubbed from `A` with its own playback rate, and neighbours cross
 * fade over their blend times (the clips were authored to continue each
 * other: the end of one is the first frame of the next).
 *
 * After `wave_in`, the wave and everything later are life on the clock
 * (`life.ts`), not story.
 */

/** Phases on the acting clock, seconds. */
export const PHASE = (() => {
  // the drop through the frame after the cut: about half a second, at about real time
  const fallEnd = 0.46;
  const landRate = 1.15;
  const landEnd = fallEnd + 1.6 / landRate;
  const dizzyRate = 1.6;
  const dizzyEnd = landEnd + 2.5 / dizzyRate;
  const standRate = 1.35;
  const standEnd = dizzyEnd + 2.4 / standRate;
  const dustRate = 1.3;
  const dustEnd = standEnd + 1.8 / dustRate;
  const waveInEnd = dustEnd + 0.6;
  return {
    fallEnd,
    landRate,
    /** The bottom meets the floor (land_bottom frame 5). */
    bottomHit: fallEnd + 5 / 30 / landRate,
    landEnd,
    dizzyRate,
    dizzyEnd,
    standRate,
    standEnd,
    dustRate,
    dustEnd,
    waveInEnd,
  } as const;
})();

const CUT = beatOf("f-cut");
const LAND = beatOf("f-land");
const STAND = beatOf("f-stand");
const WAVE = beatOf("f-wave");

/** The story position (vh) where `wave_in` has played: the wave is life from here. */
export const WAVE_LIFE_T = WAVE.start + WAVE.vh * 0.3;

/**
 * The acting seconds of the dizzy sit left at `f-stand`'s start: its head
 * shake and the stars scattering play in `f-stand`. A backward advance from
 * the terminal rest stops at that start, so she rests there still seeing
 * all her stars.
 */
const SIT_LEFT = 0.6;

/** [t, A] knots, ascending. */
const KNOTS: readonly (readonly [number, number])[] = [
  [CUT.start, 0],
  [CUT.end, 0.2],
  [LAND.end, PHASE.dizzyEnd - SIT_LEFT],
  [STAND.end, PHASE.dustEnd],
  [WAVE_LIFE_T, PHASE.waveInEnd],
  [WAVE.end, PHASE.waveInEnd + 1],
];

/** The acting time for story position `t` (clamped to the finale). */
export function actingTime(t: number) {
  let previous: readonly [number, number] | null = null;
  for (const knot of KNOTS) {
    if (t <= knot[0]) {
      if (!previous) return knot[1];
      const [t0, a0] = previous;
      return a0 + ((t - t0) / (knot[0] - t0)) * (knot[1] - a0);
    }
    previous = knot;
  }
  return previous ? previous[1] : 0;
}

function saturate(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function smooth(a: number, b: number, x: number) {
  const k = saturate((x - a) / (b - a));
  return k * k * (3 - 2 * k);
}

/**
 * Root height above the floor at the cut (metres, life size): the cut opens
 * on her already in the frame, her flailing hands at its top edge, so her
 * "oh no" reads before she drops.
 */
export const FALL_FROM = 1.15;
/** A cartoon gravity (a little gentler than the real one), so the drop reads. */
const GRAVITY = 7.5;
/** She arrives already falling: the start speed that lands her at `fallEnd`. */
const FALL_V0 = (FALL_FROM - 0.5 * GRAVITY * PHASE.fallEnd ** 2) / PHASE.fallEnd;

/** Root height at acting time `A`. */
export function fallHeight(A: number) {
  if (A >= PHASE.fallEnd) return 0;
  const k = Math.max(0, A);
  return Math.max(0, FALL_FROM - FALL_V0 * k - 0.5 * GRAVITY * k * k);
}

/** Downward speed at `A` (m/s), for the speed lines and her hair. */
export function fallSpeed(A: number) {
  if (A >= PHASE.fallEnd || A < 0) return 0;
  return FALL_V0 + GRAVITY * A;
}

/** A struck spring: 0 before `at`, a damped wobble after it. */
export function impulse(A: number, at: number, frequency = 7, decay = 9) {
  const u = A - at;
  if (u < 0) return 0;
  return Math.sin(u * Math.PI * 2 * frequency) * Math.exp(-u * decay);
}

/**
 * Squash and stretch of the whole toy: stretched while she falls, squashed
 * on each hit, springing back. Returns the vertical scale (sides keep the
 * volume).
 */
export function squash(A: number) {
  // stretched by the speed, most just before the floor
  const stretch = A < PHASE.fallEnd ? 0.03 + 0.055 * smooth(0.05, PHASE.fallEnd, A) : 0;
  const feet = -0.05 * Math.max(0, impulse(A, PHASE.fallEnd, 6, 14));
  const bottom = -0.085 * Math.max(-0.5, impulse(A, PHASE.bottomHit, 4.5, 8));
  return 1 + stretch + feet + bottom;
}

/** A small vertical camera jolt on the bottom hit (fraction of the framing height). */
export function cameraJolt(A: number) {
  return 0.012 * impulse(A, PHASE.bottomHit, 9, 10);
}

/** The body layers the story wants at acting time `A` (before the wave becomes life). */
export function storyLayers(A: number): GodetteBodyLayer[] {
  const layers: GodetteBodyLayer[] = [];
  const P = PHASE;
  // falling: fall_flail lands on its frame 0 exactly at the floor (it continues into land_bottom)
  const flailTime = (((A - P.fallEnd) % 1) + 1) % 1;
  const toLand = smooth(P.fallEnd, P.fallEnd + 0.08, A);
  if (toLand < 1) layers.push({ clip: "fall_flail", weight: 1 - toLand, time: flailTime });
  if (A < P.fallEnd) return layers;

  const landTime = Math.min(1.6, (A - P.fallEnd) * P.landRate);
  const toDizzy = smooth(P.landEnd - 0.05, P.landEnd + 0.25, A);
  const toStand = smooth(P.dizzyEnd, P.dizzyEnd + 0.25, A);
  const toDust = smooth(P.standEnd, P.standEnd + 0.22, A);
  const toWave = smooth(P.dustEnd, P.dustEnd + 0.25, A);

  const land = toLand * (1 - toDizzy);
  if (land > 0) layers.push({ clip: "land_bottom", weight: land, time: landTime });
  const dizzy = toDizzy * (1 - toStand);
  if (dizzy > 0) {
    // one head circle, a little faster than authored: dizzier
    const time = Math.max(0, A - P.landEnd) * P.dizzyRate;
    layers.push({ clip: "dizzy_sit", weight: dizzy, time: Math.min(time, 2.5 - 1e-3) });
  }
  const stand = toStand * (1 - toDust);
  if (stand > 0) {
    const time = Math.min(2.4, Math.max(0, A - P.dizzyEnd) * P.standRate);
    layers.push({ clip: "stand_up", weight: stand, time });
  }
  const dust = toDust * (1 - toWave);
  if (dust > 0) {
    const time = Math.min(1.8, Math.max(0, A - P.standEnd) * P.dustRate);
    layers.push({ clip: "dust_off", weight: dust, time });
  }
  if (toWave > 0) {
    const time = Math.min(0.6, Math.max(0, A - P.dustEnd));
    layers.push({ clip: "wave_in", weight: toWave, time });
  }
  return layers;
}

/**
 * How much of her the framing has to hold at `A`: the subject's height
 * above the floor (metres, with headroom) and half its width. She drops
 * through a tall frame, the camera punches in on the bump, eases in on her
 * dizzy sit, then rises with her as she stands (the split layout's medium
 * shot, the closest of all, comes after, in the act).
 */
export function framingAt(A: number) {
  const P = PHASE;
  const drop = 3.25;
  const wide = 2.25;
  const close = 1.4;
  const standing = 2.12;
  const punch = smooth(P.fallEnd - 0.03, P.bottomHit + 0.14, A);
  const pushIn = smooth(P.bottomHit + 0.15, P.bottomHit + 1.1, A);
  const landed = drop + (wide - drop) * punch;
  const rise = smooth(P.dizzyEnd + 0.1, P.standEnd - 0.1, A);
  const height = (landed + (close - landed) * pushIn) * (1 - rise) + standing * rise;
  // sitting turned, her legs reach out to one side: hold them, and centre on her, not her feet
  const halfWidth = 0.95 + (0.55 - 0.95) * rise;
  const centreX = -0.13 * (1 - rise);
  return { height, halfWidth, centreX };
}

/** The dizzy constellation's presence (0..1): pops out after the bounce, fades as she stands. */
export function dizzyAmount(A: number) {
  const P = PHASE;
  return (
    smooth(P.bottomHit + 0.12, P.bottomHit + 0.4, A) *
    (1 - smooth(P.dizzyEnd + 0.2, P.dizzyEnd + 0.9, A))
  );
}

/** The head shake that throws the dizziness off: a yaw offset (radians) at the end of the sit. */
export function headShake(A: number) {
  const P = PHASE;
  const a = P.dizzyEnd - 0.55;
  const b = P.dizzyEnd + 0.15;
  if (A <= a || A >= b) return 0;
  const k = (A - a) / (b - a);
  return Math.sin(k * Math.PI * 2 * 3) * Math.sin(k * Math.PI) * 0.55;
}

/** How strongly she looks at the camera (head weight) from the story alone. */
export function cameraLook(A: number) {
  const P = PHASE;
  // dust_off finds the camera from its 1.4 s mark
  const find = smooth(P.standEnd + 1.25 / P.dustRate, P.standEnd + 1.6 / P.dustRate, A);
  return 0.15 + 0.7 * find;
}

/**
 * Her turn toward the camera: she lands and sits a little turned toward the
 * key light (a three-quarter view reads a sit far better than her knees
 * pointing at us), then turns to face us as she stands.
 */
export function bodyYaw(A: number) {
  const P = PHASE;
  return -0.46 * (1 - smooth(P.dizzyEnd + 0.35, P.standEnd - 0.1, A));
}
