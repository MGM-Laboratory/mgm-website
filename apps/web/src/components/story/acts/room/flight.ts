import { Euler, MathUtils, Quaternion, Vector3 } from "three";

import { saturate, smoothstep } from "@/components/story/engine/act";

import { TimedSpline } from "./spline";

/**
 * Godette's flight through the room, as pure functions of the flight clock
 * `tau` (beat seconds from the start of `r-dragged`):
 *
 * 1. The drag. The spark (`spark(tau)`) yanks her up by the wrist and tows
 *    her across the table. She hangs below it as a physical pendulum, baked
 *    once at build time (a fixed step simulation driven by the spark's own
 *    acceleration, light damping), and spins like a balloon on a string.
 * 2. The tow. The spark rides on her wrist; her centre follows a path that
 *    starts exactly where the pendulum left her (position and velocity). She
 *    wobbles, and the wobble dies out as she learns (damping 0.1 to 1).
 * 3. The flight. The spark lets go (it becomes her glow), she glides, loops,
 *    turns to the camera, then to the TV, and dives into it.
 *
 * Units: metres in the room frame, angles in radians, her model's yaw
 * (front +Z) for headings.
 */

export type FlightTimes = Readonly<{
  /** Hands-off seconds of r-dragged, r-learn, r-tv and r-dive. */
  drag: number;
  learn: number;
  tv: number;
  dive: number;
}>;

export type FlightInputs = Readonly<{
  /** Her left hand at the end of r-spark, reaching up for the spark (world). */
  hand: Vector3;
  /** Her yaw then (model frame). */
  yaw: number;
  /** The hand to centre direction of the dangling pose, in her root frame (unit), and its length (metres). */
  hangAxis: Vector3;
  hangLength: number;
  /** The TV screen's centre and normal (into the room). */
  screen: Vector3;
  screenNormal: Vector3;
  times: FlightTimes;
}>;

export type FlightPose = {
  /** Her centre (the pivot) in the room. */
  centre: Vector3;
  /** Her whole orientation in the room. */
  quaternion: Quaternion;
  /**
   * In free flight (hang 0) the same orientation split the way her runtime wants it: a yaw on the root, and
   * pitch plus roll on the pivot at her centre (Euler XYZ), so her own flight sway rolls about her travel.
   */
  heading: number;
  pivot: Euler;
  /** 1 while she hangs from the spark (place her by her hand), 0 in free flight (place her by her centre). */
  hang: number;
  /** How well she flies, 0 to 1. */
  learned: number;
  /** Her speed, metres per beat second. */
  speed: number;
  /** Bank into turns, radians (+ to her right). */
  bank: number;
};

export function createFlightPose(): FlightPose {
  return {
    centre: new Vector3(),
    quaternion: new Quaternion(),
    heading: 0,
    pivot: new Euler(),
    hang: 1,
    learned: 0,
    speed: 0,
    bank: 0,
  };
}

const G = 9.81;
const STEP = 1 / 240;
const UP = new Vector3(0, 1, 0);

type HeadingKey = readonly [tau: number, angle: number, ease: boolean];

export class FlightPlan {
  readonly times: FlightTimes & {
    /** End of the hang (the spark rides on her wrist from here). */
    hangEnd: number;
    /** The spark lets go of her wrist and flows into her chest. */
    release: number;
    releaseEnd: number;
    loopStart: number;
    loopEnd: number;
    /** She faces the camera, proud, until `turn`. */
    proud: number;
    turn: number;
    turnEnd: number;
    /** The dive starts, and she crosses the screen plane. */
    diveStart: number;
    enter: number;
    end: number;
  };
  private readonly sparkPath: TimedSpline;
  private readonly free: TimedSpline;
  private readonly pendulum: Float32Array;
  private readonly inputs: FlightInputs;
  private readonly yawQ = new Quaternion();
  private readonly spinTotal: number;
  private readonly headingKeys: readonly HeadingKey[];

  constructor(inputs: FlightInputs) {
    this.inputs = inputs;
    const { drag: D, learn: L, tv: V, dive: X } = inputs.times;
    const hangEnd = D * 0.72;
    const dive = D + L + V;
    this.times = {
      drag: D,
      learn: L,
      tv: V,
      dive: X,
      hangEnd,
      release: D + 0.38 * L,
      releaseEnd: D + 0.55 * L,
      loopStart: D + 0.5 * L,
      loopEnd: D + 0.76 * L,
      proud: D + 0.92 * L,
      turn: D + L + 0.22 * V,
      turnEnd: D + L + 0.6 * V,
      diveStart: dive,
      enter: dive + 0.62 * X,
      end: dive + X,
    };
    const h = inputs.hand;
    const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
    // The spark's tow: a hook at the wrist, a yank up, a low swoop toward the cup, up over the pots, a climb.
    this.sparkPath = new TimedSpline([
      { t: 0, p: h.clone(), v: new Vector3() },
      { t: 0.12, p: h.clone().add(v(0, 0.004, 0)) },
      { t: 0.5, p: h.clone().add(v(-0.012, 0.15, -0.004)) },
      { t: 0.95, p: v(0.39, 0.705, -0.76) },
      { t: 1.4, p: v(0.19, 0.84, -0.87) },
      { t: hangEnd, p: v(0.24, 0.97, -0.71) },
      { t: hangEnd + 0.5, p: v(0.34, 1.03, -0.56) },
    ]);
    this.pendulum = bakePendulum(this.sparkPath, hangEnd + 0.5, (tau) =>
      MathUtils.lerp(0.1, 0.2, saturate(tau / hangEnd)),
    );

    // Where the hang leaves her, and how fast she is going.
    const start = new Vector3();
    const before = new Vector3();
    this.hangCentre(hangEnd, start);
    this.hangCentre(hangEnd - 1 / 60, before);
    const velocity = start.clone().sub(before).multiplyScalar(60);

    // The free path of her centre: learning, the loop, the proud hover, the turn, the dive.
    const keys: { t: number; p: Vector3; v?: Vector3 }[] = [
      { t: hangEnd, p: start, v: velocity },
      { t: hangEnd + 0.5, p: v(0.39, 0.9, -0.53) },
      { t: D + 0.22 * L, p: v(0.45, 0.85, -0.52) },
      { t: D + 0.42 * L, p: v(0.41, 0.815, -0.61) },
    ];
    const loopEntry = v(0.34, 0.8, -0.62);
    const radius = 0.085;
    const loopCentre = loopEntry.clone().addScaledVector(UP, radius);
    const travel = v(-1, 0, 0);
    const loopSpan = this.times.loopEnd - this.times.loopStart;
    for (let k = 0; k <= 8; k += 1) {
      const beta = (k / 8) * Math.PI * 2;
      const p = loopCentre
        .clone()
        .addScaledVector(travel, Math.sin(beta) * radius + (k / 8) * 0.05)
        .addScaledVector(UP, -Math.cos(beta) * radius);
      keys.push({ t: this.times.loopStart + (k / 8) * loopSpan, p });
    }
    keys.push(
      { t: D + 0.88 * L, p: v(0.2, 0.83, -0.62) },
      { t: D + L, p: v(0.13, 0.85, -0.615) },
      { t: D + L + 0.5 * V, p: v(0.08, 0.86, -0.62) },
      { t: dive, p: v(-0.14, 0.866, -0.628) },
    );
    const screen = inputs.screen;
    keys.push(
      { t: dive + 0.35 * X, p: screen.clone().addScaledVector(inputs.screenNormal, 1.25) },
      { t: this.times.enter, p: screen.clone() },
      { t: this.times.end, p: screen.clone().addScaledVector(inputs.screenNormal, -0.45) },
    );
    this.free = new TimedSpline(keys);

    // Headings (her model yaw), unwrapped: along the path while she learns (held through the loop, which
    // she flies over on her back), then round to us, then to the TV.
    const toCamera = Math.PI / 2;
    const toTv = Math.atan2(-inputs.screenNormal.x, -inputs.screenNormal.z);
    const headings: HeadingKey[] = [];
    const push = (tau: number, angle: number, ease: boolean) => {
      const last = headings.at(-1);
      const value = last ? last[1] + wrapAngle(angle - last[1]) : angle;
      headings.push([tau, value, ease]);
    };
    for (let tau = hangEnd; tau <= this.times.loopStart; tau += 1 / 30) {
      this.free.velocity(tau, before);
      push(tau, Math.atan2(before.x, before.z), false);
    }
    const entry = headings.at(-1)?.[1] ?? 0;
    push(this.times.loopEnd, entry, false);
    push(this.times.proud, toCamera, true);
    push(this.times.turn, toCamera, true);
    push(this.times.turnEnd, toTv, true);
    this.headingKeys = headings;

    // The spin of the hang lands her facing the way the tow sets off, plus one whole turn.
    const facing = this.hangFacing(hangEnd);
    const target = this.heading(hangEnd);
    this.spinTotal = wrapAngle(target - facing) + Math.PI * 2;
  }

  /** The spark during the hang (it rides on her wrist afterwards). */
  spark(tau: number, out: Vector3) {
    return this.sparkPath.at(tau, out);
  }

  /** The hang direction (spark to her centre), unit. */
  hangDirection(tau: number, out: Vector3) {
    const n = this.pendulum.length / 3 - 1;
    const f = Math.min(n, Math.max(0, tau / STEP));
    const i = Math.floor(f);
    const k = f - i;
    const j = Math.min(n, i + 1);
    const a = this.pendulum.subarray(i * 3, i * 3 + 3);
    const b = this.pendulum.subarray(j * 3, j * 3 + 3);
    out.set(
      (a.at(0) ?? 0) * (1 - k) + (b.at(0) ?? 0) * k,
      (a.at(1) ?? -1) * (1 - k) + (b.at(1) ?? -1) * k,
      (a.at(2) ?? 0) * (1 - k) + (b.at(2) ?? 0) * k,
    );
    return out.normalize();
  }

  private hangCentre(tau: number, out: Vector3) {
    this.spark(tau, out);
    return out.addScaledVector(this.hangDirection(tau, tmpDir), this.inputs.hangLength);
  }

  /** Her spin about the string, radians. */
  private spin(tau: number) {
    const k = saturate(tau / this.times.hangEnd);
    const s = smoothstep(0.08, 1, k);
    return (this.spinTotal * (1 - Math.exp(-s * 3))) / (1 - Math.exp(-3));
  }

  /** The orientation of the hang: her hand to centre axis along the string, spun about it. */
  private hangQuaternion(tau: number, out: Quaternion) {
    this.yawQ.setFromAxisAngle(UP, this.inputs.yaw);
    tmpA.copy(this.inputs.hangAxis).applyQuaternion(this.yawQ);
    this.hangDirection(tau, tmpB);
    tmpQ.setFromUnitVectors(tmpA, tmpB);
    out.copy(tmpQ).multiply(this.yawQ);
    if (tau > 0) {
      tmpQ.setFromAxisAngle(tmpB, this.spin(tau));
      out.premultiply(tmpQ);
    }
    return out;
  }

  private hangFacing(tau: number) {
    this.yawQ.setFromAxisAngle(UP, this.inputs.yaw);
    tmpA.copy(this.inputs.hangAxis).applyQuaternion(this.yawQ);
    this.hangDirection(tau, tmpB);
    tmpQ.setFromUnitVectors(tmpA, tmpB).multiply(this.yawQ);
    tmpA.set(0, 0, 1).applyQuaternion(tmpQ);
    return Math.atan2(tmpA.x, tmpA.z);
  }

  /** Her heading (model yaw) in free flight, unwrapped. */
  heading(tau: number) {
    const keys = this.headingKeys;
    const first = keys.at(0);
    const last = keys.at(-1);
    if (!first || !last) return 0;
    if (tau <= first[0]) return first[1];
    if (tau >= last[0]) return last[1];
    let i = 0;
    while (i < keys.length - 2 && (keys.at(i + 1)?.[0] ?? Infinity) <= tau) i += 1;
    const a = keys.at(i);
    const b = keys.at(i + 1);
    if (!a || !b) return last[1];
    const u = saturate((tau - a[0]) / Math.max(1e-6, b[0] - a[0]));
    return a[1] + (b[1] - a[1]) * (b[2] ? smoothstep(0, 1, u) : u);
  }

  /** How well she flies (0 dragged, 1 at home in the air). */
  learned(tau: number) {
    const { drag: D, learn: L } = this.times;
    return smoothstep(D - 0.1 * L, D + 0.8 * L, tau);
  }

  /** Her pitch (forward, radians) in free flight: upright, prone, the loop, upright to us, prone to the TV. */
  pitch(tau: number) {
    const t = this.times;
    const { drag: D, learn: L, tv: V } = t;
    const deg = MathUtils.degToRad;
    let p = deg(8) * smoothstep(t.hangEnd, D, tau);
    p += deg(72) * smoothstep(D + 0.26 * L, t.loopStart, tau);
    // The loop: nose up, over the top, down and through.
    const loop = saturate((tau - t.loopStart) / (t.loopEnd - t.loopStart));
    p -= Math.PI * 2 * smoothstep(0, 1, loop);
    // Upright to face us, then prone again toward the TV.
    p -= deg(80) * smoothstep(t.loopEnd + 0.05 * L, t.proud, tau);
    p += deg(85) * smoothstep(D + L + 0.45 * V, D + L + 0.8 * V, tau);
    return p;
  }

  /** The learning wobble: roll and pitch that die out as the damping rises. */
  private wobble(tau: number) {
    const learned = this.learned(tau);
    const t = this.times;
    const a = 0.42 * Math.pow(1 - learned, 1.6) * smoothstep(t.hangEnd - 0.2, t.hangEnd + 0.3, tau);
    const f = MathUtils.lerp(1.5, 0.7, learned);
    return {
      roll: a * Math.sin(tau * f * Math.PI * 2 + 0.6),
      pitch: a * 0.55 * Math.sin(tau * f * 1.3 * Math.PI * 2 + 2.1),
    };
  }

  /** Her centre smoothed over the last `window` seconds (an operator's eye: it follows the trend, not the jitter). */
  smoothedCentre(tau: number, window: number, out: Vector3) {
    out.set(0, 0, 0);
    const n = 8;
    for (let i = 0; i < n; i += 1) {
      out.add(this.centre(Math.max(0, tau - (window * i) / (n - 1)), tmpC));
    }
    return out.divideScalar(n);
  }

  /** Her centre at `tau` (the hang's, then the free path's). */
  centre(tau: number, out: Vector3) {
    if (tau <= this.times.hangEnd) return this.hangCentre(tau, out);
    return this.free.at(tau, out);
  }

  /** Everything about her flight at `tau`. */
  pose(tau: number, out: FlightPose) {
    const t = this.times;
    this.centre(tau, out.centre);
    if (tau < t.hangEnd) {
      this.hangCentre(tau + 1 / 120, tmpA).sub(this.hangCentre(tau - 1 / 120, tmpB));
      tmpA.multiplyScalar(60);
    } else {
      this.free.velocity(tau, tmpA);
    }
    out.speed = tmpA.length();
    // Bank into turns: the lateral acceleration over g, scaled down for style.
    const turnRate = (this.heading(tau + 0.05) - this.heading(tau - 0.05)) / 0.1;
    const horizontal = Math.hypot(tmpA.x, tmpA.z);
    out.bank = MathUtils.clamp(Math.atan((turnRate * horizontal) / G) * 0.6, -0.7, 0.7);
    out.learned = this.learned(tau);
    const hang = tau < t.hangEnd ? 1 : 1 - smoothstep(t.hangEnd, t.hangEnd + 0.6, tau);
    out.hang = hang;
    const wobble = this.wobble(tau);
    const pitch = this.pitch(tau) + wobble.pitch;
    const roll = wobble.roll;
    // Roll about the way she travels: her front when upright, her head when prone.
    const prone = Math.sin(MathUtils.clamp(pitch, 0, Math.PI / 2));
    out.heading = this.heading(tau);
    out.pivot.set(pitch, roll * prone, roll * (1 - prone), "XYZ");
    flightQ.setFromAxisAngle(UP, out.heading);
    tmpQ.setFromEuler(out.pivot);
    flightQ.multiply(tmpQ);
    if (hang >= 0.999) {
      this.hangQuaternion(Math.min(tau, t.hangEnd), out.quaternion);
    } else if (hang <= 0.001) {
      out.quaternion.copy(flightQ);
    } else {
      this.hangQuaternion(Math.min(tau, t.hangEnd), out.quaternion);
      out.quaternion.slerp(flightQ, 1 - hang);
    }
    return out;
  }
}

/** Sweeps a pendulum hung from `pivot(t)` and returns its unit direction every STEP seconds. */
function bakePendulum(
  pivot: TimedSpline,
  duration: number,
  damping: (tau: number) => number,
): Float32Array {
  const length = 0.15;
  const omega = Math.sqrt(G / length);
  const steps = Math.ceil(duration / STEP) + 1;
  const out = new Float32Array(steps * 3);
  const bob = new Vector3(0, -length, 0);
  const velocity = new Vector3();
  const p0 = new Vector3();
  const p1 = new Vector3();
  const p2 = new Vector3();
  const accel = new Vector3();
  const pivotAccel = new Vector3();
  for (let i = 0; i < steps; i += 1) {
    const tau = i * STEP;
    out.set([bob.x / length, bob.y / length, bob.z / length], i * 3);
    // The pivot's acceleration, by central difference.
    pivot.at(tau - STEP, p0);
    pivot.at(tau, p1);
    pivot.at(tau + STEP, p2);
    pivotAccel
      .copy(p2)
      .addScaledVector(p1, -2)
      .add(p0)
      .divideScalar(STEP * STEP);
    const zeta = damping(tau);
    accel
      .set(0, -G, 0)
      .sub(pivotAccel)
      .addScaledVector(velocity, -2 * zeta * omega);
    velocity.addScaledVector(accel, STEP);
    bob.addScaledVector(velocity, STEP);
    bob.setLength(length);
    // Only the swing survives the string's pull.
    const radial = velocity.dot(bob) / (length * length);
    velocity.addScaledVector(bob, -radial);
  }
  return out;
}

function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

const tmpA = new Vector3();
const tmpDir = new Vector3();
const tmpC = new Vector3();
const tmpB = new Vector3();
const tmpQ = new Quaternion();
const flightQ = new Quaternion();
