import { Quaternion, Vector3 } from "three";

import {
  cubicInOut,
  expoOut,
  fit,
  mix,
  saturate,
  smoothstep,
  window4,
  type ActState,
} from "@/components/story/engine/act";
import { beatOf } from "@/components/story/engine/timeline";
import { CARD_H, CARD_THICKNESS } from "@/components/story/props/card-mesh";
import { hash01, hashSigned } from "@/components/story/props/deck-shared";
import type { DeckLayout } from "@/components/story/acts/cards/deck-layout";

/**
 * The deck's choreography (CREATIVE 4, ACTS Act 1, research inspiration
 * section 2): every card's pose as a pure function of the story position,
 * plus life layers on the clock that add on top and fade to nothing at the
 * edges of their beats.
 *
 * - The spring (`c-spring`): card i leaves the box at its launch time,
 *   accelerates out of the mouth (tight at the source, loose at the catch),
 *   spins about its long edge and flexes, then rides the stream.
 * - The snake (`c-snake`): follow the leader along the path; each card
 *   rolls with the path's direction on screen (its long edge across the
 *   stream, like a ribbon spread), banks with the curvature and undulates.
 * - The waterfall (the first half of `c-fan`): the path ends in an S that
 *   pours into the stack, where each card is caught with a small bounce.
 * - The pressure fan (`c-fan`): every card turns about one pivot below the
 *   stack, expo out, the index corners spiralling.
 * - The draw (`c-draw`): the four leave the fan and stop dead in their
 *   slots; the rest open into a wheel behind them, smaller and misted.
 * - The gather (`c-gather`): the wheel spins and unrolls from its top into
 *   the return stream, the four are thrown into it spinning flat, and the
 *   stream pours back into the box.
 *
 * Card frame (stage space): x across, y along the length, z out of the back
 * toward the camera. `flip` turns a card about its long axis (0 shows the
 * back to the camera, pi its face).
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** Vh after the spring's start by which every card has left the box. */
const EMIT_END = 0.64;
/** Vh a card takes to pop out of the box (the spring's release), easing into the stream's speed. */
const POP = 0.04;
/** Spring flight: the stretch of path (metres) a card spins and rolls through after the mouth. */
const FLIGHT = 0.42;
/** The stack's pitch between cards (toward the camera), metres. */
const STACK_PITCH = CARD_THICKNESS * 1.6;
/** Gather progress: the wheel unrolls in this window, and every card is in the box by `GATHER_IN`. */
const UNROLL_FROM = 0.06;
const UNROLL_TO = 0.32;
const GATHER_IN = 0.8;
/** How far the wheel behind the four recedes into the page. */
const WHEEL_MIST = 0.66;

const SPRING_START = beatOf("c-spring").start;
const DRAW_START = beatOf("c-draw").start;
const GATHER_START = beatOf("c-gather").start;
const GATHER_VH = beatOf("c-gather").vh;
/** Vh after the spring's start when the pour into the stack ends (the snake's end, half the fan). */
const POUR_END = beatOf("c-fan").start - SPRING_START + beatOf("c-fan").vh * 0.45;

export type CardPose = {
  readonly position: Vector3;
  readonly quaternion: Quaternion;
  /** Turn about the long axis: 0 back to camera, pi face to camera. */
  flip: number;
  /** Curl along the length and flex across the width (shares of the half size). */
  curl: number;
  flex: number;
  /** 0 clear, 1 the page colour (receding). */
  mist: number;
  scale: number;
  visible: boolean;
  /** 0 while the card is still inside the box (no life may move it), 1 clear of it. */
  free: number;
};

export function createPose(): CardPose {
  return {
    position: new Vector3(),
    quaternion: new Quaternion(),
    flip: 0,
    curl: 0,
    flex: 0,
    mist: 0,
    scale: 1,
    visible: false,
    free: 1,
  };
}

/** Beat progress the whole deck reads once a frame. */
export type DeckBeats = {
  /** Vh since the spring started. */
  u: number;
  open: number;
  spring: number;
  snake: number;
  fan: number;
  draw: number;
  turn: number;
  hold: number;
  gather: number;
  drop: number;
  /** Vh from the draw's start to now, held at the gather's start (the wheel's scrubbed turn). */
  sinceDraw: number;
};

export type StreamExtent = { head: number; tail: number; back: boolean; on: number };

export function createBeats(): DeckBeats {
  return {
    u: -1,
    open: 0,
    spring: 0,
    snake: 0,
    fan: 0,
    draw: 0,
    turn: 0,
    hold: 0,
    gather: 0,
    drop: 0,
    sinceDraw: 0,
  };
}

export function readBeats(state: ActState, out: DeckBeats) {
  out.u = state.t - SPRING_START;
  out.open = state.beat("c-open");
  out.spring = state.beat("c-spring");
  out.snake = state.beat("c-snake");
  out.fan = state.beat("c-fan");
  out.draw = state.beat("c-draw");
  out.turn = state.beat("c-turn");
  out.hold = state.beat("c-hold");
  out.gather = state.beat("c-gather");
  out.drop = state.beat("c-drop");
  out.sinceDraw = Math.max(0, Math.min(state.t, GATHER_START) - DRAW_START);
  return out;
}

/** Where the four drawn cards sit in the deck (spread through it, so they leave the fan apart). */
export function heroIndices(count: number): readonly number[] {
  return [0.2, 0.4, 0.6, 0.8].map((share) => Math.round(count * share));
}

/**
 * Distance along the snake `tau` vh after a card's launch: it pops out of the
 * box fast (covering `exit` in POP vh while easing down to the stream's
 * speed), then rides the stream at `speed`.
 */
function streamTravel(tau: number, speed: number, exit: number) {
  if (tau <= 0) return 0;
  const v0 = Math.max(speed, (2 * exit) / POP - speed);
  if (tau < POP) return v0 * tau - ((v0 - speed) * tau * tau) / (2 * POP);
  return exit + speed * (tau - POP);
}

/** The time after launch at which `streamTravel` reaches `s`. */
function streamArrival(s: number, speed: number, exit: number) {
  if (s >= exit) return POP + (s - exit) / speed;
  const v0 = Math.max(speed, (2 * exit) / POP - speed);
  const a = (v0 - speed) / (2 * POP);
  if (a < 1e-9) return s / v0;
  return (v0 - Math.sqrt(Math.max(0, v0 * v0 - 4 * a * s))) / (2 * a);
}

function travel(tau: number, speed: number, accel: number) {
  if (tau <= 0) return 0;
  if (tau < accel) return (speed * tau * tau) / (2 * accel);
  return speed * (tau - accel / 2);
}

const zAxis = new Vector3(0, 0, 1);
const xAxis = new Vector3(1, 0, 0);
const yAxis = new Vector3(0, 1, 0);
const qa = new Quaternion();
const qb = new Quaternion();
const qIdentity = new Quaternion();
/** The return stream's orientation (never one of `orient`'s own scratch quaternions). */
const qPath = new Quaternion();
const va = new Vector3();
const vb = new Vector3();
const vc = new Vector3();
const tangent = new Vector3();

/** A card rolled by `roll` on screen, banked by `bank` about its x and yawed by `yaw` about its y. */
function orient(out: Quaternion, roll: number, bank: number, yaw: number) {
  out.setFromAxisAngle(zAxis, roll);
  qa.setFromAxisAngle(xAxis, bank);
  qb.setFromAxisAngle(yAxis, yaw);
  return out.multiply(qa).multiply(qb);
}

/** The nearest multiple of a full turn to `angle`. */
function nearestTurn(angle: number) {
  return Math.round(angle / TAU) * TAU;
}

function positiveMod(value: number, m: number) {
  return ((value % m) + m) % m;
}

export type DeckOptions = {
  count: number;
  heroes: readonly number[];
};

/**
 * Pure poses for every card; the act calls `pose(i, ...)` once a frame
 * for each, and reads `stackFill` for the box's stack.
 */
export class DeckMotion {
  count = 0;
  heroes: readonly number[] = [];
  /** Deck index to wheel index (-1 for the four). */
  private wheelIndex: number[] = [];
  private wheelCount = 0;
  private readonly held = createPose();
  private readonly fanned = createPose();

  constructor(options: DeckOptions) {
    this.setCount(options.count, options.heroes);
  }

  setCount(count: number, heroes: readonly number[]) {
    this.count = count;
    this.heroes = heroes;
    this.wheelIndex = [];
    let w = 0;
    for (let i = 0; i < count; i += 1) {
      if (heroes.includes(i)) this.wheelIndex.push(-1);
      else {
        this.wheelIndex.push(w);
        w += 1;
      }
    }
    this.wheelCount = w;
  }

  heroOf(i: number) {
    return this.heroes.indexOf(i);
  }

  /** Card i's launch, vh after the spring's start. */
  launch(i: number) {
    return (EMIT_END * i) / Math.max(1, this.count - 1);
  }

  /** The stream's speed: the last card reaches the stack as the pour ends. */
  private streamSpeed(length: number, exit: number) {
    return (length - exit) / (POUR_END - EMIT_END - POP);
  }

  /** Cards in the box, 0..1 (the box's stack). */
  stackFill(beats: DeckBeats, layout: DeckLayout) {
    if (beats.drop > 0 || beats.u <= 0) return 1;
    let inBox = 0;
    if (beats.gather > 0) {
      for (let i = 0; i < this.count; i += 1) {
        if (this.gatherDistance(i, beats, layout) >= layout.back.length) inBox += 1;
      }
    } else {
      const exit = layout.exitLength;
      const speed = this.streamSpeed(layout.snake.length, exit);
      for (let i = 0; i < this.count; i += 1) {
        if (streamTravel(beats.u - this.launch(i), speed, exit) < exit * 0.5) inBox += 1;
      }
    }
    return inBox / Math.max(1, this.count);
  }

  /** The pose of card i; false (and `visible` false) while it is in the box. */
  pose(i: number, beats: DeckBeats, layout: DeckLayout, time: number, out: CardPose) {
    resetPose(out);
    if (beats.drop > 0 || beats.u <= this.launch(i)) {
      out.visible = false;
      return false;
    }
    if (beats.gather > 0) return this.gatherPose(i, beats, layout, time, out);
    if (beats.draw > 0) return this.drawnPose(i, beats, layout, time, out);
    return this.flightPose(i, beats.u, beats.fan, layout, time, out);
  }

  /**
   * The stream's extent for the spine thread: the first and the last card's
   * distance along the active path (the snake, or the return in the gather)
   * and how much of the spine shows.
   */
  stream(beats: DeckBeats, layout: DeckLayout, out: StreamExtent) {
    out.on = 0;
    out.back = false;
    if (beats.drop > 0 || beats.u <= 0) return out;
    if (beats.gather > 0) {
      let head = 0;
      let tail = Infinity;
      const L = layout.back.length;
      for (let i = 0; i < this.count; i += 1) {
        const s = this.gatherDistance(i, beats, layout);
        if (s <= 0) continue;
        head = Math.max(head, Math.min(L, s));
        if (s < L) tail = Math.min(tail, s);
      }
      out.back = true;
      out.head = head;
      out.tail = Number.isFinite(tail) ? tail : head;
      out.on = window4(beats.gather, UNROLL_FROM, UNROLL_FROM + 0.06, GATHER_IN - 0.12, GATHER_IN);
      return out;
    }
    const L = layout.snake.length;
    const exit = layout.exitLength;
    const speed = this.streamSpeed(L, exit);
    out.head = Math.min(L, streamTravel(beats.u - this.launch(0), speed, exit));
    out.tail = Math.min(L, streamTravel(beats.u - this.launch(this.count - 1), speed, exit));
    out.on = smoothstep(0.02, 0.2, beats.u) * (1 - smoothstep(POUR_END - 0.3, POUR_END, beats.u));
    return out;
  }

  // ------------------------------------------------------------------ spring, snake, stack, fan

  private flightPose(
    i: number,
    u: number,
    fan: number,
    layout: DeckLayout,
    time: number,
    out: CardPose,
  ) {
    const path = layout.snake;
    const L = path.length;
    const exit = layout.exitLength;
    const speed = this.streamSpeed(L, exit);
    const tau = u - this.launch(i);
    const since = tau - streamArrival(L, speed, exit);
    if (since < 0) {
      this.streamPose(i, Math.min(L, streamTravel(tau, speed, exit)), layout, speed, u, time, out);
      return true;
    }
    // Caught in the stack: settles upright with a small bounce, then the pressure fan opens.
    const catchK = smoothstep(0, 0.14, since);
    const rollIn = path.rollAt(L) - Math.PI / 2;
    const roll = mix(rollIn, nearestTurn(rollIn), catchK);
    const bounce = Math.exp(-since * 16) * Math.sin(since * 46) * 0.0035;
    const open = expoOut(fit(fan, 0.46 + i * 0.0004, 0.96, 0, 1));
    const share = this.count > 1 ? i / (this.count - 1) : 0.5;
    const angle = layout.fanSpread * (0.5 - share) * open;
    const radius = layout.stack.y - layout.pivot.y + i * 0.00012 * open;
    out.position.set(
      layout.pivot.x - Math.sin(angle) * radius,
      layout.pivot.y + Math.cos(angle) * radius + bounce,
      layout.stack.z + i * STACK_PITCH,
    );
    orient(out.quaternion, roll * (1 - open) + angle, 0, 0);
    out.curl = Math.sin(catchK * Math.PI) * 0.05 + window4(fan, 0.46, 0.55, 0.62, 0.8) * 0.08;
    out.mist = 0.12 * open;
    return true;
  }

  /**
   * A card riding the stream at distance s. First the exit: straight up the
   * box, upright in its plane, until its bottom clears the rim; then the
   * spring's flight: it rolls into the stream, turns once or twice about its
   * long edge and flexes, tight at the source and loose at the catch.
   */
  private streamPose(
    i: number,
    s: number,
    layout: DeckLayout,
    speed: number,
    u: number,
    time: number,
    out: CardPose,
  ) {
    const path = layout.snake;
    const exit = layout.exitLength;
    path.point(s, out.position);
    if (s < exit) {
      out.quaternion.copy(layout.cardInBox);
      out.free = 0;
      return;
    }
    path.tangent(s, tangent);
    const roll = path.rollAt(s) - Math.PI / 2;
    const curvature = path.curvatureAt(s);
    const sf = s - exit;
    const flightK = saturate(sf / FLIGHT);
    const flight = smoothstep(0, FLIGHT, sf);
    const spins = hash01(i, 7) < 0.7 ? 1 : 2;
    // Life: the stream undulates across its direction and every card flutters (none at the mouth).
    const flow = window4(u, 0.3, 0.9, POUR_END - 0.55, POUR_END) * smoothstep(0, 0.12, sf);
    out.free = smoothstep(0, 0.06, sf);
    va.set(-tangent.y, tangent.x, 0).normalize();
    out.position.addScaledVector(va, Math.sin(time * 2.2 + i * 0.35) * 0.0045 * flow);
    out.position.z += Math.sin(time * 1.4 + i * 0.6) * 0.003 * flow;
    const bank = Math.max(-35 * DEG, Math.min(35 * DEG, curvature * 0.09 * speed)) * flight;
    const flutter = Math.sin(time * 5 + i * 2) * 4 * DEG * flow;
    const yaw = tangent.z * 0.5 * flight + Math.sin(time * 3.1 + i) * 3 * DEG * flow;
    orient(qPath, mix(0, roll, flight) + flutter, bank, yaw);
    out.quaternion.copy(layout.cardInBox).slerp(qPath, flight);
    out.flip = spins * TAU * smoothstep(0.015, FLIGHT, sf);
    out.curl =
      Math.sin(Math.PI * flightK) * 0.24 * smoothstep(0, 0.03, sf) +
      Math.sin(time * 6 + i) * 0.03 * flow;
    out.flex = Math.sin(time * 4.3 + i * 1.7) * 0.03 * flow;
    // Far cards fade a touch toward the page (aerial perspective).
    out.mist = smoothstep(1.0, 1.4, 0.8 - out.position.z) * 0.3;
  }

  // ------------------------------------------------------------------ draw, turn, hold

  private drawnPose(i: number, beats: DeckBeats, layout: DeckLayout, time: number, out: CardPose) {
    const base = this.fanned;
    resetPose(base);
    this.flightPose(i, beats.u, 1, layout, time, base);
    const hero = this.heroOf(i);
    if (hero >= 0) {
      const slot = layout.slots.at(hero);
      if (!slot) return true;
      // Slide out of the fan along its own length, then fly forward and stop dead in the slot.
      const pull = smoothstep(0.02 + hero * 0.07, 0.3 + hero * 0.07, beats.draw);
      const fly = expoOut(fit(beats.draw, 0.2 + hero * 0.08, 0.78 + hero * 0.06, 0, 1));
      va.set(0, CARD_H * 0.75 * pull, 0).applyQuaternion(base.quaternion);
      vb.copy(base.position).add(va);
      out.position.copy(vb).lerp(slot.position, fly);
      out.position.z += Math.sin(fly * Math.PI) * 0.03;
      out.quaternion.copy(base.quaternion).slerp(qIdentity, fly);
      out.curl = Math.sin(fly * Math.PI) * 0.12;
      out.scale = mix(1, slot.scale, fly);
      out.mist = mix(base.mist, 0, fly);
      return true;
    }
    // The wheel: opens from the fan into a full circle behind the slots, smaller and misted.
    const w = this.wheelIndex.at(i) ?? 0;
    const open = cubicInOut(fit(beats.draw, 0.08, 0.92, 0, 1));
    const fanAngle = layout.fanSpread * (0.5 - (this.count > 1 ? i / (this.count - 1) : 0.5));
    const angle = mix(fanAngle, this.wheelAngle(w, beats, time), open);
    const radius = mix(
      layout.stack.y - layout.pivot.y,
      layout.ringRadius + CARD_H * 0.5 * layout.ringScale,
      open,
    );
    vc.copy(layout.pivot).lerp(layout.ring, open);
    out.position.set(
      vc.x - Math.sin(angle) * radius,
      vc.y + Math.cos(angle) * radius,
      mix(layout.stack.z + i * STACK_PITCH, layout.ring.z + w * STACK_PITCH * 0.6, open),
    );
    orient(out.quaternion, angle, 0, 0);
    out.scale = mix(1, layout.ringScale, open);
    out.mist = mix(base.mist, WHEEL_MIST, open);
    out.curl = Math.sin(open * Math.PI) * 0.06;
    return true;
  }

  /** Wheel card w's angle: its place on the circle, the wheel's scrubbed turn, a slow sway. */
  private wheelAngle(w: number, beats: DeckBeats, time: number) {
    const sway = Math.sin(time * 0.31) * 0.07 * smoothstep(0.2, 0.8, beats.draw);
    const swayK = 1 - smoothstep(0.2, 0.95, beats.hold);
    return (
      TAU * (0.5 - (w + 0.5) / Math.max(1, this.wheelCount)) + beats.sinceDraw * 0.16 + sway * swayK
    );
  }

  /** The wheel card's angle once the sway has gone (from the end of the hold). */
  private wheelHeld(w: number, beats: DeckBeats) {
    return TAU * (0.5 - (w + 0.5) / Math.max(1, this.wheelCount)) + beats.sinceDraw * 0.16;
  }

  // ------------------------------------------------------------------ gather

  /** When card i leaves for the box (gather progress): the four are thrown, the wheel unrolls. */
  private leaveAt(i: number, beats: DeckBeats) {
    const hero = this.heroOf(i);
    if (hero >= 0) return 0.12 + hero * 0.07;
    const w = this.wheelIndex.at(i) ?? 0;
    // A rigid wheel turning one full turn: each card leaves as it reaches the top.
    const angle = this.wheelHeld(w, beats);
    return UNROLL_FROM + (UNROLL_TO - UNROLL_FROM) * (positiveMod(angle, TAU) / TAU);
  }

  private gatherSpeed(i: number, layout: DeckLayout) {
    // The last card leaves at UNROLL_TO and is in by GATHER_IN, at its slowest share of the speed.
    const base = layout.back.length / ((GATHER_IN - UNROLL_TO) * GATHER_VH - 0.05);
    return (base / 0.9) * (1 + 0.1 * hashSigned(i, 13));
  }

  /** Distance travelled along the return path by card i at this point of the gather. */
  private gatherDistance(i: number, beats: DeckBeats, layout: DeckLayout) {
    const tau = (beats.gather - this.leaveAt(i, beats)) * GATHER_VH;
    return travel(tau, this.gatherSpeed(i, layout), 0.1);
  }

  private gatherPose(i: number, beats: DeckBeats, layout: DeckLayout, time: number, out: CardPose) {
    const path = layout.back;
    const L = path.length;
    const s = this.gatherDistance(i, beats, layout);
    if (s >= L) {
      out.visible = false;
      return false;
    }
    const held = this.held;
    resetPose(held);
    const hero = this.heroOf(i);
    if (hero >= 0) {
      const slot = layout.slots.at(hero);
      if (slot) held.position.copy(slot.position);
      held.quaternion.identity();
      held.scale = slot ? slot.scale : 1;
    } else {
      // On the wheel, which turns one full turn as it unrolls (each card exits at the top).
      const w = this.wheelIndex.at(i) ?? 0;
      const spin = TAU * fit(beats.gather, UNROLL_FROM, UNROLL_TO, 0, 1);
      const angle = this.wheelHeld(w, beats) - spin;
      const radius = layout.ringRadius + CARD_H * 0.5 * layout.ringScale;
      held.position.set(
        layout.ring.x - Math.sin(angle) * radius,
        layout.ring.y + Math.cos(angle) * radius,
        layout.ring.z + w * STACK_PITCH * 0.6,
      );
      orient(held.quaternion, angle, 0, 0);
      held.scale = layout.ringScale;
      held.mist = WHEEL_MIST;
    }
    if (s <= 0) {
      copyPose(held, out);
      return true;
    }
    // Into the box: the last stretch is the exit backwards, straight down, upright in its plane.
    const exit = layout.exitLength;
    if (s > L - exit) {
      path.point(s, out.position);
      out.quaternion.copy(layout.cardInBox);
      out.free = 0;
      return true;
    }
    // On the stream back: from where it was onto the path, then into the box.
    path.point(s, va);
    path.tangent(s, tangent);
    const roll = path.rollAt(s) - Math.PI / 2;
    const join = smoothstep(0, hero >= 0 ? 0.24 : 0.08, s);
    out.position.copy(held.position).lerp(va, join);
    const flow = 1 - smoothstep(L - exit - 0.2, L - exit - 0.04, s);
    out.free = flow;
    vb.set(-tangent.y, tangent.x, 0).normalize();
    out.position.addScaledVector(vb, Math.sin(time * 2.6 + i * 0.4) * 0.004 * flow);
    // Into the box upright: the roll eases to the nearest upright turn, then to the box's own tilt.
    const settle = smoothstep(L - exit - 0.12, L - exit - 0.02, s);
    const pathRoll = mix(roll, nearestTurn(roll), settle);
    orient(qPath, pathRoll + Math.sin(time * 5 + i) * 3 * DEG * flow, 0, tangent.z * 0.4 * flow);
    qPath.slerp(layout.cardInBox, smoothstep(L - exit - 0.06, L - exit, s));
    out.quaternion.copy(held.quaternion).slerp(qPath, join);
    if (hero >= 0) {
      // The four fly in spinning flat in their own plane (a card throw), settling as they join.
      qa.setFromAxisAngle(zAxis, (1 - join) * smoothstep(0, 0.05, s) * TAU * 2.2);
      out.quaternion.multiply(qa);
    }
    out.scale = mix(held.scale, 1, join);
    out.mist = mix(held.mist, 0, join);
    out.curl = (Math.sin(join * Math.PI) * 0.1 + Math.sin(time * 6 + i) * 0.02) * flow;
    return true;
  }
}

function resetPose(pose: CardPose) {
  pose.flip = 0;
  pose.curl = 0;
  pose.flex = 0;
  pose.mist = 0;
  pose.scale = 1;
  pose.visible = true;
  pose.free = 1;
}

function copyPose(from: CardPose, to: CardPose) {
  to.position.copy(from.position);
  to.quaternion.copy(from.quaternion);
  to.flip = from.flip;
  to.curl = from.curl;
  to.flex = from.flex;
  to.mist = from.mist;
  to.scale = from.scale;
  to.visible = from.visible;
  to.free = from.free;
}
