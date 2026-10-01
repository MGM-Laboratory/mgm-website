import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  CylinderGeometry,
  DepthTexture,
  DoubleSide,
  Euler,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  LinearFilter,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  UnsignedIntType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  SRGBColorSpace,
  UnsignedByteType,
  type IUniform,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";

import type {
  StoryContext,
  StoryPointerEvent,
  StoryPostParams,
  StoryTier,
} from "@/components/story/engine/act";
import { hash01 } from "@/components/story/props/deck-shared";

import {
  RendererState,
  ShotTrack,
  chaseShot,
  createScreenPass,
  createSkyLayer,
  ease01,
  fullscreenGeometry,
  lin01,
  yieldToMain,
  type CameraShot,
  type FlightPose,
} from "./common";
import { Course, Walk } from "./course";
import {
  DOF_FRAGMENT,
  DROP_FRAGMENT,
  DROP_VERTEX,
  LEAF_FRAGMENT,
  LEAF_SKY,
  LEAF_VERTEX,
  SHAFT_FRAGMENT,
  SHAFT_VERTEX,
  SOLID_FRAGMENT,
  SOLID_VERTEX,
} from "./leaf.glsl";
import { Motes } from "./motes";
import { World, type WorldFrame } from "./world";

/**
 * World 04, Leafhold: "A garden of giant leaves where she is the size of a
 * ladybird, and she slows down to play." She is confident now, so she plays:
 * a laughing spiral round a giant stem (the camera orbits her), a ride on
 * her back under a falling leaf with her hand on it, a loop the loop past a
 * dew drop as the focus racks from the drop to her, then a calm glide to the
 * next rift.
 *
 * It is shot like macro photography: on the high and medium tiers the
 * garden renders into a target with depth and a depth of field pass blurs
 * everything off her plane (`present()`); the sky is a canopy of bokeh. Leaves
 * are one instanced draw cut out in the shader; stems, berries, dew drops,
 * light shafts and pollen one each. The cursor rustles the leaves and stirs
 * the pollen; a tap sends a gust through the garden and wobbles a dew drop.
 */

const UP = new Vector3(0, 1, 0);
const SUN = new Vector3(-0.45, 0.78, -0.42).normalize();

const STEM = { x: 4.2, z: -22, r: 2.6 };
const LOOP = { centre: new Vector3(0, 10.5, -82), r: 3.2, drift: 3 };
const DROP = { at: new Vector3(-2.3, 8.9, -77.5), r: 0.52 };
/** The locked-off lens for the rack focus: just behind the drop, the loop beyond it. */
const RACK_CAMERA = DROP.at.clone().add(new Vector3(-0.8, 0.3, 2.6));

type LeafSpec = {
  base: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  length: number;
  width: number;
  curl: number;
  cup: number;
  tint: number;
  falling?: boolean;
};

const GREENS = [0x0f8657, 0x1f9a5f, 0x3fae67, 0x5fb36f, 0x9fcf5a, 0x0c6e4a];

function settingsFor(tier: StoryTier) {
  return tier === "low"
    ? { leaves: 0.55, drops: 0.5, motes: 0.35, dof: 0, haze: 0.012 }
    : tier === "medium"
      ? { leaves: 0.8, drops: 0.8, motes: 0.65, dof: 0.75, haze: 0.01 }
      : { leaves: 1, drops: 1, motes: 1, dof: 1, haze: 0.009 };
}

export class LeafWorld extends World {
  readonly id = "leaf" as const;
  readonly key = 0x0f8657;
  private sky: ReturnType<typeof createSkyLayer> | null = null;
  private leaves: InstancedMesh | null = null;
  private leafCount = 0;
  private leafMaterial: ShaderMaterial | null = null;
  private drops: InstancedMesh | null = null;
  private dropBounce: InstancedBufferAttribute | null = null;
  private dropCount = 0;
  private motes: Motes | null = null;
  private walk: Walk | null = null;
  private track: ShotTrack | null = null;
  private readonly shared: Record<string, IUniform>;
  private readonly her = new Vector3();
  private readonly dir = new Vector3();
  private readonly right = new Vector3();
  private readonly flat = new Vector3();
  private readonly loopUp = new Vector3();
  /** Where her eyes go under the leaf (its own vector: nothing else writes it). */
  private readonly lookAt = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly fallMatrix = new Matrix4();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly cursor = { x: 0, y: 0, on: 0 };
  private readonly gust = new Vector4(0, 0, 0, -1);
  private gustTime = -100;
  private hover = 0;
  private readonly flowOffset = new Vector3();
  private readonly marks = {
    spin: 1.2,
    spinEnd: 2.2,
    under: 2.5,
    underEnd: 3.0,
    loop: 3.3,
    loopEnd: 3.9,
  };
  /** This frame's focus distance and aperture (pixels of blur at infinity on a 900 px tall frame). */
  private focus = 8;
  private aperture = 10;
  // Depth of field.
  private dofTarget: WebGLRenderTarget | null = null;
  private dofMaterial: ShaderMaterial | null = null;
  private readonly dofScene = new Scene();
  private readonly state = new RendererState();

  constructor(readonly length: number) {
    super();
    this.shared = {
      uTime: this.uniforms.uTime,
      uFreeze: this.uniforms.uFreeze,
      uCamPos: { value: new Vector3() },
      uSunDir: { value: SUN.clone() },
      uHaze: { value: new Color(0xcfe3b0) },
      uHazeDensity: { value: 0.009 },
      uCanopyTop: { value: new Color(0xfff3c8) },
      uCanopyMid: { value: new Color(0x86c27a) },
      uCanopyLow: { value: new Color(0x16473f) },
      uBokehA: { value: new Color(0xd8f0a0) },
      uBokehB: { value: new Color(0x5fb36f) },
    };
  }

  async build(ctx: StoryContext) {
    this.tier = ctx.tier;
    this.setBackground(0x86c27a);
    this.setFrames(
      new Vector3(0, 6, 50),
      new Vector3(0, 0, -1),
      new Vector3(0, 11, -128),
      new Vector3(0, 0, -1),
    );
    this.buildCourse();
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);
    this.sky = createSkyLayer(fullscreen, LEAF_SKY, { ...this.shared });
    this.materials.push(this.sky.material);
    this.scene.add(this.sky.mesh);
    this.buildStems();
    await yieldToMain();
    this.buildLeaves();
    await yieldToMain();
    this.buildShafts();
    this.motes = new Motes(
      {
        max: 480,
        box: new Vector3(26, 18, 36),
        ahead: 10,
        size: [0.03, 0.09],
        colours: [0xfff1b0, 0xf7bf33, 0xffffff, 0xd8f0a0],
        additive: true,
        shape: 0,
        drift: 1.2,
        opacity: 0.8,
      },
      this.uniforms.uFreeze,
      this.uniforms.uTime,
    );
    this.scene.add(this.motes.points);
    this.buildDof(fullscreen);
    this.setTier(ctx.tier);

    // Her light: warm sun through the canopy, green bounce from the leaves, a blue shade fill.
    this.rig.hemi.color.setHex(0xf3f2d0);
    this.rig.hemi.groundColor.setHex(0x3f8a5a);
    this.rig.hemi.intensity = 1.1;
    this.rig.key.color.setHex(0xfff0cc);
    this.rig.key.intensity = 2.4;
  }

  // ---------------------------------------------------------------- course

  private buildCourse() {
    const start = this.fromEntry(0, -0.5, -40);
    const points = [start, new Vector3(0.4, 5, -2), new Vector3(1.0, 4.9, -13)];
    // A laughing spiral round the great stem: one turn, rising.
    for (let k = 0; k <= 16; k += 1) {
      const th = Math.PI + (k / 16) * Math.PI * 2;
      points.push(
        new Vector3(
          STEM.x + STEM.r * Math.cos(th),
          5 + 6 * (k / 16),
          STEM.z + STEM.r * Math.sin(th),
        ),
      );
    }
    points.push(
      new Vector3(0.9, 10.6, -33),
      new Vector3(-0.6, 9.8, -45),
      new Vector3(-1.6, 9.2, -55),
      new Vector3(-2.0, 8.8, -64),
      new Vector3(-1.0, 7.9, -73),
    );
    // A loop the loop past the dew drop, drifting forward so she comes out ahead of where she went in.
    for (let k = 0; k <= 16; k += 1) {
      const phi = (k / 16) * Math.PI * 2;
      const c = LOOP.centre;
      points.push(
        new Vector3(
          c.x,
          c.y - LOOP.r * Math.cos(phi),
          c.z - LOOP.r * Math.sin(phi) - LOOP.drift * (k / 16),
        ),
      );
    }
    points.push(
      new Vector3(0, 7.8, -95),
      new Vector3(0, 8.8, -106),
      new Vector3(0, 9.6, -116),
      this.fromExit(0, -1.3, 3.4),
    );
    const course = new Course(points, 0.5);
    this.walk = new Walk(course, this.length, (T) => {
      if (T < 0.55) return 53 + (24 - 53) * ease01(T, 0, 0.55);
      if (T < 4.6) return 24 + 4 * Math.sin(T * 1.4);
      return 24 + (6 - 24) * ease01(T, 4.6, this.length);
    });
    // Landmarks on the walk.
    const at = (test: (p: Vector3) => boolean) => {
      for (let i = 0; i <= 1000; i += 1) {
        const T = (i / 1000) * this.length;
        course.at(this.walk?.u(T) ?? 0, this.a);
        if (test(this.a)) return T;
      }
      return this.length;
    };
    this.marks.spin = at((p) => p.z <= STEM.z + 0.2 && p.x < STEM.x);
    this.marks.spinEnd = at((p) => p.y > 10.5 && p.z < -30);
    this.marks.under = at((p) => p.z <= -46);
    this.marks.underEnd = at((p) => p.z <= -68);
    this.marks.loop = at((p) => p.z <= LOOP.centre.z && p.y < LOOP.centre.y - LOOP.r + 0.3);
    this.marks.loopEnd = at((p) => p.z <= -93);
    this.track = this.shots();
  }

  private place(T: number) {
    const walk = this.walk;
    if (!walk) return;
    const u = walk.u(T);
    walk.course.at(u, this.her);
    walk.course.tangent(u, this.dir);
    this.right.crossVectors(this.dir, UP);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.right.normalize();
    this.flat.set(this.dir.x, 0, this.dir.z);
    if (this.flat.lengthSq() < 1e-6) this.flat.set(0, 0, -1);
    this.flat.normalize();
  }

  private shots(): ShotTrack {
    const her = this.her;
    const dir = this.dir;
    const flat = this.flat;
    const m = this.marks;
    const at = (T: number) => {
      this.place(T);
    };
    const pivot = (T: number, out: Vector3) => {
      at(T);
      return out.copy(her).addScaledVector(UP, 1);
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
        // A slow dolly, low on her left, looking up through the leaves and the light.
        at: 0.62,
        blend: 0.5,
        shot: (T, out) => {
          at(T);
          const k = ease01(T, 0.4, m.spin);
          out.position.set(her.x - 7.5 + 2 * k, her.y - 1.8, her.z + 5 - 2 * k);
          out.target.copy(her).addScaledVector(flat, 6).addScaledVector(UP, 2.2);
          out.fov = 48;
          out.roll = 0.03;
          out.shake = 0.001;
          out.look = 0.05;
        },
      },
      {
        // The spiral: the camera circles her as she circles the stem.
        at: m.spin + 0.08,
        blend: 0.35,
        pivot,
        shot: (T, out) => {
          at(T);
          const k = lin01(T, m.spin - 0.2, m.spinEnd + 0.2);
          const ang = 1.2 + k * Math.PI * 1.35;
          out.position.set(
            her.x + 5.2 * Math.cos(ang),
            her.y + 1.1 + 0.6 * Math.sin(k * 3),
            her.z + 5.2 * Math.sin(ang),
          );
          out.target.copy(her).addScaledVector(UP, 1.05);
          out.fov = 44;
          out.roll = 0.04 * Math.sin(k * 6);
          out.shake = 0;
          out.look = 0.03;
        },
      },
      {
        // Under the falling leaf: low and to her side, the leaf a green ceiling over her.
        at: m.under + 0.12,
        blend: 0.5,
        pivot,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(this.right, -6.5)
            .addScaledVector(UP, -1.8)
            .addScaledVector(flat, 1.6);
          out.target.copy(her).addScaledVector(UP, 1.4).addScaledVector(flat, 2);
          out.fov = 52;
          out.roll = -0.05;
          out.shake = 0;
          out.look = 0.03;
        },
      },
      {
        // The loop and the rack focus: locked off just behind the dew drop, she loops beyond it.
        at: m.loop + 0.04,
        blend: 0.3,
        shot: (_T, out) => {
          out.position.copy(RACK_CAMERA);
          out.target.copy(DROP.at).lerp(LOOP.centre, 0.55);
          out.fov = 40;
          out.roll = 0.02;
          out.shake = 0;
          out.look = 0.015;
        },
      },
      {
        // Out of the loop: the lens follows her out from behind, then settles into a chase.
        at: m.loopEnd + 0.18,
        blend: 0.6,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(flat, -6)
            .addScaledVector(UP, 1.8)
            .addScaledVector(this.right, -1.2);
          out.target.copy(her).addScaledVector(flat, 6).addScaledVector(UP, 1);
          out.fov = 46;
          out.roll = 0.02;
          out.shake = 0;
          out.look = 0.04;
        },
      },
      {
        // The glide: a leading shot, ahead of her looking back; she is calm now.
        at: m.loopEnd + 0.75,
        blend: 0.6,
        pivot,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(flat, 6)
            .addScaledVector(UP, 1.4)
            .addScaledVector(this.right, 2);
          out.target.copy(her).addScaledVector(UP, 1.0);
          out.fov = 44;
          out.roll = 0.02;
          out.shake = 0;
          out.look = 0.04;
        },
      },
      {
        at: 5.35,
        blend: 0.6,
        pivot,
        shot: (T, out) => {
          at(T);
          chaseShot(out, her, dir, 7, 1.3, 7, 48);
          out.roll = 0;
          out.shake = 0.001;
          out.look = 0.03;
        },
      },
    ]);
  }

  private readonly fallQ = new Quaternion();
  private readonly fallTurn = new Quaternion();
  private readonly fallEuler = new Euler();
  private readonly fallScale = new Vector3(5.5, 6, 12);
  private readonly fallAt = new Vector3();
  private readonly forwardZ = new Vector3(0, 0, 1);
  private readonly axisZ = new Vector3(0, 0, 1);

  /** The falling leaf's transform at course time `T`: it drifts down to meet her, she rides under it, it falls on. */
  private fallingLeaf(T: number, out: Matrix4) {
    const m = this.marks;
    const meet = m.under + 0.08;
    const part = m.underEnd - 0.05;
    const p = this.fallAt;
    const q = this.fallQ;
    if (T < meet) {
      // Drifting down from high above, swinging like a falling leaf does.
      this.place(meet);
      const k = lin01(T, meet - 2.2, meet);
      const start = this.b.set(this.her.x + 6, this.her.y + 26, this.her.z - 6);
      const end = this.a.copy(this.her).addScaledVector(UP, 2.5);
      p.copy(start).lerp(end, 1 - Math.pow(1 - k, 1.6));
      const swing = Math.sin(k * Math.PI * 5) * (1 - k);
      p.x += 4 * swing;
      q.setFromEuler(this.fallEuler.set(0.25 * swing, 0.6 + swing * 0.8, 0.5 * swing));
      out.compose(p, q, this.fallScale);
      return;
    }
    if (T < part) {
      // Over her, close enough to touch, riding the same air.
      this.place(T);
      p.copy(this.her)
        .addScaledVector(UP, 2.5 + 0.2 * Math.sin(T * 9))
        .addScaledVector(this.dir, -4);
      q.setFromUnitVectors(this.forwardZ, this.b.copy(this.dir).setY(0).normalize());
      out.compose(p, q, this.fallScale);
      return;
    }
    // She slips out ahead; it sails on down, turning over.
    this.place(part);
    const k = lin01(T, part, part + 1.6);
    p.copy(this.her)
      .addScaledVector(UP, 2.5 - 22 * k * k)
      .addScaledVector(this.dir, -4 - 6 * k);
    p.x += 3 * Math.sin(k * 7);
    q.setFromUnitVectors(this.forwardZ, this.b.copy(this.dir).setY(0).normalize());
    q.multiply(this.fallTurn.setFromAxisAngle(this.axisZ, k * 2.4));
    out.compose(p, q, this.fallScale);
  }

  // ---------------------------------------------------------------- geometry

  private readonly stems: { x: number; z: number; h: number; r: number }[] = [
    { x: STEM.x, z: STEM.z, h: 70, r: 0.9 },
    { x: -8, z: -8, h: 60, r: 0.7 },
    { x: 9.5, z: -48, h: 66, r: 0.8 },
    { x: -9.5, z: -58, h: 58, r: 0.75 },
    { x: 6.5, z: -96, h: 64, r: 0.85 },
    { x: -7.5, z: -104, h: 60, r: 0.7 },
    { x: 12, z: -14, h: 56, r: 0.6 },
    { x: -14, z: -36, h: 62, r: 0.8 },
    { x: 4, z: -142, h: 70, r: 0.9 },
    { x: -5, z: -76, h: 52, r: 0.65 },
    { x: -30, z: -60, h: 80, r: 1.6 },
    { x: 34, z: -86, h: 84, r: 1.8 },
    { x: -42, z: -130, h: 90, r: 2 },
    { x: 46, z: -20, h: 78, r: 1.6 },
    { x: 20, z: -150, h: 76, r: 1.4 },
    { x: -22, z: 4, h: 70, r: 1.3 },
  ];

  private buildStems() {
    const geometry = new CylinderGeometry(0.55, 1, 1, 14, 1);
    geometry.translate(0, 0.5, 0);
    this.geometries.push(geometry);
    const n = this.stems.length;
    const berriesPer = 3;
    const tint = new Float32Array(n * 3);
    const colour = new Color();
    this.stems.forEach((s, i) => {
      colour.setHex(i % 3 === 0 ? 0x2f7d4a : i % 3 === 1 ? 0x3d8f52 : 0x266b43);
      tint.set([colour.r, colour.g, colour.b], i * 3);
    });
    geometry.setAttribute("aTint", new InstancedBufferAttribute(tint, 3));
    const material = new ShaderMaterial({
      vertexShader: SOLID_VERTEX,
      fragmentShader: SOLID_FRAGMENT,
      uniforms: { ...this.shared },
      toneMapped: false,
    });
    this.materials.push(material);
    const mesh = new InstancedMesh(geometry, material, n);
    const m = new Matrix4();
    this.stems.forEach((s, i) => {
      m.makeScale(s.r, s.h, s.r);
      m.setPosition(s.x, -30, s.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    // Red berries in clusters on some stems.
    const berry = new SphereGeometry(1, 16, 12);
    this.geometries.push(berry);
    const clusters = this.stems.slice(1, 9);
    const count = clusters.length * berriesPer;
    const berryTint = new Float32Array(count * 3);
    colour.setHex(0xf94141);
    for (let i = 0; i < count; i += 1) berryTint.set([colour.r, colour.g, colour.b], i * 3);
    berry.setAttribute("aTint", new InstancedBufferAttribute(berryTint, 3));
    const berries = new InstancedMesh(berry, material, count);
    clusters.forEach((s, c) => {
      const h = 3 + hash01(c, 51) * 14;
      for (let k = 0; k < berriesPer; k += 1) {
        const ang = hash01(c * 7 + k, 52) * Math.PI * 2;
        const r = 0.35 + hash01(c * 7 + k, 53) * 0.3;
        m.makeScale(r, r, r);
        m.setPosition(
          s.x + Math.cos(ang) * (s.r * 0.8 + 0.6),
          h - k * 0.5,
          s.z + Math.sin(ang) * (s.r * 0.8 + 0.6),
        );
        berries.setMatrixAt(c * berriesPer + k, m);
      }
    });
    berries.frustumCulled = false;
    this.scene.add(berries);
  }

  /** Is a leaf (base, tip, half width) in the way of her course or the camera? */
  private clear(base: Vector3, tip: Vector3, half: number, probes: Vector4[]) {
    for (let k = 0; k <= 6; k += 1) {
      this.a.copy(base).lerp(tip, k / 6);
      for (const p of probes) {
        const dx = this.a.x - p.x;
        const dy = this.a.y - p.y;
        const dz = this.a.z - p.z;
        const r = p.w + half;
        if (dx * dx + dy * dy + dz * dz < r * r) return false;
      }
    }
    return true;
  }

  private buildLeaves() {
    const walk = this.walk;
    const track = this.track;
    if (!walk || !track) return;
    const probes: Vector4[] = [];
    const shot = { position: new Vector3() };
    const cam = {
      position: new Vector3(),
      target: new Vector3(),
      fov: 45,
      roll: 0,
      shake: 0,
      look: 0,
      widen: 1,
      subject: new Vector3(),
      hold: 1,
    };
    for (let i = 0; i <= 500; i += 1) {
      const T = (i / 500) * this.length;
      walk.course.at(walk.u(T), this.a);
      probes.push(new Vector4(this.a.x, this.a.y + 1, this.a.z, 2.4));
      track.sample(T, cam);
      shot.position.copy(cam.position);
      probes.push(new Vector4(shot.position.x, shot.position.y, shot.position.z, 1.4));
    }
    // Keep the rack focus's line of sight clear: from the lens past the drop to the loop.
    for (let k = 2; k <= 12; k += 1) {
      this.a.copy(RACK_CAMERA).lerp(LOOP.centre, k / 12);
      probes.push(new Vector4(this.a.x, this.a.y, this.a.z, 0.8 + 3.4 * (k / 12)));
    }
    const specs: LeafSpec[] = [];
    this.stems.forEach((s, i) => {
      const big = s.r > 1.2;
      const count = big ? 7 : 12;
      for (let k = 0; k < count; k += 1) {
        const id = i * 31 + k;
        const h = (big ? 6 : 1) + hash01(id, 1) * (big ? 40 : 26);
        const yaw = hash01(id, 2) * Math.PI * 2;
        const length = (big ? 12 : 6) + hash01(id, 3) * (big ? 10 : 8);
        const pitch = -(0.2 + hash01(id, 4) * 0.55);
        const base = new Vector3(s.x + Math.sin(yaw) * s.r, h, s.z + Math.cos(yaw) * s.r);
        const dir = new Vector3(
          Math.sin(yaw) * Math.cos(-pitch),
          Math.sin(-pitch),
          Math.cos(yaw) * Math.cos(-pitch),
        );
        const tip = base.clone().addScaledVector(dir, length);
        const width = length * (0.42 + 0.12 * hash01(id, 5));
        if (!this.clear(base, tip, width / 2, probes)) continue;
        specs.push({
          base,
          yaw,
          pitch,
          roll: (hash01(id, 6) - 0.5) * 0.5,
          length,
          width,
          curl: 0.08 + hash01(id, 7) * 0.12,
          cup: 0.04 + hash01(id, 8) * 0.05,
          tint: GREENS.at(Math.floor(hash01(id, 9) * GREENS.length)) ?? 0x0f8657,
        });
      }
    });
    // The dew drop's leaf: its tip holds the drop, near the loop.
    const dropLeafBase = new Vector3(-7.2, 9.9, -80.5);
    specs.unshift({
      base: dropLeafBase,
      yaw: Math.atan2(DROP.at.x - dropLeafBase.x, DROP.at.z - dropLeafBase.z),
      pitch: Math.atan2(dropLeafBase.y - DROP.at.y, dropLeafBase.distanceTo(DROP.at)) * 0.6,
      roll: 0.15,
      length: dropLeafBase.distanceTo(DROP.at) * 1.05,
      width: 2.6,
      curl: 0.08,
      cup: 0.06,
      tint: 0x3fae67,
    });
    // The falling leaf (its transform is choreographed every frame).
    specs.unshift({
      base: new Vector3(),
      yaw: 0,
      pitch: 0,
      roll: 0,
      length: 12,
      width: 5.5,
      curl: 0.1,
      cup: 0.07,
      tint: 0x9fcf5a,
      falling: true,
    });
    const geometry = new PlaneGeometry(1, 1, 6, 16);
    geometry.translate(0, 0.5, 0);
    this.geometries.push(geometry);
    const data = new Float32Array(specs.length * 4);
    const tints = new Float32Array(specs.length * 3);
    const colour = new Color();
    specs.forEach((spec, i) => {
      data.set([hash01(i, 11), spec.curl, spec.cup, spec.falling ? 1 : 0], i * 4);
      colour.setHex(spec.tint);
      tints.set([colour.r, colour.g, colour.b], i * 3);
    });
    geometry.setAttribute("aLeaf", new InstancedBufferAttribute(data, 4));
    geometry.setAttribute("aTint", new InstancedBufferAttribute(tints, 3));
    this.leafMaterial = new ShaderMaterial({
      vertexShader: LEAF_VERTEX,
      fragmentShader: LEAF_FRAGMENT,
      uniforms: {
        ...this.shared,
        uPointer: { value: new Vector3() },
        uAspect: { value: 1 },
        uGust: { value: this.gust },
        uFall: { value: 1 },
        uFallMatrix: { value: this.fallMatrix },
        uRib: { value: new Color(0xe8f5c8) },
        uGlow: { value: new Color(0xd8f080) },
      },
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.leafMaterial);
    const mesh = new InstancedMesh(geometry, this.leafMaterial, specs.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const qy = new Quaternion();
    const qx = new Quaternion();
    const qz = new Quaternion();
    const s = new Vector3();
    specs.forEach((spec, i) => {
      qy.setFromAxisAngle(UP, spec.yaw);
      qx.setFromAxisAngle(new Vector3(1, 0, 0), spec.pitch);
      qz.setFromAxisAngle(new Vector3(0, 0, 1), spec.roll);
      q.copy(qy).multiply(qx).multiply(qz);
      s.set(spec.width, spec.length * 0.5, spec.length);
      m.compose(spec.base, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    this.leaves = mesh;
    this.leafCount = specs.length;
    this.scene.add(mesh);
    this.buildDrops(specs);
  }

  private buildDrops(specs: LeafSpec[]) {
    const geometry = new SphereGeometry(1, 22, 16);
    this.geometries.push(geometry);
    // The hero drop, then drops on the tips of the nearest leaves (skipping the falling one).
    const spots: { at: Vector3; r: number }[] = [{ at: DROP.at.clone(), r: DROP.r }];
    specs.slice(2).forEach((spec, i) => {
      if (hash01(i, 71) < 0.55 || spots.length > 48) return;
      const along = 0.55 + hash01(i, 72) * 0.3;
      const dir = new Vector3(
        Math.sin(spec.yaw) * Math.cos(-spec.pitch),
        Math.sin(-spec.pitch),
        Math.cos(spec.yaw) * Math.cos(-spec.pitch),
      );
      const at = spec.base.clone().addScaledVector(dir, spec.length * along);
      at.y += 0.12 - spec.curl * spec.length * 0.5 * along * along;
      spots.push({ at, r: 0.16 + hash01(i, 73) * 0.22 });
    });
    const bounce = new InstancedBufferAttribute(new Float32Array(spots.length).fill(-100), 1);
    geometry.setAttribute("aBounce", bounce);
    const material = new ShaderMaterial({
      vertexShader: DROP_VERTEX,
      fragmentShader: DROP_FRAGMENT,
      uniforms: { ...this.shared },
      toneMapped: false,
    });
    this.materials.push(material);
    const mesh = new InstancedMesh(geometry, material, spots.length);
    const m = new Matrix4();
    spots.forEach((spot, i) => {
      m.makeScale(spot.r, spot.r * 0.86, spot.r);
      m.setPosition(spot.at);
      mesh.setMatrixAt(i, m);
    });
    mesh.frustumCulled = false;
    this.drops = mesh;
    this.dropBounce = bounce;
    this.dropCount = spots.length;
    this.scene.add(mesh);
  }

  private buildShafts() {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      "aCorner",
      new BufferAttribute(new Float32Array([-0.5, -1, 0.5, -1, 0.5, 1, -0.5, 1]), 2),
    );
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const shafts = [
      [-6, 0, -20, 0.2],
      [8, 2, -40, 0.7],
      [-3, 1, -62, 0.45],
      [10, -2, -88, 0.9],
      [-10, 0, -100, 0.3],
      [2, 2, -120, 0.6],
      [-16, -4, -50, 0.8],
      [16, -2, -8, 0.15],
    ];
    const data = new Float32Array(shafts.length * 4);
    shafts.forEach((v, i) => {
      data.set(v, i * 4);
    });
    geometry.setAttribute("aShaft", new InstancedBufferAttribute(data, 4));
    geometry.instanceCount = shafts.length;
    this.geometries.push(geometry);
    const material = new ShaderMaterial({
      vertexShader: SHAFT_VERTEX,
      fragmentShader: SHAFT_FRAGMENT,
      uniforms: { ...this.shared, uShaft: { value: new Color(0xfff0b0) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(material);
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    this.scene.add(mesh);
  }

  private buildDof(fullscreen: ReturnType<typeof fullscreenGeometry>) {
    const target = new WebGLRenderTarget(2, 2, {
      type: UnsignedByteType,
      samples: this.tier === "high" ? 4 : 0,
      depthBuffer: true,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
    });
    target.texture.colorSpace = SRGBColorSpace;
    target.texture.internalFormat = "RGBA8";
    Object.assign(target, { isXRRenderTarget: true });
    target.depthTexture = new DepthTexture(2, 2, UnsignedIntType);
    this.dofTarget = target;
    this.targets.push(target);
    const pass = createScreenPass(fullscreen, DOF_FRAGMENT, {
      tColour: { value: target.texture },
      tDepth: { value: target.depthTexture },
      uTexel: { value: new Vector2(0.5, 0.5) },
      uNear: { value: 0.06 },
      uFar: { value: 900 },
      uFocus: { value: 8 },
      uAperture: { value: 10 },
      uMaxRadius: { value: 16 },
    });
    pass.mesh.renderOrder = -1000;
    this.dofMaterial = pass.material;
    this.materials.push(pass.material);
    this.dofScene.add(pass.mesh);
  }

  // ---------------------------------------------------------------- story

  course(T: number, pose: FlightPose, shot: CameraShot) {
    const walk = this.walk;
    if (!walk || !this.track) return;
    const m = this.marks;
    this.track.sample(T, shot);
    this.place(T);
    pose.position.copy(this.her);
    pose.heading.copy(this.dir);
    const speed = walk.profile(T);
    pose.velocity.copy(this.dir).multiplyScalar(speed);
    const deg = Math.PI / 180;
    const spin =
      ease01(T, m.spin - 0.15, m.spin + 0.1) * (1 - ease01(T, m.spinEnd - 0.1, m.spinEnd + 0.15));
    const under =
      ease01(T, m.under - 0.1, m.under + 0.12) *
      (1 - ease01(T, m.underEnd - 0.12, m.underEnd + 0.08));
    const looping = ease01(T, m.loop - 0.15, m.loop) * (1 - ease01(T, m.loopEnd, m.loopEnd + 0.15));
    const glide = (1 - spin) * (1 - under) * (1 - looping);
    // The spin: upright-ish, turning about her long axis, laughing.
    pose.pitch = deg * (80 - 60 * spin);
    pose.spin = spin * T * 9;
    // Under the leaf she rolls onto her back, face up to it.
    pose.roll = Math.PI * under;
    pose.yaw = 0;
    pose.bank = walk.course.bank(walk.u(T), speed / 2.4, 0.6, 0.7) * (1 - spin) * (1 - looping);
    pose.lean = 0;
    pose.sway = 0.8;
    pose.layers = [
      { clip: "fly_play_spin", weight: Math.max(1e-3, spin) },
      { clip: "fly_glide", weight: glide + under },
      { clip: "fly_superhero", weight: looping },
    ];
    pose.face = spin > 0.5 || looping > 0.5 ? "laugh" : under > 0.5 ? "big_smile" : "smile";
    pose.faceWeight = 1;
    pose.glow = 0.8;
    pose.glowColor = 0x9fdc7a;
    pose.rim = 0.8;
    pose.rimColor = 0xfff3c8;
    pose.lift = 0.06;
    pose.look = under > 0.3 ? this.lookAt.copy(this.her).addScaledVector(UP, 4) : null;
    pose.lookWeight = 0.5 * under;
    pose.nervous = 0;
    pose.visible = true;
    // Through the loop her back faces its centre, so she goes over the top upside down.
    if (looping > 0.001) {
      this.loopUp.copy(LOOP.centre).sub(this.her);
      this.loopUp.x = 0;
      this.loopUp
        .normalize()
        .lerp(UP, 1 - looping)
        .normalize();
      pose.up = this.loopUp;
    } else {
      pose.up = null;
    }
    // Focus: on her, except in the loop shot, where it racks from the drop to her. It stays on her
    // while the lens moves in behind the drop, finds the drop as the lens settles, and racks to her
    // as she enters the loop, so she is soft only while the drop holds the eye.
    const dHer = shot.position.distanceTo(this.a.copy(this.her).addScaledVector(UP, 1));
    const rack = ease01(T, m.loop + 0.12, m.loop + 0.32);
    const lockedOff =
      ease01(T, m.loop - 0.08, m.loop + 0.06) * (1 - ease01(T, m.loopEnd + 0.05, m.loopEnd + 0.25));
    const dDrop = shot.position.distanceTo(DROP.at);
    this.focus = dHer + (dDrop + (dHer - dDrop) * rack - dHer) * lockedOff;
    this.aperture = 9 + 13 * lockedOff + 4 * spin;
  }

  /** The loop's apex hangs a little; the garden breathes slower than the other worlds. */
  timeRate(T: number) {
    const m = this.marks;
    const top = (m.loop + m.loopEnd) / 2;
    const slow = ease01(T, m.loop, top) * (1 - ease01(T, top, m.loopEnd));
    return 0.9 - 0.35 * slow;
  }

  headerTone(): "light" | "dark" {
    return "light";
  }

  frame(ctx: StoryContext, f: WorldFrame) {
    const u = this.uniforms;
    u.uTime.value = f.time;
    u.uFreeze.value = f.freeze;
    u.uFlow.value = f.flow;
    const T = Math.max(0, f.T);
    (this.shared.uCamPos.value as Vector3).copy(f.camera.position);
    this.sky?.aim(f.camera);
    this.fallingLeaf(T, this.fallMatrix);
    this.place(T);
    const pointer = ctx.pointer;
    const mouse = f.view === "main" && pointer.type === "mouse" && pointer.inside;
    this.hover += ((mouse ? 1 : 0) - this.hover) * 0.12;
    this.cursor.x = pointer.ndc.x;
    this.cursor.y = pointer.ndc.y;
    this.cursor.on = f.view === "main" ? this.hover : 0;
    const leaves = this.leafMaterial;
    if (leaves) {
      (leaves.uniforms.uPointer.value as Vector3).set(this.cursor.x, this.cursor.y, this.cursor.on);
      leaves.uniforms.uAspect.value = ctx.size.aspect;
    }
    const age = f.time - this.gustTime;
    this.gust.w = f.view === "main" && age < 4 ? age : -1;
    // Pollen drifts on the garden's slow air, along the treadmill.
    this.flowOffset.set(f.flow * 0.6, f.flow * 0.25, -f.flow * 1.2);
    this.motes?.update(
      f.camera,
      this.flowOffset,
      this.cursor,
      ctx.size.height * ctx.size.dpr,
      ctx.size.aspect,
    );
    this.rig.key.position.copy(this.her).addScaledVector(SUN, 40);
    this.rig.key.target.position.copy(this.her);
    this.rig.key.target.updateMatrixWorld();
  }

  /** On the high and medium tiers, the garden through a macro lens (depth of field). */
  present(ctx: StoryContext, camera: PerspectiveCamera) {
    const scale = settingsFor(this.tier).dof;
    const target = this.dofTarget;
    const material = this.dofMaterial;
    if (scale <= 0 || !target || !material) return null;
    const { width, height, dpr } = ctx.size;
    const w = Math.max(2, Math.round(width * dpr * scale));
    const h = Math.max(2, Math.round(height * dpr * scale));
    if (target.width !== w || target.height !== h) target.setSize(w, h);
    const renderer = ctx.stage.renderer;
    this.state.save(renderer);
    const mask = camera.layers.mask;
    camera.layers.enableAll();
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x86c27a, 1);
    renderer.clear(true, true, true);
    renderer.render(this.scene, camera);
    camera.layers.mask = mask;
    this.state.restore(renderer);
    const u = material.uniforms;
    (u.uTexel.value as Vector2).set(1 / w, 1 / h);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uFocus.value = this.focus;
    // Blur in target pixels, from a 900 px tall reference frame.
    const k = h / 900;
    u.uAperture.value = this.aperture * k;
    u.uMaxRadius.value = 16 * k;
    return this.dofScene;
  }

  post(): Partial<StoryPostParams> {
    return { bloom: 0.34, bloomThreshold: 0.78, bloomRadius: 0.6, vignette: 0.36, grain: 0.12 };
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent, time: number) {
    if (event.type !== "tap") return false;
    this.ndc.set(event.ndc.x, event.ndc.y);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    // A dew drop under the tap wobbles; a gust runs through the garden from where the tap landed.
    const drops = this.drops;
    const hit = drops ? this.ray.intersectObject(drops, false).at(0) : undefined;
    const bounce = this.dropBounce;
    if (hit?.instanceId !== undefined && bounce) {
      bounce.setX(hit.instanceId, time);
      bounce.needsUpdate = true;
      this.gust.set(hit.point.x, hit.point.y, hit.point.z, 0);
      this.tapPoint = hit.point.clone();
    } else {
      const leafHit = this.leaves ? this.ray.intersectObject(this.leaves, false).at(0) : undefined;
      const p = leafHit
        ? leafHit.point
        : this.a.copy(this.ray.ray.origin).addScaledVector(this.ray.ray.direction, 12);
      this.gust.set(p.x, p.y, p.z, 0);
      this.tapPoint = p.clone();
    }
    this.gustTime = time;
    return true;
  }

  setTier(tier: StoryTier) {
    super.setTier(tier);
    const c = settingsFor(tier);
    if (this.leaves) this.leaves.count = Math.max(2, Math.round(this.leafCount * c.leaves));
    if (this.drops) this.drops.count = Math.max(1, Math.round(this.dropCount * c.drops));
    this.shared.uHazeDensity.value = c.haze;
    this.motes?.setShare(c.motes);
  }

  /** One real draw of the garden into the depth of field target (a pipeline per target format). */
  warmTargets(renderer: WebGLRenderer, camera: PerspectiveCamera) {
    const target = this.dofTarget;
    if (!target || settingsFor(this.tier).dof <= 0) return;
    this.state.save(renderer);
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(this.scene, camera);
    this.state.restore(renderer);
  }

  /** The depth of field target, for warming her pipelines on it. */
  extraTargets(): WebGLRenderTarget[] {
    return this.dofTarget && settingsFor(this.tier).dof > 0 ? [this.dofTarget] : [];
  }

  dispose() {
    this.motes?.dispose();
    this.leaves?.dispose();
    this.drops?.dispose();
    this.dofScene.clear();
    super.dispose();
  }
}
