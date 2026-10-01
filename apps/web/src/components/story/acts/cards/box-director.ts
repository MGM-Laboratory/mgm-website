import { Euler, Vector3 } from "three";

import {
  Latch,
  OneShot,
  backOut,
  cubicInOut,
  damp,
  fit,
  mix,
  saturate,
  smoothstep,
  seededRandom,
  span,
  stepSpring,
  window4,
  type ActState,
  type StoryContext,
} from "@/components/story/engine/act";
import { planeToRect } from "@/components/story/engine/dom-glue";
import { LID_OPEN_DEGREES, type DeckBox } from "@/components/story/props/deck-box";
import {
  STAGE_ORIGIN,
  screenToStage,
  stageToWorld,
  type StageView,
} from "@/components/story/acts/cards/stage-space";

/**
 * The card box through Act 1: glued to its DOM placeholder during the
 * entrance (with its life added as offsets), the rise to the card stage,
 * the rest with its tap tap, the tease and the opening, its exit below the
 * frame while the deck performs, its return for the gather, the lid closing
 * and the baked fall onto the coffee table.
 *
 * The base pose is a pure function of the story position. Life (breath,
 * the lean toward the cursor, hover, a click's hop, the glint, the tap tap)
 * runs on the clock and is weighted by windows that are 0 at the drop, so
 * the box always starts its fall exactly on the bake's first frame.
 */

const DEG = Math.PI / 180;
/** The rest pose on the card stage: a slight three quarter turn and a lean of the top toward us. */
const REST_YAW = 8 * DEG;
const REST_LEAN = 4 * DEG;
/** The lid at its open hold (108 degrees) and its overshoot (112). */
const LID_HOLD = 108 / LID_OPEN_DEGREES;
const LID_OVER = 112 / LID_OPEN_DEGREES;

const eul = new Euler(0, 0, 0, "YZX");
const va = new Vector3();
const vb = new Vector3();
const forward = new Vector3();

export type BoxFrame = {
  /** The box's world position before life offsets (for the camera, the reveal origin). */
  readonly position: Vector3;
  /** 0..1: how much of the deck is still in the box. */
  stack: number;
};

export class BoxDirector {
  readonly frame: BoxFrame = { position: new Vector3(), stack: 1 };
  private readonly glued = new Vector3();
  private readonly base = new Vector3();
  private readonly hop: [number, number] = [0, 0];
  private hopTime = -1;
  private hover = 0;
  private readonly hoverSpring: [number, number] = [0, 0];
  private readonly lean: [number, number] = [0, 0];
  private readonly tilt: [number, number] = [0, 0];
  private glintAt = 3;
  private glintStart = -10;
  private tapAt = 4;
  private readonly entrance = new Latch();
  private readonly tease = new OneShot();
  private teaseStart = -10;
  /** The latched tease played on this pass: the scrubbed one stays out until the pass ends. */
  private teaseConsumed = false;
  private readonly random = seededRandom(0x5eed);
  private readonly sparkle = new OneShot();
  /** The time a sparkle burst should fire at the lid, or -1 (the act reads it). */
  lidBurst = -1;
  /** The box is under the pointer this frame (set by the act from a raycast). */
  hovered = false;

  constructor(readonly box: DeckBox) {}

  /** The pointer pressed on the box: a hop with a card popping up. */
  poke(time: number) {
    if (time - this.hopTime > 0.45) this.hopTime = time;
  }

  update(ctx: StoryContext, state: ActState, view: StageView) {
    const box = this.box;
    const root = box.root;
    const time = ctx.clock.time;
    const dt = ctx.clock.dt;
    const t = state.t;
    const drop = state.beat("c-drop");
    root.visible = true;

    if (drop > 0) {
      this.dropPose(ctx, state);
      return;
    }

    // ------------------------------------------------------------ the base pose (pure)
    const rise = state.beat("c-rise");
    const sink = smoothstep(0.18, 0.62, state.beat("c-snake"));
    const back = span(state.beat("c-gather"), 0.02, 0.34, cubicInOut);
    const square = smoothstep(0.78, 0.9, state.beat("c-gather"));
    let yaw: number;
    let leanTop: number;
    if (rise < 1) {
      this.gluedPose(ctx, this.glued);
      // Leaves the placeholder with no jump: the blend starts flat and lands with a small settle.
      const k = backOut(cubicInOut(rise), 0.55);
      this.base.copy(this.glued).lerp(STAGE_ORIGIN, Math.min(1.04, k));
      // Turns to show a side panel on the way, then settles nearly face on.
      yaw =
        -Math.sin(Math.min(1, rise) * Math.PI) * 38 * DEG + REST_YAW * smoothstep(0.55, 1, rise);
      leanTop = REST_LEAN * smoothstep(0.4, 1, rise);
    } else {
      this.base.copy(STAGE_ORIGIN);
      yaw = REST_YAW;
      leanTop = REST_LEAN;
    }
    // Out of the frame while the deck performs, back for the gather.
    const away = sink * (1 - back);
    if (away > 0) {
      screenToStage(view, 0, -1.9, 1.05, va);
      stageToWorld(va.x, va.y, va.z, vb);
      this.base.lerp(vb, cubicInOut(away));
    }
    yaw = mix(yaw, 0, square);
    leanTop = mix(leanTop, 0, square);
    this.frame.position.copy(this.base);

    // ------------------------------------------------------------ lid, flap, tease, glow (pure + one latched tease)
    const open = state.beat("c-open");
    // The tease: latched on a calm forward crossing, scrubbed otherwise (scrolling back, a jump).
    if (this.tease.cross(open, 0.12, state.velocity, 3)) {
      this.teaseStart = time;
      this.teaseConsumed = true;
    }
    if (open <= 0.02 || open >= 0.5) this.teaseConsumed = false;
    const teaseAge = time - this.teaseStart;
    const timed = teaseAge >= 0 && teaseAge < 1.25 && open > 0.02 && open < 0.5;
    let peek = 0;
    if (timed) peek = teaseCurve(teaseAge / 1.25);
    else if (!this.teaseConsumed) peek = window4(open, 0.08, 0.2, 0.24, 0.36) * 0.62;
    const lidOpen =
      fit(open, 0.38, 0.62, 0, LID_OVER, cubicInOut) -
      fit(open, 0.62, 0.78, 0, LID_OVER - LID_HOLD);
    const close = fit(state.beat("c-gather"), 0.8, 0.9, 0, 1);
    const lidClosing = close > 0 ? lidCloseCurve(close) * LID_HOLD : LID_HOLD;
    const lid = state.beat("c-open") >= 1 ? lidClosing : Math.max(0, lidOpen);
    const flap = state.beat("c-open") >= 1 ? 1.22 * (1 - close) : fit(open, 0.36, 0.56, 0, 1.22);
    const glow =
      fit(open, 0.42, 0.75, 0, 1) * (1 - smoothstep(0.3, 0.9, state.beat("c-spring"))) +
      0.35 * window4(state.beat("c-gather"), 0.25, 0.4, 0.7, 0.86);
    if (this.sparkle.cross(open, 0.55, state.velocity, 4)) this.lidBurst = time;

    // ------------------------------------------------------------ life (clock), all 0 by the drop
    const restWindow = window4(t, -0.05, 0.85, state.range.start + 1.05, state.range.start + 1.2);
    const lifeWeight =
      saturate(1 - state.beat("c-gather") * 4) * (rise < 1 ? 1 : restWindow + 0.35);
    // The entrance: rises in with a small overshoot once its top shows.
    const rect = ctx.dom.rect("box");
    const shown = rect ? rect.y < view.height * 0.97 : t > -0.3;
    if (state.arrived && t > -0.3) this.entrance.value = 1;
    this.entrance.update(shown || t >= 0, dt, 1 / 1.1, 1 / 0.6);
    const enter = this.entrance.value;
    const enterLift = rise < 1 ? (1 - backOut(enter, 2.2)) * -0.4 : 0;

    // Hover: leans in, lifts the lid a hair (the flap slides up inside), a seam of light.
    const hovering = this.hovered && Math.abs(state.velocity) < 0.08 && lifeWeight > 0.2;
    this.hover = damp(this.hover, hovering ? 1 : 0, 10, dt);
    stepSpring(this.hoverSpring, hovering ? 1 : 0, dt, 120, 11);
    // Lean toward the cursor (springs), stronger while hovered.
    const px = ctx.pointer.inside ? ctx.pointer.ndc.x : 0;
    const py = ctx.pointer.inside ? ctx.pointer.ndc.y : 0;
    const reach = 1 + this.hover * 0.8;
    stepSpring(this.lean, px * 4 * DEG * reach, dt, 60, 9);
    stepSpring(this.tilt, -py * 3 * DEG * reach, dt, 60, 9);
    const breath = Math.sin(time * ((Math.PI * 2) / 3.2)) * 0.5 + 0.5;
    // The rest's tap tap: two 2 mm hops every 4 s (only once the box sits on the stage).
    if (time > this.tapAt + 4) this.tapAt = time;
    const tapAge = time - this.tapAt;
    const tap = tapHops(tapAge) * restWindow * smoothstep(0.9, 1, rise);
    // A click: squash, a hop and a card popping up and back.
    const hopAge = time - this.hopTime;
    const hop = hopAge >= 0 && hopAge < 0.9 ? hopAge / 0.9 : -1;
    const hopLift = hop >= 0 ? hopCurve(hop) : 0;
    const squash = hop >= 0 ? squashCurve(hop) : 0;
    const hopPeek = hop >= 0 ? window4(hop, 0.12, 0.3, 0.45, 0.75) * 0.58 : 0;
    // Restless: a shiver of the cards inside while hovered.
    const shiver =
      this.hover * Math.sin(time * 37) * Math.max(0, Math.sin(time * 2.3)) * 0.35 * DEG;

    const H = box.dims.H;
    root.position.copy(this.base);
    root.position.y +=
      (tap * 0.002 + hopLift * H * 0.18 + this.hoverSpring[0] * H * 0.025 + enterLift * H) *
      lifeWeight;
    eul.set(
      0,
      yaw + (this.lean[0] + shiver) * lifeWeight,
      -leanTop + (this.tilt[0] - this.hover * 1.5 * DEG) * lifeWeight,
    );
    root.quaternion.setFromEuler(eul);
    const breathe = 1 + breath * 0.006 * lifeWeight;
    const sq = squash * lifeWeight;
    root.scale.set(breathe * (1 + sq * 0.5), breathe * (1 - sq), breathe * (1 + sq * 0.5));

    box.setLid(lid + (0.06 * this.hoverSpring[0] + hopPeek * 0.2) * lifeWeight);
    box.setFlap(flap);
    box.peek(Math.max(peek, hopPeek * lifeWeight));
    box.setStack(this.frame.stack);
    box.setGlow(Math.max(glow, this.hover * 0.16 * lifeWeight));
    box.setGlowPage(ctx.palette.scheme === "light" ? "light" : "dark");

    // The glint: a sweep every 5 to 7 s; while hovered it follows the cursor like light on varnish.
    if (time > this.glintAt) {
      this.glintStart = time;
      this.glintAt = time + 5 + this.random() * 2;
    }
    const sweep = saturate((time - this.glintStart) / 1.1);
    const sweepOn = sweep > 0 && sweep < 1 ? Math.sin(sweep * Math.PI) : 0;
    const follow = 0.5 + px * 0.42;
    const glintPhase = mix(sweep, follow, this.hover);
    box.setGlint(glintPhase, Math.max(sweepOn * 0.9, this.hover * 0.75) * lifeWeight);
    box.update(time);
  }

  /** The drop: the baked fall (`c-drop`), read from the bake's own timing. */
  private dropPose(ctx: StoryContext, state: ActState) {
    const box = this.box;
    const p = state.beat("c-drop");
    box.dropAt(dropSeconds(box, p));
    box.root.scale.setScalar(1);
    box.setLid(0);
    box.setFlap(0);
    box.peek(0);
    box.setStack(1);
    box.setGlow(0);
    box.setGlint(0, 0);
    box.setGlowPage(ctx.palette.scheme === "light" ? "light" : "dark");
    box.update(ctx.clock.time);
    this.frame.position.copy(box.root.position);
  }

  /** Where the box rests once it has landed (the bake's last frame). */
  landed() {
    const box = this.box;
    box.dropPose(1);
    box.root.scale.setScalar(1);
    box.setLid(0);
    box.setFlap(0);
    box.peek(0);
    box.setStack(1);
    box.setGlow(0);
    box.setGlint(0, 0);
    this.frame.position.copy(box.root.position);
  }

  /** The box pose that puts its front face exactly on the DOM placeholder (the entrance glue). */
  private gluedPose(ctx: StoryContext, out: Vector3) {
    const rect = ctx.dom.rect("box");
    const camera = ctx.stage.camera;
    if (!rect) {
      out.copy(STAGE_ORIGIN);
      return;
    }
    // The 1.15x parallax: the box runs ahead of the page and catches up at t = 0.
    const lag = -0.15 * Math.min(0, ctx.director.t) * ctx.size.height;
    planeToRect(camera, { ...rect, y: rect.y + lag }, ctx.size, this.box.dims.W, out);
    // The face is the box's +x side: the centre sits half a depth further away.
    camera.getWorldDirection(forward);
    out.addScaledVector(forward, this.box.dims.D / 2);
  }
}

/** The drop's time in the bake for `c-drop` progress p: a short wait, the fall (slowed a little), the hold. */
export function dropSeconds(box: DeckBox, p: number) {
  const drop = box.drop;
  const start = 0.05;
  const settle = 0.62;
  if (p <= start) return 0;
  if (p < settle) return ((p - start) / (settle - start)) * drop.settled;
  return mix(drop.settled, drop.duration, (p - settle) / (1 - settle));
}

/** The tease: a card slides half out, pauses as if to whisper, wiggles and drops back. */
function teaseCurve(u: number) {
  if (u <= 0 || u >= 1) return 0;
  const up = smoothstep(0, 0.32, u);
  const down = smoothstep(0.62, 1, u);
  const wiggle = Math.sin(u * Math.PI * 9) * 0.05 * window4(u, 0.34, 0.42, 0.52, 0.62);
  return Math.max(0, (up * (1 - down) + wiggle) * 0.68);
}

/** The lid closing: falls shut with a small bounce. */
function lidCloseCurve(u: number) {
  if (u >= 1) return 0;
  const fall = 1 - u * u * 1.15;
  const bounce = Math.max(0, Math.sin(Math.max(0, u - 0.82) * Math.PI * 5.5)) * 0.06;
  return Math.max(0, fall) + bounce;
}

/** Two small hops, 0.18 s apart (0..1 height). */
function tapHops(age: number) {
  if (age < 0 || age > 0.5) return 0;
  const one = age < 0.16 ? Math.sin((age / 0.16) * Math.PI) : 0;
  const second = age > 0.2 && age < 0.34 ? Math.sin(((age - 0.2) / 0.14) * Math.PI) * 0.7 : 0;
  return one + second;
}

/** A hop: 0..1 height over u (crouch first, then the jump, then a small rebound). */
function hopCurve(u: number) {
  if (u < 0.12) return 0;
  if (u < 0.6) return Math.sin(((u - 0.12) / 0.48) * Math.PI);
  if (u < 0.75) return Math.sin(((u - 0.6) / 0.15) * Math.PI) * 0.12;
  return 0;
}

/** Squash (+) and stretch (-) across the hop. */
function squashCurve(u: number) {
  if (u < 0.12) return Math.sin((u / 0.12) * Math.PI) * 0.06;
  if (u < 0.3) return -Math.sin(((u - 0.12) / 0.18) * Math.PI) * 0.05;
  if (u > 0.58 && u < 0.72) return Math.sin(((u - 0.58) / 0.14) * Math.PI) * 0.05;
  return 0;
}
