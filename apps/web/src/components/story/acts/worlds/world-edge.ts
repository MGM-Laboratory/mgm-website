import {
  Color,
  Matrix3,
  Matrix4,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  Vector4,
  type WebGLRenderer,
} from "three";

import type {
  StoryContext,
  StoryPointerEvent,
  StoryPostParams,
  StoryTier,
} from "@/components/story/engine/act";

import {
  BackgroundPass,
  ShotTrack,
  backgroundScale,
  chaseShot,
  ease01,
  fullscreenGeometry,
  lin01,
  type CameraShot,
  type FlightPose,
} from "./common";
import { Course, Walk } from "./course";
import { EDGE_HOLE_FRAGMENT } from "./edge-hole.glsl";
import { Motes } from "./motes";
import { World, type WorldFrame } from "./world";

/**
 * World 05, The Edge: "The edge of everything, where light turns around.
 * She flies too close, and her glow runs out." A Gargantua-like black hole
 * (`edge-hole.glsl.ts`): a thin disk in white, brand yellow and red, its far
 * side lensed over the top, a photon ring, stars bent around it. She glides
 * toward it, calm and graceful (the trip has taught her that much); the
 * camera pulls back until she is a speck against the disk, then watches her
 * cross the light with a long lens.
 *
 * Then the loss (`w-loss`): her glow flickers out, she rights herself,
 * looks at her hands, turns, and looks at us while the camera dollies back
 * and zooms in (the hole swells behind her, she stays the same size), then
 * pushes in on her face. Hang time: the whole world slows to a tenth.
 * And the fall (`w-fall`): down she goes, flailing, away from the camera,
 * which does not follow.
 *
 * The hole is drawn at a share of the resolution (`BackgroundPass`); she
 * and a field of star dust are the only meshes.
 */

/** The hole in this world's frame: centre, metres per Schwarzschild radius, the disk's tilt and size. */
const HOLE = {
  centre: new Vector3(48, -52, -840),
  scale: 34,
  tiltDeg: 7,
  diskIn: 3.0,
  diskOut: 11.5,
} as const;

/** The loss and the fall run on from the world's own beat (course time past `length`). */
const FALL_SECONDS = 2.2;
const FALL_G = 4.4;
const HANG = { start: 0.72, end: 0.9 } as const;

function stepsFor(tier: StoryTier) {
  return tier === "low"
    ? { steps: 72, step: 0.1, motes: 0.35 }
    : tier === "medium"
      ? { steps: 130, step: 0.066, motes: 0.65 }
      : { steps: 200, step: 0.045, motes: 1 };
}

const UP = new Vector3(0, 1, 0);

export class EdgeWorld extends World {
  readonly id = "edge" as const;
  readonly key = 0xffe6a6;
  private pass: BackgroundPass | null = null;
  private dust: Motes | null = null;
  private walk: Walk | null = null;
  private track: ShotTrack | null = null;
  private readonly toHole = new Matrix3();
  private readonly holeRotation = new Quaternion();
  private readonly her = new Vector3();
  private readonly dir = new Vector3();
  private readonly right = new Vector3();
  private readonly line = new Vector3();
  private readonly lineRight = new Vector3();
  private readonly lineUp = new Vector3();
  private readonly hover = new Vector3();
  private readonly look = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly flowOffset = new Vector3();
  private readonly toHoleDir = new Vector3();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly cursor = { x: 0, y: 0, on: 0 };
  private readonly lensDir = new Vector3(0, 0, -1);
  private lensOn = 0;
  private tapTime = -100;
  private readonly tapNdc = new Vector2();
  private tapTouch = false;

  constructor(
    readonly length: number,
    private readonly lossLength: number,
    private readonly fallLength: number,
  ) {
    super();
  }

  async build(ctx: StoryContext) {
    this.tier = ctx.tier;
    this.setBackground(0x05060c);
    this.setFrames(new Vector3(0, 0, 0), new Vector3(0, 0, -1), null, null);
    const tilt = (HOLE.tiltDeg * Math.PI) / 180;
    this.holeRotation.setFromAxisAngle(new Vector3(0, 0, 1), tilt);
    this.toHole.setFromMatrix4(
      new Matrix4().makeRotationFromQuaternion(this.holeRotation).invert(),
    );
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);
    const steps = stepsFor(ctx.tier);
    this.pass = new BackgroundPass(fullscreen, EDGE_HOLE_FRAGMENT, {
      uTime: this.uniforms.uTime,
      uFreeze: this.uniforms.uFreeze,
      uToHole: { value: this.toHole },
      uHolePos: { value: HOLE.centre.clone() },
      uHoleScale: { value: HOLE.scale },
      uSteps: { value: steps.steps },
      uStep: { value: steps.step },
      uSpace: { value: new Color(0x04050b) },
      uSpaceBand: { value: new Color(0x1a2063) },
      uStarBlue: { value: new Color(0x86a8ff) },
      uStarYellow: { value: new Color(0xf7bf33) },
      uDiskHot: { value: new Color(0xfff6e4) },
      uDiskBody: { value: new Color(0xf7bf33) },
      uDiskEdge: { value: new Color(0xf94141) },
      uDiskIn: { value: HOLE.diskIn },
      uDiskOut: { value: HOLE.diskOut },
      uDiskGain: { value: 1.25 },
      uLens: { value: new Vector4(0, 0, -1, 0) },
      uRipple: { value: new Vector4(0, 0, 0, 0) },
      uRing: { value: 0.55 },
      uFilament: { value: new Color(0x2c3f7a) },
    });
    this.materials.push(this.pass.material);
    this.scene.add(this.pass.layer.mesh);

    this.dust = new Motes(
      {
        max: 560,
        box: new Vector3(34, 20, 56),
        ahead: 16,
        size: [0.025, 0.085],
        colours: [0xffffff, 0xffe6a6, 0x86a8ff, 0xf7bf33],
        additive: true,
        shape: 1,
        drift: 0.5,
        opacity: 0.85,
      },
      this.uniforms.uFreeze,
      this.uniforms.uTime,
    );
    this.scene.add(this.dust.points);
    this.setTier(ctx.tier);

    // Her light: the disk ahead (warm), a deep navy fill around her.
    this.rig.hemi.color.setHex(0x26316e);
    this.rig.hemi.groundColor.setHex(0x07080f);
    this.rig.hemi.intensity = 0.55;
    this.rig.key.color.setHex(0xffd9a0);
    this.rig.key.intensity = 2.4;

    this.buildCourse();
  }

  private buildCourse() {
    const start = this.fromEntry(0, -0.5, -40);
    const towardHole = HOLE.centre.clone().sub(start).normalize();
    const points = [
      start,
      new Vector3(1.4, -1.0, -62),
      new Vector3(4.4, -2.1, -86),
      new Vector3(7.8, -3.3, -108),
    ];
    const last = points.at(-1) ?? start;
    // The end of the glide points at the hole, so "behind her" is also "the hole behind her".
    points.push(last.clone().addScaledVector(towardHole, 18));
    this.walk = new Walk(new Course(points), this.length, (T) => {
      if (T < 0.7) return 53 + (20 - 53) * ease01(T, 0, 0.7);
      if (T < 3.0) return 20 + 1.5 * Math.sin(T * 1.7);
      return 20 + (9 - 20) * ease01(T, 3.0, this.length);
    });
    this.track = this.shots();
  }

  /** Her position, direction, the hole line (from the hole through her) and their bases at `T` in the glide. */
  private place(T: number) {
    const walk = this.walk;
    if (!walk) return;
    const u = walk.u(T);
    walk.course.at(u, this.her);
    walk.course.tangent(u, this.dir);
    this.right.crossVectors(this.dir, UP).normalize();
    this.basis(this.her);
  }

  /** The line from the hole through `p`, and a right and up across it. */
  private basis(p: Vector3) {
    this.line.copy(p).sub(HOLE.centre).normalize();
    this.lineRight.crossVectors(UP, this.line).normalize();
    this.lineUp.crossVectors(this.line, this.lineRight).normalize();
  }

  /** Where she ends the glide and hovers through the loss (the base for the loss and the fall). */
  private lossBase() {
    this.place(this.length);
    const speed = 9;
    // She coasts on along her heading, slowing to a hover by p 0.45.
    const coast = speed * this.lossLength * (0.45 - (0.45 * 0.45) / 0.9);
    this.hover.copy(this.her).addScaledVector(this.dir, coast);
    this.basis(this.hover);
  }

  private shots(): ShotTrack {
    const her = this.her;
    const dir = this.dir;
    const right = this.right;
    const at = (T: number) => {
      this.place(T);
    };
    return new ShotTrack([
      {
        at: 0,
        blend: 0,
        shot: (T, out) => {
          at(T);
          chaseShot(out, her, dir);
          out.shake = 0.0015;
          out.look = 0.03;
          out.roll = 0;
        },
      },
      {
        // Establishing: low, behind and to her right; the lensed arc fills the sky ahead.
        at: 0.75,
        blend: 0.5,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(dir, -5.5)
            .addScaledVector(right, 1.5)
            .addScaledVector(UP, 0.55);
          out.target.copy(her).addScaledVector(dir, 14).addScaledVector(UP, 1.0);
          out.fov = 50;
          out.roll = -0.02;
          out.shake = 0.001;
          out.look = 0.04;
        },
      },
      {
        // The reveal: the camera pulls back and up until she is a speck against the disk.
        at: 1.5,
        blend: 0.45,
        shot: (T, out) => {
          at(T);
          const k = ease01(T, 1.2, 2.7);
          out.position
            .copy(her)
            .addScaledVector(dir, -(6 + 56 * k))
            .addScaledVector(UP, 1 + 15 * k)
            .addScaledVector(right, 1.5 + 7 * k);
          this.a.copy(her).lerp(HOLE.centre, 0.06 + 0.05 * k);
          out.target.copy(this.a);
          out.fov = 48 - 12 * k;
          out.roll = 0.015 * k;
          out.shake = 0;
          out.look = 0.05;
        },
      },
      {
        // The hero moment: a long lens from far behind and below; she crosses the light.
        at: 2.85,
        blend: 0.4,
        shot: (T, out) => {
          at(T);
          const drift = ease01(T, 2.4, 3.5);
          out.position
            .copy(her)
            .addScaledVector(this.line, 27 - 4 * drift)
            .addScaledVector(this.lineUp, -3.2 + 1.2 * drift)
            .addScaledVector(this.lineRight, 3.2 - 1.6 * drift);
          out.target.copy(her).addScaledVector(UP, 1.0).addScaledVector(this.lineUp, 0.6);
          out.fov = 21 + 2 * drift;
          out.roll = 0.01;
          out.shake = 0;
          out.look = 0.012;
        },
      },
      {
        // Close behind her shoulder on the hole line: the loss starts from here.
        at: 3.7,
        blend: 0.42,
        shot: (T, out) => {
          at(T);
          this.lossCamera(her, 4.5, 44, 1.0, out);
        },
      },
    ]);
  }

  /**
   * The camera on the hole line behind her root `p`, `d` metres back, lens
   * `fov`, framed on the point `focus` metres above her root (her centre is
   * 1 m up while she lies prone, her chest 1.25 m and her face 1.5 m once
   * she stands): she sits a little low in frame, the shadow just over her.
   */
  private lossCamera(p: Vector3, d: number, fov: number, focus: number, out: CameraShot) {
    const h = d * Math.tan((fov * Math.PI) / 360);
    out.position
      .copy(p)
      .addScaledVector(UP, focus)
      .addScaledVector(this.line, d)
      .addScaledVector(this.lineUp, 0.08 * h)
      .addScaledVector(this.lineRight, 0.12 * h);
    out.target
      .copy(p)
      .addScaledVector(UP, focus)
      .addScaledVector(this.lineUp, 0.3 * h)
      .addScaledVector(this.line, -1);
    out.fov = fov;
    out.roll = 0;
    out.shake = 0;
    out.look = 0.02;
    out.widen = 1;
  }

  course(T: number, pose: FlightPose, shot: CameraShot, time: number) {
    if (T > this.length + this.lossLength) {
      this.fall(
        lin01(T, this.length + this.lossLength, this.length + this.lossLength + this.fallLength),
        pose,
        shot,
        time,
      );
      return;
    }
    if (T > this.length) {
      this.loss(lin01(T, this.length, this.length + this.lossLength), pose, shot, time);
      return;
    }
    this.glide(T, pose, shot, time);
  }

  private glide(T: number, pose: FlightPose, shot: CameraShot, time: number) {
    const walk = this.walk;
    if (!walk || !this.track) return;
    this.track.sample(T, shot);
    this.place(T);
    pose.position.copy(this.her);
    pose.position.y += 0.18 * Math.sin(time * 0.8) * ease01(T, 0.4, 1.0);
    pose.heading.copy(this.dir);
    const speed = walk.profile(T);
    pose.velocity.copy(this.dir).multiplyScalar(speed);
    const hero = ease01(T, 2.55, 2.95) * (1 - ease01(T, 3.45, 3.85));
    const deg = Math.PI / 180;
    pose.pitch = deg * (80 + 5 * hero);
    pose.yaw = 0;
    pose.roll = 0.05 * Math.sin(time * 0.6);
    pose.spin = 0;
    pose.bank = walk.course.bank(walk.u(T), speed, 0.6) + 0.06 * Math.sin(time * 0.9);
    pose.lean = 0;
    pose.sway = 0.8;
    pose.layers = [
      { clip: "fly_glide", weight: 1 - hero },
      { clip: "fly_superhero", weight: hero },
    ];
    pose.face = hero > 0.5 ? "big_smile" : "smile";
    pose.faceWeight = 0.85;
    pose.glow = 0.72 + 0.18 * hero;
    pose.glowColor = this.key;
    pose.rim = 1.2;
    pose.rimColor = 0xffd9a0;
    pose.lift = 0.05;
    pose.look = null;
    pose.lookWeight = 0;
    pose.nervous = 0;
    pose.visible = true;
  }

  /** `w-loss` at progress `p`. */
  private loss(p: number, pose: FlightPose, shot: CameraShot, time: number) {
    this.lossBase();
    const coast = Math.min(p, 0.45);
    const travel = 9 * this.lossLength * (coast - (coast * coast) / 0.9);
    this.place(this.length);
    pose.position.copy(this.her).addScaledVector(this.dir, travel);
    // Upright, she bobs a little as the power stutters, then hangs.
    const upright = ease01(p, 0.0, 0.14);
    pose.position.y +=
      0.22 * ease01(p, 0.1, 0.55) -
      0.06 * Math.sin(p * 40) * ease01(p, 0.15, 0.6) * (1 - ease01(p, 0.6, 0.72));
    pose.heading.copy(this.dir);
    pose.velocity.copy(this.dir).multiplyScalar(9 * (1 - ease01(p, 0, 0.45)));
    pose.pitch = ((80 * Math.PI) / 180) * (1 - upright);
    // She turns around to face us (the hole behind her).
    pose.yaw = Math.PI * ease01(p, 0.16, 0.52);
    pose.roll = 0;
    pose.spin = 0;
    pose.bank = 0;
    pose.lean = 0;
    pose.sway = 0.6 * (1 - ease01(p, 0.6, 0.75));
    pose.layers = [
      { clip: "fly_glide", weight: 1 - upright },
      { clip: "power_loss", weight: Math.max(upright, 1e-3), progress: lin01(p, 0, 0.96) },
    ];
    pose.face = "auto";
    pose.faceWeight = 1;
    // The glow stutters (8 to 12 Hz on the clock) and dies.
    const env = 1 - ease01(p, 0.12, 0.74);
    const hz = 8 + 4 * (0.5 + 0.5 * Math.sin(time * 1.3));
    const stutter =
      Math.sin(time * hz * Math.PI * 2) + 0.6 * Math.sin(time * 23.7) > 0.15 ? 1 : 0.25;
    pose.glow = (p < 0.12 ? 1 : env * (0.35 + 0.65 * stutter)) * 0.8;
    pose.glowColor = this.key;
    pose.rim = 1.2 - 0.6 * ease01(p, 0.3, 0.8);
    pose.rimColor = 0xffd9a0;
    pose.lift = 0.05;
    pose.nervous = 0.5 * ease01(p, 0.2, 0.5);
    pose.visible = true;

    // The camera: the dolly zoom (she stays the same size, the hole swells), the push to her face, hang, uh-oh.
    const W = 2 * 4.5 * Math.tan((44 * Math.PI) / 360);
    const dz = ease01(p, 0.06, 0.5);
    let d = 4.5 + (15 - 4.5) * dz;
    let fov = (2 * Math.atan(W / (2 * d)) * 180) / Math.PI;
    let focus = 1.0 + 0.2 * upright;
    const push = ease01(p, 0.52, 0.74);
    if (push > 0) {
      d += (5.8 - d) * push;
      fov += (9.4 - fov) * push;
      focus += (1.5 - focus) * push;
    }
    const hang = ease01(p, HANG.start, HANG.end);
    d *= 1 - 0.03 * hang;
    const wide = ease01(p, 0.9, 1.0);
    d += (8 - d) * wide;
    fov += (32 - fov) * wide;
    focus += (1.25 - focus) * wide;
    this.lossCamera(pose.position, d, fov, focus, shot);
    shot.shake = 0.0015 * ease01(p, 0.12, 0.3) * (1 - ease01(p, 0.5, 0.6));
    // Her eyes find us (the clip turns her head from 1.7 s, our lookAt seals it).
    this.look.copy(shot.position);
    pose.look = this.look;
    pose.lookWeight = 0.9 * ease01(p, 0.6, 0.72);
  }

  /** `w-fall` at progress `p`: she drops away; the camera holds where the loss left it. */
  private fall(p: number, pose: FlightPose, shot: CameraShot, time: number) {
    this.loss(1, pose, shot, time);
    const base = this.a.copy(pose.position);
    const tau = p * FALL_SECONDS;
    // Space gravity, cartoon timing: a slow first instant, then down and away from us
    // (toward the hole), shrinking as she goes, tumbling a little.
    const drop = 0.5 * FALL_G * tau * tau;
    this.b.copy(this.line).negate();
    pose.position
      .copy(base)
      .addScaledVector(this.b, 6.2 * tau * tau * 0.5 + 1.2 * tau)
      .addScaledVector(this.lineRight, 0.6 * tau)
      .addScaledVector(
        UP,
        -drop + 0.25 * Math.sin(Math.min(1, tau * 3) * Math.PI) * (1 - ease01(tau, 0.2, 0.5)),
      );
    pose.velocity.set(0, FALL_G * tau + 3, 0);
    pose.pitch = 0;
    pose.yaw = Math.PI;
    pose.roll = 0.6 * Math.sin(tau * 2.1) * ease01(tau, 0.1, 0.6);
    pose.spin = 1.4 * tau * tau;
    pose.bank = 0;
    pose.lean = 0;
    pose.sway = 0.4;
    const flail = ease01(p, 0.0, 0.08);
    pose.layers = [
      { clip: "power_loss", weight: Math.max(1 - flail, 1e-3), progress: 1 },
      { clip: "fall_flail", weight: Math.max(flail, 1e-3) },
    ];
    pose.face = "oh_no";
    pose.faceWeight = 1;
    pose.glow = 0;
    pose.rim = 0.6;
    pose.nervous = 0.6;
    pose.look = null;
    pose.lookWeight = 0;
    // The camera stays put; late, it tilts down a touch, as if looking for her.
    const peek = ease01(p, 0.4, 0.9);
    shot.target.addScaledVector(UP, -0.7 * peek);
    shot.fov += 2 * peek;
    shot.shake = 0;
  }

  timeRate(T: number) {
    if (T <= this.length) return 1;
    const p = lin01(T, this.length, this.length + this.lossLength);
    if (T > this.length + this.lossLength) return 1;
    const slow =
      ease01(p, HANG.start - 0.04, HANG.start + 0.04) *
      (1 - ease01(p, HANG.end - 0.02, HANG.end + 0.06));
    return 1 - 0.88 * slow;
  }

  frame(ctx: StoryContext, f: WorldFrame) {
    const u = this.uniforms;
    u.uTime.value = f.time;
    u.uFreeze.value = f.freeze;
    u.uFlow.value = f.flow;
    const pass = this.pass;
    const dust = this.dust;
    if (!pass || !dust) return;
    const T = Math.max(0, f.T);
    if (T <= this.length) this.place(T);
    else this.lossBase();
    const her = T <= this.length ? this.her : this.hover;

    // The cursor's lens and the tap's ripple (main view only).
    const pu = pass.uniforms;
    const pointer = ctx.pointer;
    let lensTarget = 0;
    if (f.view === "main") {
      const mouse = pointer.type === "mouse" && pointer.inside;
      const tapAge = f.time - this.tapTime;
      if (mouse) {
        this.ndc.set(pointer.ndc.x, pointer.ndc.y);
        lensTarget = 1;
      } else if (this.tapTouch && tapAge < 1.8) {
        this.ndc.copy(this.tapNdc);
        lensTarget = 1 - ease01(tapAge, 0.6, 1.8);
      }
      if (lensTarget > 0) {
        this.ray.setFromCamera(this.ndc, f.camera);
        this.lensDir.lerp(this.ray.ray.direction, 0.35).normalize();
      }
      this.lensOn += (lensTarget - this.lensOn) * 0.12;
      const age = Math.max(0, tapAge);
      (pu.uRipple.value as Vector4).set(HOLE.diskIn + age * 3.4, age, age < 4 ? 1 : 0, 0);
      this.cursor.x = this.ndc.x;
      this.cursor.y = this.ndc.y;
      this.cursor.on = this.lensOn;
    } else {
      (pu.uRipple.value as Vector4).set(0, 0, 0, 0);
    }
    (pu.uLens.value as Vector4).set(
      this.lensDir.x,
      this.lensDir.y,
      this.lensDir.z,
      f.view === "main" ? this.lensOn : 0,
    );
    // The disk dims a little as she loses her light (the world is not on her side any more).
    const lossP = lin01(T, this.length, this.length + this.lossLength);
    pu.uDiskGain.value = 1.25 - 0.18 * ease01(lossP, 0.3, 0.9);
    pass.draw(ctx, f.camera, f.view, f.view === "main" ? backgroundScale(this.tier) : 0.3);

    // Dust falls toward the hole with the treadmill.
    this.toHoleDir.copy(HOLE.centre).sub(her).normalize();
    this.flowOffset.copy(this.toHoleDir).multiplyScalar(f.flow * 2.4);
    dust.update(
      f.camera,
      this.flowOffset,
      f.view === "main" ? this.cursor : { x: 0, y: 0, on: 0 },
      ctx.size.height * ctx.size.dpr,
      ctx.size.aspect,
    );

    // Her key light: from the disk.
    this.rig.key.position.copy(her).addScaledVector(this.toHoleDir, 40).addScaledVector(UP, -8);
    this.rig.key.target.position.copy(her);
    this.rig.key.target.updateMatrixWorld();
    this.rig.key.intensity = 2.4 - 0.5 * ease01(lossP, 0.4, 1);
    // A soft, cool fill from our side once she turns to face us, so her face reads against the light.
    const fall = T > this.length + this.lossLength;
    const fill = fall ? 0.6 : ease01(lossP, 0.3, 0.6);
    this.rig.spill.color.setHex(0x9fb4e6);
    this.rig.spill.position.copy(f.camera.position).addScaledVector(UP, 0.6);
    this.rig.spill.distance = 40;
    this.rig.spill.intensity = 26 * fill;
  }

  post(): Partial<StoryPostParams> {
    return { bloom: 0.62, bloomThreshold: 0.6, bloomRadius: 0.62, vignette: 0.55, grain: 0.17 };
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent, time: number) {
    if (event.type !== "tap") return false;
    this.tapTime = time;
    this.tapTouch = event.pointerType === "touch";
    this.tapNdc.set(event.ndc.x, event.ndc.y);
    if (this.tapTouch) {
      this.ray.setFromCamera(this.tapNdc, ctx.stage.camera);
      this.lensDir.copy(this.ray.ray.direction);
    }
    return true;
  }

  setTier(tier: StoryTier) {
    super.setTier(tier);
    const s = stepsFor(tier);
    if (this.pass) {
      this.pass.uniforms.uSteps.value = s.steps;
      this.pass.uniforms.uStep.value = s.step;
    }
    this.dust?.setShare(s.motes);
  }

  warmTargets(renderer: WebGLRenderer) {
    this.pass?.warm(renderer);
  }

  dispose() {
    this.pass?.dispose();
    this.dust?.dispose();
    super.dispose();
  }
}
