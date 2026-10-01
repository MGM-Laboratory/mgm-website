import { MathUtils, Quaternion, Vector3, type PerspectiveCamera } from "three";

import { damp, mix, saturate, type StoryContext } from "@/components/story/engine/act";
import { fovForAspect } from "@/components/story/engine/frame";
import type { RoomShot } from "@/components/story/props/room";

/**
 * The table act's camera: poses (position, aim, vertical FOV, roll), a keyed
 * path through the room's shots, blends between rigs, and the life on top
 * (mouse parallax, handheld noise). Poses are pure values; only the
 * parallax smoothing and the handheld noise run on the clock.
 */

export type CamPose = {
  position: Vector3;
  target: Vector3;
  /** Vertical FOV, degrees. */
  fov: number;
  /** Roll about the view axis, radians (+ turns the horizon clockwise on screen). */
  roll: number;
};

export function createPose(): CamPose {
  return { position: new Vector3(), target: new Vector3(), fov: 40, roll: 0 };
}

export function copyPose(out: CamPose, from: CamPose) {
  out.position.copy(from.position);
  out.target.copy(from.target);
  out.fov = from.fov;
  out.roll = from.roll;
  return out;
}

/** A room shot at the frame's aspect (the FOV blends between its 16:9 and 9:16 values). */
export function shotPose(shot: RoomShot, aspect: number, out: CamPose = createPose()) {
  out.position.set(shot.position[0], shot.position[1], shot.position[2]);
  out.target.set(shot.target[0], shot.target[1], shot.target[2]);
  out.fov = fovForAspect(shot.fov.landscape, shot.fov.portrait, aspect);
  out.roll = 0;
  return out;
}

const tanHalf = (fov: number) => Math.tan(MathUtils.degToRad(fov) / 2);
const fovOfTan = (t: number) => MathUtils.radToDeg(2 * Math.atan(t));

/** Blends two poses: positions and aims linearly, the FOV in log tan (a zoom that feels even). */
export function blendPose(out: CamPose, a: CamPose, b: CamPose, k: number) {
  out.position.lerpVectors(a.position, b.position, k);
  out.target.lerpVectors(a.target, b.target, k);
  out.fov = fovOfTan(Math.exp(mix(Math.log(tanHalf(a.fov)), Math.log(tanHalf(b.fov)), k)));
  out.roll = mix(a.roll, b.roll, k);
  return out;
}

export type CamKey = Readonly<{
  /** Story position, vh. */
  t: number;
  pose: CamPose;
  /** Comes to rest here (zero speed), for holds and rests. */
  stop?: boolean;
  /**
   * Between two stops the move is an ease in and out; "out" makes the move
   * into this key leave at speed and settle (a crane that lands, then holds).
   */
  ease?: "out";
}>;

/**
 * A camera path through keys at story positions: a cubic Hermite in `t`
 * (Catmull-Rom tangents that respect uneven key spacing), so the move is
 * smooth across keys and still where a key says `stop`. Before the first
 * key and after the last it holds.
 */
export class CameraPath {
  private readonly keys: readonly CamKey[];
  private readonly logTan: readonly number[];

  constructor(keys: readonly CamKey[]) {
    this.keys = [...keys].sort((a, b) => a.t - b.t);
    this.logTan = this.keys.map((key) => Math.log(tanHalf(key.pose.fov)));
  }

  get start() {
    return this.keys.at(0)?.t ?? 0;
  }

  get end() {
    return this.keys.at(-1)?.t ?? 0;
  }

  evaluate(t: number, out: CamPose) {
    const keys = this.keys;
    const first = keys.at(0);
    const last = keys.at(-1);
    if (!first || !last) return out;
    if (t <= first.t) return copyPose(out, first.pose);
    if (t >= last.t) return copyPose(out, last.pose);
    let i = 0;
    while (i < keys.length - 2 && (keys.at(i + 1)?.t ?? Infinity) <= t) i += 1;
    const k0 = keys.at(i);
    const k1 = keys.at(i + 1);
    if (!k0 || !k1) return out;
    // `.at(-1)` is the last key: the first segment has no key before it.
    const prev = i > 0 ? keys.at(i - 1) : undefined;
    const next = keys.at(i + 2);
    const dt = Math.max(1e-6, k1.t - k0.t);
    const u = saturate((t - k0.t) / dt);
    if (k1.ease === "out") {
      const w = 1 - (1 - u) * (1 - u) * (1 - u);
      return blendPose(out, k0.pose, k1.pose, w);
    }
    const h00 = 2 * u * u * u - 3 * u * u + 1;
    const h10 = u * u * u - 2 * u * u + u;
    const h01 = -2 * u * u * u + 3 * u * u;
    const h11 = u * u * u - u * u;
    // Tangents per unit t, then scaled to the segment.
    const tangent = (
      key: CamKey,
      before: CamKey | undefined,
      after: CamKey | undefined,
      pick: (pose: CamPose) => Vector3,
      outV: Vector3,
    ) => {
      if (key.stop || !before || !after) return outV.set(0, 0, 0);
      return outV
        .copy(pick(after.pose))
        .sub(pick(before.pose))
        .divideScalar(Math.max(1e-6, after.t - before.t));
    };
    const m0 = tangent(k0, prev, k1, (p) => p.position, tmpA);
    const m1 = tangent(k1, k0, next, (p) => p.position, tmpB);
    out.position
      .copy(k0.pose.position)
      .multiplyScalar(h00)
      .addScaledVector(m0, h10 * dt)
      .addScaledVector(k1.pose.position, h01)
      .addScaledVector(m1, h11 * dt);
    const n0 = tangent(k0, prev, k1, (p) => p.target, tmpA);
    const n1 = tangent(k1, k0, next, (p) => p.target, tmpB);
    out.target
      .copy(k0.pose.target)
      .multiplyScalar(h00)
      .addScaledVector(n0, h10 * dt)
      .addScaledVector(k1.pose.target, h01)
      .addScaledVector(n1, h11 * dt);
    // FOV and roll: the same Hermite on scalars.
    const scalar = (
      v0: number,
      v1: number,
      vb: number | null,
      va: number | null,
      s0: boolean,
      s1: boolean,
    ) => {
      const t0 = s0 || vb === null || !prev ? 0 : (v1 - vb) / Math.max(1e-6, k1.t - prev.t);
      const t1 = s1 || va === null || !next ? 0 : (va - v0) / Math.max(1e-6, next.t - k0.t);
      return h00 * v0 + h10 * dt * t0 + h01 * v1 + h11 * dt * t1;
    };
    const l0 = this.logTan.at(i) ?? 0;
    const l1 = this.logTan.at(i + 1) ?? 0;
    const lb = prev && i > 0 ? (this.logTan.at(i - 1) ?? null) : null;
    const la = next ? (this.logTan.at(i + 2) ?? null) : null;
    out.fov = fovOfTan(Math.exp(scalar(l0, l1, lb, la, !!k0.stop, !!k1.stop)));
    out.roll = scalar(
      k0.pose.roll,
      k1.pose.roll,
      prev ? prev.pose.roll : null,
      next ? next.pose.roll : null,
      !!k0.stop,
      !!k1.stop,
    );
    return out;
  }
}

const tmpA = new Vector3();
const tmpB = new Vector3();

export type CameraLife = {
  /** Mouse parallax as a share of the distance to the aim (0.03: 3 cm at 1 m). */
  parallax: number;
  /** Handheld rotation noise, radians. */
  handheld: number;
  /** How fast the handheld wanders (1: about 0.8 Hz). */
  handheldRate?: number;
};

const forward = new Vector3();
const right = new Vector3();
const up = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const rollQ = new Quaternion();
const noiseQ = new Quaternion();
const axis = new Vector3();

/** Layered sines, a smooth noise in about [-1, 1]. */
function wander(t: number, seed: number) {
  return (
    Math.sin(t * 1.13 + seed) * 0.5 +
    Math.sin(t * 2.37 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.71 + seed * 2.9) * 0.2
  );
}

/**
 * Puts the stage camera on `pose`, plus the life layers: the smoothed
 * pointer shifts it across the view (the aim moves a third as much, a slight
 * orbit), and the handheld noise turns it a little. Writes near and far.
 */
export class RoomCameraRig {
  private px = 0;
  private py = 0;

  /** Smooths the pointer (mouse only: a finger never steers the camera). */
  tick(ctx: StoryContext) {
    const pointer = ctx.pointer;
    const mouse = pointer.inside && (pointer.type === "mouse" || pointer.type === "pen");
    const dt = ctx.clock.dt;
    this.px = damp(this.px, mouse ? pointer.ndc.x : 0, 2.6, dt);
    this.py = damp(this.py, mouse ? pointer.ndc.y : 0, 2.6, dt);
  }

  /** The smoothed pointer, -1..1 each way. */
  get pointer() {
    return { x: this.px, y: this.py };
  }

  apply(camera: PerspectiveCamera, pose: CamPose, life: CameraLife, time: number) {
    forward.subVectors(pose.target, pose.position);
    const distance = Math.max(0.01, forward.length());
    forward.divideScalar(distance);
    right.crossVectors(forward, worldUp).normalize();
    up.crossVectors(right, forward).normalize();
    const shift = life.parallax * distance;
    const sx = this.px * shift;
    const sy = this.py * shift * 0.6;
    camera.position.copy(pose.position).addScaledVector(right, sx).addScaledVector(up, sy);
    tmpA
      .copy(pose.target)
      .addScaledVector(right, sx * 0.33)
      .addScaledVector(up, sy * 0.33);
    camera.up.copy(worldUp);
    camera.lookAt(tmpA);
    // Roll about the view axis, then the handheld wander.
    if (pose.roll !== 0) {
      axis.set(0, 0, -1);
      rollQ.setFromAxisAngle(axis, pose.roll);
      camera.quaternion.multiply(rollQ);
    }
    if (life.handheld > 0) {
      const r = life.handheldRate ?? 1;
      const t = time * r;
      noiseQ.setFromAxisAngle(axis.set(0, 1, 0), wander(t, 1.3) * life.handheld);
      camera.quaternion.multiply(noiseQ);
      noiseQ.setFromAxisAngle(axis.set(1, 0, 0), wander(t * 1.1, 4.1) * life.handheld * 0.8);
      camera.quaternion.multiply(noiseQ);
      noiseQ.setFromAxisAngle(axis.set(0, 0, 1), wander(t * 0.9, 7.7) * life.handheld * 0.5);
      camera.quaternion.multiply(noiseQ);
    }
    camera.fov = pose.fov;
    camera.near = 0.008;
    camera.far = 40;
    camera.updateMatrixWorld();
  }
}
