/**
 * The project zoom's motion, as pure functions of progress: where the
 * picture's quad sits, how far the picture inside it is zoomed, and how
 * strong each lens effect is at that moment. The WebGL renderer and the
 * DOM fallback both draw from the same frames, so they move identically.
 *
 * Geometry follows lusion.co's list-to-project zoom (re-derived, not
 * copied): the clicked frame's centre travels in a straight line to the
 * screen centre while the quad grows to cover the viewport with 20%
 * overscan, and it swings a few degrees in 3D, its inner side receding,
 * in proportion to how far off centre the card started.
 */

import type { Rgb } from "@/components/transition/project-zoom-colors";

export type Rect = { x: number; y: number; width: number; height: number };
export type View = { width: number; height: number };

/** A cover decoded for upload (WebGL), with its natural (oriented) size. */
export type PreparedPicture = {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  /** The address it was read from, to match it against a card's image. */
  url: string;
};

/** The picture a zoom shows; each renderer uses what it can. */
export type ZoomPicture = {
  url: string | null;
  element: HTMLImageElement | null;
  prepared: PreparedPicture | null;
};

export type ZoomSetup = {
  view: View;
  source: ZoomSource;
  picture: ZoomPicture;
  /** The theme colour the picture dissolves into. */
  fog: Rgb;
  /** What shows behind transparent pixels (the frame's own background). */
  backdrop: Rgb;
};

/** The WebGL renderer and the DOM fallback both implement this. */
export interface ZoomRenderer {
  begin(setup: ZoomSetup): void;
  resize(view: View): void;
  draw(frame: ZoomFrame): void;
  /** Clears and releases what the zoom held (the overlay itself hides). */
  end(): void;
}

/** The frame the zoom starts from (enter) or lands on (exit). */
export type ZoomSource = {
  /** On screen, in CSS px. */
  rect: Rect;
  /** Corner radius, CSS px. */
  radius: number;
  /** How far the picture is zoomed inside the frame at rest (1.026 on cards). */
  overscan: number;
};

export type ZoomFrame = {
  /** The quad's centre on screen and its size, CSS px. */
  cx: number;
  cy: number;
  width: number;
  height: number;
  radius: number;
  /** Turn about the vertical axis, rad (positive: the right side recedes). */
  yaw: number;
  /** Turn in the screen plane, rad, clockwise. */
  roll: number;
  /** The picture's magnification inside the quad. */
  zoom: number;
  /** Radial motion blur: streak length at `reach` from the centre, CSS px. */
  streak: number;
  /** Radial chromatic split at `reach`, CSS px. */
  split: number;
  /** Barrel distortion strength. */
  bulge: number;
  /** Dissolve front, in `reach` units: pixels beyond it have turned to the theme colour. */
  fog: number;
  /** The distance the effects are normalised to: half the viewport's diagonal, px. */
  reach: number;
  /** The full-screen theme colour layer's opacity. */
  layer: number;
  /** Header palette progress, 0 (from) to 1 (to). */
  tint: number;
  /** The quad's own opacity (the exit crossfades it onto the real card). */
  alpha: number;
};

export const ENTER_SECONDS = 1.5;
export const EXIT_SECONDS = 1.3;
/** Exit progress from which the real card shows under the fading quad. */
export const EXIT_LAND_AT = 0.9;
/** Width of the dissolve's soft edge, in `reach` units. */
export const FOG_SOFTNESS = 0.3;
/** Vertical field of view of the WebGL camera (1 unit = 1 CSS px at depth 0). */
export const FIELD_OF_VIEW = Math.PI / 3;

// The covering quad's overscan past a cover fit of the viewport: room for
// the swing's rotated corners.
const COVER_OVERSCAN = 1.2;
// Swing per viewport width of the card's offset from the centre: about 4
// degrees for a card in one of two columns.
const SWING = 0.3;
// The picture's magnification inside the quad once fully zoomed in.
const ZOOM_IN = 2.5;
// Streak px (at the reach) per unit of zoom speed (log scale, 1/s).
const STREAK_PER_RATE = 15;
const STREAK_MAX = 60;
const SPLIT_MAX = 7;
const BULGE_MAX = 0.14;
// Dissolve fronts that leave every pixel clear, or none.
const FOG_CLEAR = 1.9;
const FOG_SOLID = -0.5;
// Finite-difference step for the zoom speed.
const RATE_STEP = 0.004;

const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const fit = (x: number, from: number, to: number) => clamp01((x - from) / (to - from));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const cubicInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const sineInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const bump = (t: number) => Math.sin(Math.PI * t) ** 2;

type Motion = {
  /** 0 at the frame, 1 covering the viewport. */
  travel: (t: number) => number;
  /** The picture's magnification inside the quad. */
  zoom: (t: number, overscan: number) => number;
};

// Into the project: the quad arrives by 82% of the way; the picture keeps
// accelerating into its centre until the end, so the last beat reads as
// being pulled in rather than as a camera settling.
const ENTER: Motion = {
  travel: (t) => cubicInOut(fit(t, 0, 0.82)),
  zoom: (t, overscan) => mix(overscan, ZOOM_IN, fit(t, 0.06, 1) ** 2.6),
};

// Back out: the mirror image, decelerating onto the card, which it reaches
// at EXIT_LAND_AT so the crossfade onto the real card happens at rest.
const EXIT: Motion = {
  travel: (t) => 1 - cubicInOut(fit(t, 0, EXIT_LAND_AT)),
  zoom: (t, overscan) => mix(ZOOM_IN, overscan, 1 - (1 - fit(t, 0, 0.88)) ** 2.6),
};

function coverScale(source: ZoomSource, view: View) {
  const { width, height } = source.rect;
  return COVER_OVERSCAN * Math.max(view.width / width, view.height / height);
}

/** Total magnification of the picture on screen, for the zoom speed. */
function magnification(motion: Motion, t: number, source: ZoomSource, cover: number) {
  return mix(1, cover, motion.travel(t)) * motion.zoom(t, source.overscan);
}

function frame(
  motion: Motion,
  t: number,
  seconds: number,
  source: ZoomSource,
  view: View,
  effects: Pick<ZoomFrame, "split" | "bulge" | "fog" | "layer" | "tint" | "alpha">,
): ZoomFrame {
  const cover = coverScale(source, view);
  const travel = motion.travel(t);
  const scale = mix(1, cover, travel);
  const { x, y, width, height } = source.rect;
  const cx0 = x + width / 2;
  const cy0 = y + height / 2;
  const swing = (travel * SWING * (view.width / 2 - cx0)) / view.width;

  // The zoom speed drives the motion blur: d ln(magnification) / dt.
  const before = magnification(motion, Math.max(0, t - RATE_STEP), source, cover);
  const after = magnification(motion, Math.min(1, t + RATE_STEP), source, cover);
  const span = (Math.min(1, t + RATE_STEP) - Math.max(0, t - RATE_STEP)) * seconds;
  const rate = span > 0 ? Math.abs(Math.log(after / before)) / span : 0;

  return {
    cx: mix(cx0, view.width / 2, travel),
    cy: mix(cy0, view.height / 2, travel),
    width: width * scale,
    height: height * scale,
    radius: source.radius * scale,
    yaw: swing,
    roll: swing,
    zoom: motion.zoom(t, source.overscan),
    streak: Math.min(STREAK_MAX, rate * STREAK_PER_RATE),
    reach: Math.hypot(view.width, view.height) / 2,
    ...effects,
  };
}

/** The zoom into a project at progress `t` (0..1 over ENTER_SECONDS). */
export function enterFrame(t: number, source: ZoomSource, view: View): ZoomFrame {
  return frame(ENTER, t, ENTER_SECONDS, source, view, {
    split: SPLIT_MAX * bump(fit(t, 0.12, 0.92)),
    bulge: BULGE_MAX * sineInOut(fit(t, 0.15, 0.85)),
    // The rim goes first, the centre last.
    fog: mix(FOG_CLEAR, FOG_SOLID, sineInOut(fit(t, 0.36, 0.97))),
    layer: sineInOut(fit(t, 0.1, 0.72)),
    tint: sineInOut(fit(t, 0.12, 0.95)),
    alpha: 1,
  });
}

/** The zoom back out onto a card at progress `t` (0..1 over EXIT_SECONDS). */
export function exitFrame(t: number, source: ZoomSource, view: View): ZoomFrame {
  return frame(EXIT, t, EXIT_SECONDS, source, view, {
    split: SPLIT_MAX * bump(fit(t, 0.04, 0.8)),
    bulge: BULGE_MAX * (1 - sineInOut(fit(t, 0.08, 0.8))),
    // The centre clears first, the rim last.
    fog: mix(FOG_SOLID, FOG_CLEAR, sineInOut(fit(t, 0.02, 0.62))),
    layer: 1 - sineInOut(fit(t, 0.22, 0.82)),
    tint: sineInOut(fit(t, 0.05, 0.85)),
    alpha: 1 - fit(t, EXIT_LAND_AT, 1),
  });
}
