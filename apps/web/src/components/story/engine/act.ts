/**
 * The act contract of the homepage story (SPEC section 2.4). Every act
 * (`acts/cards`, `acts/room`, `acts/worlds`, `acts/finale`) implements
 * `StoryAct`, and the director calls it with a `StoryContext` and an
 * `ActState` every frame it is near. docs/homepage-story.md walks through
 * it; the rules in short:
 *
 * - Story state is a pure function of `ActState` (scroll position): the same
 *   `t` always looks like the same moment, in either direction, after any
 *   jump. Life (loops, particles, idle, blinking) runs on `ctx.clock`, and
 *   nothing on the clock may change the story state.
 * - The act that owns the current beat is `active`: it alone writes the
 *   camera and calls `ctx.stage.setScene()`. A `near` act that is not
 *   active may prepare (visibility, prewarm) but never touches the camera.
 * - Per-frame settings start from their defaults every frame: the scene
 *   (the root scene), the post effects (all off), the backdrop (transparent,
 *   nothing behind revealed), the overlay hint and HUD (none) and the header
 *   tone (none). The active act sets what it needs in `update()`, so a beat
 *   left in any direction never leaves a stale setting behind.
 * - `init()` builds everything from `ctx.assets` (already fetched) and
 *   compiles its programs with `ctx.stage.compile()`, so nothing compiles on
 *   first sight. `dispose()` frees everything the act created; the stage
 *   outlives routes and an act may be re-created on a later visit.
 *
 * Helpers for pure scroll maths (fit, easing, springs, latches, one-shot
 * crossings) are at the bottom. This module never imports three.js at
 * runtime: types only.
 */

import type { Intersection, Object3D, PerspectiveCamera, Scene, WebGLRenderer } from "three";

import type { StoryFile, StoryLoaderLike, StoryTier } from "@/components/story/assets/types";
import {
  clamp,
  cubicBezier,
  easeSettle,
  expoInOut,
  expoOut,
  fit,
  mix,
  quadInOut,
  saturate,
  seededRandom,
  smoothstep,
  stepSpring,
} from "@/components/reel/reel-math";
import type { ActRange, BeatId, StoryActId, StoryBeatId } from "@/components/story/engine/timeline";

export type { BeatId, StoryActId, StoryBeatId, StoryTier };

// ------------------------------------------------------------------ basics

/** A rectangle in CSS px. */
export type StoryRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** The canvas size this frame. `width`/`height` in CSS px; `dpr` is the pixel ratio in use. */
export type StorySize = Readonly<{
  width: number;
  height: number;
  dpr: number;
  aspect: number;
  portrait: boolean;
}>;

export type StoryScheme = "light" | "dark";

/**
 * Page and brand colours for the current scheme, as 0xRRGGBB for
 * `color.setHex()`. `page` is the DOM page colour (`--background`), which
 * anything that must match the page pixel for pixel paints with
 * `toneMapped: false`.
 */
export type StoryPalette = Readonly<{
  scheme: StoryScheme;
  page: number;
  ink: number;
  line: number;
  blue: number;
  yellow: number;
  red: number;
  green: number;
  white: number;
  /** The owner's assets keep their own colours in both schemes. */
  cardBack: number;
  box: number;
}>;

/**
 * Object layers the stage composes. Everything on `front` (layer 0, the
 * default) draws over the backdrop. Put the room and anything else that the
 * page colour should hide on `behind` only (`object.layers.set(behind)`):
 * it shows only where the backdrop is revealed.
 */
export const STORY_LAYERS = { front: 0, behind: 1 } as const;

// ------------------------------------------------------------------ stage

/**
 * Post effects, set per frame (every frame starts from `POST_DEFAULTS`, all
 * off, and costs nothing then). `bloom` is a cheap display-space bloom:
 * `bloomThreshold` is a luminance in 0..1, `bloomRadius` 0..1 widens it.
 * `flash` adds `flashColor`, `fade` mixes toward `fadeColor`. `exposure`
 * is the tone mapping exposure of lit materials this frame (1 by default;
 * the room's lamps warming up, a rift's flash): it costs no pass and leaves
 * `toneMapped: false` materials (the backdrop, page-matched colours) alone.
 */
export type StoryPostParams = {
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  vignette: number;
  grain: number;
  flash: number;
  flashColor: number;
  fade: number;
  fadeColor: number;
  exposure: number;
};

export const POST_DEFAULTS: Readonly<StoryPostParams> = {
  bloom: 0,
  bloomThreshold: 0.8,
  bloomRadius: 0.5,
  vignette: 0,
  grain: 0,
  flash: 0,
  flashColor: 0xffffff,
  fade: 0,
  fadeColor: 0x000000,
  exposure: 1,
};

export interface StoryPostApi {
  /** Merges `params` into this frame's settings. */
  set(params: Partial<StoryPostParams>): void;
  readonly params: Readonly<StoryPostParams>;
}

/**
 * The page colour backdrop, set per frame (defaults: `BACKDROP_DEFAULTS`).
 *
 * - `paint` 0 leaves what is not revealed transparent, so the DOM page shows
 *   through the canvas (the entrance); 1 paints the page colour there,
 *   exact to the DOM (`toneMapped: false`).
 * - `reveal` 0 shows nothing of the `behind` layer; 1 shows all of it; in
 *   between, a noisy radial dissolve from `origin` (NDC) opens it, with an
 *   `edge` band (0..1) drawn in `edgeColor`.
 * - `color` overrides the page colour (null: `palette.page`).
 */
export type StoryBackdropParams = {
  paint: number;
  reveal: number;
  origin: readonly [number, number];
  noise: number;
  edge: number;
  edgeColor: number;
  color: number | null;
};

export const BACKDROP_DEFAULTS: Readonly<StoryBackdropParams> = {
  paint: 0,
  reveal: 0,
  origin: [0, 0],
  noise: 0.35,
  edge: 0,
  edgeColor: 0xf7bf33,
  color: null,
};

export interface StoryBackdropApi {
  set(params: Partial<StoryBackdropParams>): void;
  readonly params: Readonly<StoryBackdropParams>;
}

export type StoryFrameInfo = Readonly<{
  /** Draw calls and triangles of the last rendered frame. */
  calls: number;
  triangles: number;
  /** CPU time of the last frame's update and render, ms. */
  frameMs: number;
  /** Frames per second over the last second. */
  fps: number;
}>;

/** What an act sees of the stage. One renderer, one camera, one canvas for the whole story. */
export interface StoryStageApi {
  readonly renderer: WebGLRenderer;
  /** The shared scene: room, deck, character, toy letters and the card act's objects. */
  readonly rootScene: Scene;
  /** The one camera. The active act sets it every frame (pose, fov, near, far). */
  readonly camera: PerspectiveCamera;
  /** Picks the scene that renders this frame (defaults to `rootScene` every frame). */
  setScene(scene: Scene): void;
  readonly scene: Scene;
  readonly post: StoryPostApi;
  readonly backdrop: StoryBackdropApi;
  /**
   * Compiles `scene`'s programs against the stage camera and uploads its
   * textures, in both the direct and the post path. Call it from `init()`
   * (and after adding objects later), never let a program compile on first
   * sight.
   */
  compile(scene?: Scene): Promise<void>;
  readonly info: StoryFrameInfo;
}

// ------------------------------------------------------------------ inputs

/** Pointer state over the story canvas, updated before every frame. */
export interface StoryPointer {
  /** Position in NDC over the canvas: x right, y up, -1..1. */
  readonly ndc: Readonly<{ x: number; y: number }>;
  /** Position in CSS px from the canvas's top left. */
  readonly px: Readonly<{ x: number; y: number }>;
  /** Smoothed velocity, CSS px per second. */
  readonly velocity: Readonly<{ x: number; y: number }>;
  readonly down: boolean;
  /**
   * Over the story's canvas area, not over the header or an interactive DOM
   * control. Over an overlay hotspot it is inside too (hover and raycasts
   * work on the object under it), but presses there belong to the hotspot's
   * link or button and are not routed to `pointer()`.
   */
  readonly inside: boolean;
  readonly type: "mouse" | "pen" | "touch" | "none";
  /** Raycasts `objects` from the camera through the pointer (empty when not inside). */
  raycast(objects: readonly Object3D[], recursive?: boolean): Intersection[];
  /** The story's cursor while the pointer is inside (null: the default). */
  setCursor(cursor: string | null): void;
}

/**
 * A pointer event routed by the stage to the active act. `tap` follows the
 * site's touch rule (gotcha #29): a mouse or pen taps on `down`, a finger
 * only on an `up` that moved under 12 px and was never cancelled.
 */
export type StoryPointerEvent = Readonly<{
  type: "down" | "up" | "tap" | "move" | "leave";
  pointerType: "mouse" | "pen" | "touch";
  ndc: Readonly<{ x: number; y: number }>;
  px: Readonly<{ x: number; y: number }>;
  raycast(objects: readonly Object3D[], recursive?: boolean): Intersection[];
}>;

// ------------------------------------------------------------------ overlay

export type StoryHotspotSpec = Readonly<{
  /** Stable id (one hotspot per id). */
  id: string;
  /** The accessible name (no native tooltip: the overlay draws its own focus ring). */
  label: string;
  /** A link target, or `onActivate` for a button. */
  href?: string;
  onActivate?: () => void;
}>;

/** A real DOM control over a GL object: focus ring, keyboard, screen readers. */
export interface StoryHotspot {
  /** Places it over `rect` (canvas CSS px) this frame, or hides it (null). */
  place(rect: StoryRect | null): void;
  readonly hovered: boolean;
  readonly focused: boolean;
  dispose(): void;
}

/** The fixed DOM layer over the story (`story-overlay.tsx`). Hint and HUD are per frame. */
export interface StoryOverlay {
  /** The small hint line near the bottom (null: none). */
  setHint(text: string | null): void;
  /** The HUD caption at the top left (Geist Mono), for the world captions. */
  setHud(text: string | null): void;
  /** Creates (or returns) the hotspot for `spec.id`. */
  hotspot(spec: StoryHotspotSpec): StoryHotspot;
}

// ------------------------------------------------------------------ DOM

/**
 * DOM elements of the story section the acts glue to:
 * - `section`: the whole `<section id="story">`.
 * - `intro`: the entrance screen (the first story vh of the section).
 * - `title`, `description`: the big "Competencies" and its line.
 * - `box`: the card box placeholder (its front face spans 80% of the title's width).
 * - `finale`: the "Let's work together." block at the end.
 */
export type StoryDomAnchor = "section" | "intro" | "title" | "description" | "box" | "finale";

export interface StoryDom {
  readonly section: HTMLElement;
  element(anchor: StoryDomAnchor): HTMLElement | null;
  /**
   * The anchor's rect this frame in canvas CSS px, measured once per frame
   * after the smooth scroller moved the page (gotcha #30). Null when absent.
   */
  rect(anchor: StoryDomAnchor): StoryRect | null;
  /** Where the canvas is in the viewport this frame (it follows the page during the entrance and the outro). */
  readonly canvasRect: StoryRect;
}

// ------------------------------------------------------------------ assets and props

/** Parsed, cached assets. `StoryLoaderLike` over bytes already fetched. */
export interface StoryAssets extends StoryLoaderLike {
  /** Every manifest file for the current tier. */
  readonly files: readonly StoryFile[];
  /** Whether `url`'s bytes are in the cache (false: failed, or not in the manifest). */
  has(url: string): boolean;
}

/** A dev label: a camera-facing text sprite (the placeholder acts name their beats with it). */
export interface StoryLabel {
  readonly object: Object3D;
  /** Redraws the text (cheap when unchanged). */
  setText(text: string): void;
  dispose(): void;
}

export interface StoryLabelFactory {
  create(options?: { height?: number; color?: string; background?: string }): StoryLabel;
}

/**
 * Shared props (the deck box, the cards, the room, Godette, fx, the toy
 * letters) are registered here, built once by whichever act asks first and
 * reused by the others. A prop package adds its key by module augmentation,
 * with no edit to this file:
 *
 * ```ts
 * declare module "@/components/story/engine/act" {
 *   interface StoryPropMap { room: StoryRoom }
 * }
 * const room = await ctx.props.ensure("room", () => loadRoom(ctx.assets, ctx.tier));
 * ```
 *
 * A prop with a `dispose()` method is disposed with the stage.
 */
export interface StoryPropMap {
  labels: StoryLabelFactory;
}

export interface StoryProps {
  /** The prop for `key`, building it with `build` the first time (concurrent callers share one build). */
  ensure<K extends keyof StoryPropMap>(
    key: K,
    build: () => StoryPropMap[K] | Promise<StoryPropMap[K]>,
  ): Promise<StoryPropMap[K]>;
  /** The prop for `key` once built, else undefined. */
  get<K extends keyof StoryPropMap>(key: K): StoryPropMap[K] | undefined;
}

// ------------------------------------------------------------------ director and context

export type StoryClock = Readonly<{
  /** Seconds of visible time since the stage started. */
  time: number;
  /** This frame's step, seconds (clamped to 50 ms). */
  dt: number;
  /** `dt` scaled by the freeze: `dt * mix(1, 0.3, freeze)`. Life layers use this. */
  storyDt: number;
}>;

export type DirectorReadout = Readonly<{
  /** The story position in vh (what is on screen). */
  t: number;
  /** The last input direction: 1 down the page, -1 up. Time layers flow this way. */
  direction: 1 | -1;
  /** Rendered scroll velocity, vh per second. */
  velocity: number;
  /** 0..1, press and hold. */
  freeze: number;
  /**
   * Press and hold: a pointer or finger kept down for a moment (a finger
   * without scrolling). A scroll drag or a quick click is not a hold.
   */
  held: boolean;
  /** Auto-advance is moving the page right now. */
  autoAdvancing: boolean;
  /** Seconds since the last real input. */
  idle: number;
}>;

export interface StoryContext {
  readonly stage: StoryStageApi;
  readonly assets: StoryAssets;
  readonly props: StoryProps;
  readonly size: StorySize;
  readonly tier: StoryTier;
  readonly palette: StoryPalette;
  readonly pointer: StoryPointer;
  readonly overlay: StoryOverlay;
  readonly clock: StoryClock;
  readonly director: DirectorReadout;
  readonly dom: StoryDom;
  /** The header's ink over the story this frame: "dark" over a dark scene (light ink), null to let the page decide. */
  setHeaderTone(tone: "light" | "dark" | null): void;
}

/** Where an act is on the timeline this frame. */
export interface ActState {
  readonly act: StoryActId;
  readonly range: ActRange;
  /** The story position in vh. */
  readonly t: number;
  /** 0..1 across the act's range (0 before it, 1 after it). */
  readonly progress: number;
  /** The beat under `t` inside this act (`c-enter` during the entrance, for the cards), else null. */
  readonly current: StoryBeatId | null;
  /** Progress in `current`, 0..1 (0 when `current` is null). */
  readonly local: number;
  /** Progress of any beat: 0 before it, 1 after it. */
  beat(id: BeatId): number;
  /** The same as a record (`state.beats["c-open"]`). */
  readonly beats: Readonly<Record<BeatId, number>>;
  /** Progress from the start of `from` to the end of `to`. */
  span(from: BeatId, to: BeatId): number;
  /** The entrance: 0 while the section top is a screen or more below the viewport top, 1 at `t = 0`. */
  readonly entrance: number;
  readonly direction: 1 | -1;
  /** vh per second. */
  readonly velocity: number;
  readonly freeze: number;
  /** Owns the camera and the scene this frame. */
  readonly active: boolean;
  /** Within the act's window: its range plus the neighbouring acts' first or last beat. */
  readonly near: boolean;
  /** True on the first frame of a run of near frames (a fresh arrival: reset time layers). */
  readonly arrived: boolean;
}

export interface StoryAct {
  readonly id: StoryActId;
  /** Builds everything from `ctx.assets` (already fetched) and compiles its programs. */
  init(ctx: StoryContext): Promise<void>;
  /** Every frame while near; owns the camera while active. */
  update(ctx: StoryContext, state: ActState): void;
  /** Pointer events routed by the stage while active. Return true when consumed. */
  pointer?(ctx: StoryContext, event: StoryPointerEvent): boolean;
  /** The palette changed (theme), outside the locked range. */
  palette?(ctx: StoryContext): void;
  resize?(ctx: StoryContext): void;
  /** The quality governor changed the tier. */
  tier?(ctx: StoryContext): void;
  /** The act left its window: hide what it shows, stop its own work. */
  sleep?(ctx: StoryContext): void;
  dispose(): void;
}

/** What `acts/<id>/index.ts` exports. */
export type StoryActFactory = () => StoryAct;

// ------------------------------------------------------------------ helpers

export {
  clamp,
  cubicBezier,
  easeSettle,
  expoInOut,
  expoOut,
  fit,
  mix,
  quadInOut,
  saturate,
  seededRandom,
  smoothstep,
  stepSpring,
};

/** Overshoots then settles (a "rise with a small overshoot"). */
export function backOut(t: number, overshoot = 1.70158) {
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

export function cubicInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function cubicOut(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** Progress of `t` across [a, b], clamped, optionally eased. */
export function span(t: number, a: number, b: number, ease?: (x: number) => number) {
  return fit(t, a, b, 0, 1, ease);
}

/** Frame-rate independent exponential approach: `current` moves toward `target` at `lambda` per second. */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return mix(current, target, 1 - Math.exp(-lambda * dt));
}

/** A tent: 0 at `a`, 1 in [b, c], 0 at `d` (smoothstepped edges). */
export function window4(t: number, a: number, b: number, c: number, d: number) {
  return smoothstep(a, b, t) * (1 - smoothstep(c, d, t));
}

/**
 * A latched timed beat (lusion's end title): once `on`, it plays forward on
 * the clock at `up` per second; once off, it plays back at `down` per
 * second. Reads 0..1 in `value`.
 */
export class Latch {
  value = 0;

  update(on: boolean, dt: number, up = 1, down = 1) {
    this.value = saturate(this.value + (on ? up : -down) * dt);
    return this.value;
  }
}

/**
 * A one-shot burst on a forward crossing: `cross()` is true on the frame
 * `p` passes `at` going forward at under `maxSpeed` vh/s (a fling or a
 * jump fires nothing), and it re-arms once `p` is back under `rearm`.
 */
export class OneShot {
  private armed = true;
  private last = 0;

  cross(p: number, at: number, velocity: number, maxSpeed = 6, rearm = 0) {
    const crossed = this.armed && this.last < at && p >= at;
    this.last = p;
    if (p <= rearm) this.armed = true;
    if (!crossed) return false;
    this.armed = false;
    return Math.abs(velocity) <= maxSpeed;
  }
}

/** A cut with a hysteresis band, so a visitor parked on the border never flickers. */
export class Cut {
  private on = false;

  update(p: number, at: number, band = 0.01) {
    if (!this.on && p > at + band) this.on = true;
    else if (this.on && p < at - band) this.on = false;
    return this.on;
  }

  get value() {
    return this.on;
  }
}
