import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  Raycaster,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  Vector4,
  type BufferGeometry,
  type IUniform,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type {
  StoryContext,
  StoryPointerEvent,
  StoryPostParams,
  StoryTier,
} from "@/components/story/engine/act";
import { hash01 } from "@/components/story/props/deck-shared";

import {
  ShotTrack,
  chaseShot,
  createSkyLayer,
  ease01,
  fullscreenGeometry,
  lin01,
  type CameraShot,
  type FlightPose,
} from "./common";
import { Course, Walk } from "./course";
import {
  DUNES_SKY,
  GROUND_FRAGMENT,
  GROUND_VERTEX,
  PRIM_COUNT,
  PRIM_FRAGMENT,
  PRIM_VERTEX,
  SHADOW_MAX,
  WIND_FRAGMENT,
  WIND_VERTEX,
} from "./dunes.glsl";
import { Motes } from "./motes";
import { World, type WorldFrame } from "./world";

/**
 * World 02, Bauhaus Dunes: "A desert where the dunes are circles and
 * triangles, and the wind is a line." She is fast now. She comes out of the
 * rift low over yellow sand, the camera rises for a drone's view of the
 * field of monuments, then tracks her from the side as she slaloms between
 * a line of giant pillars (they wipe across the lens as she weaves), banks
 * hard toward us, flies under a red arch and does her first barrel roll
 * through the great ring while time slows, then climbs toward the rift.
 *
 * Poster light: three tones of sand, two of every primitive, long hard ink
 * shadows (analytic, in the sand's shader, hers included), wind drawn as
 * lines skimming the dunes. A tap makes a monument bounce and sends a gust
 * across the sand; the cursor parts the wind.
 */

const UP = new Vector3(0, 1, 0);
const SUN = new Vector3(-0.62, 0.27, -0.74).normalize();
const WIND = new Vector3(1, 0, -0.35).normalize();

const BRAND = {
  blue: 0x3a6dc5,
  red: 0xf94141,
  yellow: 0xf7bf33,
  green: 0x0f8657,
  ink: 0x1b2040,
  white: 0xfbfaf7,
} as const;

/** The round dunes: x, z, height, radius (metres). */
const HILLS: readonly (readonly [number, number, number, number])[] = [
  [-60, -60, 9, 30],
  [70, -130, 12, 38],
  [-90, -210, 14, 45],
  [55, -285, 10, 30],
  [-40, 40, 7, 25],
  [110, -30, 9, 34],
];

/** Her slalom weave: x as a function of z (the sand's shader has the same). */
export function dunesPathX(z: number) {
  const env = smooth(-20, -40, z) * (1 - smooth(-180, -200, z));
  return 6 * Math.sin((2 * Math.PI * (z + 30)) / 60) * env;
}

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** The dune height at (x, z), the same function as `duneHeight` in GLSL. */
export function duneHeight(x: number, z: number) {
  let h =
    1.6 * Math.sin(x * 0.045 + z * 0.021) +
    1.1 * Math.sin(x * -0.028 + z * 0.052 + 1.3) +
    0.5 * Math.sin(x * 0.11 + z * 0.07 + 2.0) +
    2.2;
  for (const [cx, cz, ch, cr] of HILLS) {
    const dx = x - cx;
    const dz = z - cz;
    h += ch * Math.exp(-(dx * dx + dz * dz) / (cr * cr));
  }
  const d = Math.abs(x - dunesPathX(z));
  return h * (0.3 + 0.7 * smooth(5, 32, d));
}

type Kind = "cylinder" | "cone" | "sphere" | "ring" | "arch" | "dome" | "prism" | "cross";
type Prim = {
  kind: Kind;
  x: number;
  z: number;
  /** Height of the base over the sand (spheres: of the centre; rings: of the centre). */
  y?: number;
  r: number;
  h?: number;
  tube?: number;
  angle?: number;
  colour: number;
};

/** Shadow kind codes in the ground shader (undefined: casts none). */
function shadowKind(kind: Kind): number | undefined {
  switch (kind) {
    case "cylinder":
      return 0;
    case "cone":
      return 1;
    case "sphere":
      return 2;
    case "ring":
      return 3;
    case "arch":
      return 4;
    case "dome":
      return 5;
    default:
      return undefined;
  }
}

const RING = { z: -232, y: 10, r: 8.5, tube: 0.9 };
const ARCH = { z: -196, r: 15, thickness: 3, depth: 4 };

function primitives(): Prim[] {
  const list: Prim[] = [
    // The slalom: a line of pillars down the middle.
    { kind: "cylinder", x: 0, z: -45, r: 2.4, h: 22, colour: BRAND.blue },
    { kind: "cone", x: 0, z: -75, r: 3.4, h: 24, colour: BRAND.red },
    { kind: "cylinder", x: 0, z: -105, r: 2.4, h: 26, colour: BRAND.white },
    { kind: "cone", x: 0, z: -135, r: 3.4, h: 22, colour: BRAND.blue },
    { kind: "cylinder", x: 0, z: -165, r: 2.4, h: 24, colour: BRAND.red },
    // The arch she flies under, and the great ring.
    { kind: "arch", x: 0, z: ARCH.z, r: ARCH.r, tube: ARCH.thickness, angle: 0, colour: BRAND.red },
    {
      kind: "ring",
      x: 0,
      z: RING.z,
      y: RING.y,
      r: RING.r,
      tube: RING.tube,
      angle: 0,
      colour: BRAND.blue,
    },
    // The field: domes, cones, columns, spheres, prisms and a far ring.
    { kind: "dome", x: -48, z: -20, r: 16, colour: BRAND.white },
    { kind: "dome", x: 62, z: -92, r: 22, colour: BRAND.red },
    { kind: "dome", x: -72, z: -152, r: 18, colour: BRAND.blue },
    { kind: "dome", x: 46, z: -252, r: 20, colour: BRAND.white },
    { kind: "dome", x: -34, z: -305, r: 14, colour: BRAND.red },
    { kind: "cone", x: -34, z: -60, r: 7, h: 30, colour: BRAND.blue },
    { kind: "cone", x: 38, z: -172, r: 6, h: 26, colour: BRAND.ink },
    { kind: "cone", x: -56, z: -242, r: 9, h: 40, colour: BRAND.red },
    { kind: "cone", x: 82, z: 8, r: 8, h: 34, colour: BRAND.white },
    { kind: "cylinder", x: 30, z: -40, r: 3, h: 34, colour: BRAND.red },
    { kind: "cylinder", x: -27, z: -116, r: 2.5, h: 28, colour: BRAND.white },
    { kind: "cylinder", x: 30, z: -212, r: 3, h: 30, colour: BRAND.blue },
    { kind: "sphere", x: 42, z: -132, r: 7, colour: BRAND.blue },
    { kind: "sphere", x: -41, z: -190, r: 6, colour: BRAND.red },
    { kind: "sphere", x: -24, z: -86, r: 4, colour: BRAND.yellow },
    { kind: "prism", x: -62, z: -100, r: 10, h: 14, angle: 0.5, colour: BRAND.ink },
    { kind: "prism", x: 66, z: -222, r: 12, h: 18, angle: -0.4, colour: BRAND.white },
    { kind: "ring", x: -92, z: -64, y: 14, r: 18, tube: 2, angle: 0.6, colour: BRAND.red },
    { kind: "ring", x: 120, z: -170, y: 20, r: 24, tube: 2.4, angle: -0.9, colour: BRAND.yellow },
    // The last stretch: an avenue of cones and columns to the rift, a great dome and ring beyond.
    { kind: "cone", x: -16, z: -262, r: 4, h: 20, colour: BRAND.blue },
    { kind: "cone", x: 17, z: -278, r: 4, h: 22, colour: BRAND.red },
    { kind: "cylinder", x: -18, z: -298, r: 2.2, h: 26, colour: BRAND.white },
    { kind: "cylinder", x: 19, z: -312, r: 2.2, h: 24, colour: BRAND.blue },
    { kind: "sphere", x: -30, z: -330, r: 6, colour: BRAND.yellow },
    { kind: "cone", x: 30, z: -346, r: 7, h: 32, colour: BRAND.ink },
    { kind: "dome", x: 6, z: -470, r: 60, colour: BRAND.red },
    { kind: "ring", x: -70, z: -420, y: 30, r: 30, tube: 3, angle: 0.3, colour: BRAND.blue },
    { kind: "prism", x: 80, z: -390, r: 18, h: 26, angle: -0.2, colour: BRAND.white },
    { kind: "cylinder", x: -110, z: -360, r: 5, h: 60, colour: BRAND.red },
  ];
  // Cacti: green crosses scattered beside her course.
  for (let i = 0; i < 16; i += 1) {
    const z = 10 - i * 21 - hash01(i, 61) * 10;
    const side = i % 2 === 0 ? 1 : -1;
    const x = dunesPathX(z) + side * (11 + hash01(i, 62) * 16);
    list.push({ kind: "cross", x, z, r: 1, h: 4 + hash01(i, 63) * 2.5, colour: BRAND.green });
  }
  return list;
}

function geometryFor(kind: Kind): BufferGeometry {
  switch (kind) {
    case "cylinder": {
      const g = new CylinderGeometry(1, 1, 1, 28, 1);
      g.translate(0, 0.5, 0);
      return g;
    }
    case "cone": {
      const g = new ConeGeometry(1, 1, 28, 1);
      g.translate(0, 0.5, 0);
      return g;
    }
    case "sphere":
      return new SphereGeometry(1, 28, 18);
    case "dome":
      return new SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    case "ring":
      return new TorusGeometry(1, 0.1, 12, 72);
    case "arch": {
      // A half annulus, extruded: the outer arc over, down to the inner arc, back under.
      const outer = 1;
      const inner = 1 - ARCH.thickness / ARCH.r;
      const shape = new Shape();
      shape.moveTo(outer, 0);
      shape.absarc(0, 0, outer, 0, Math.PI, false);
      shape.lineTo(-inner, 0);
      shape.absarc(0, 0, inner, Math.PI, 0, true);
      shape.lineTo(outer, 0);
      const g = new ExtrudeGeometry(shape, {
        depth: ARCH.depth / ARCH.r,
        bevelEnabled: false,
        curveSegments: 40,
      });
      g.translate(0, 0, -ARCH.depth / ARCH.r / 2);
      return g;
    }
    case "prism": {
      const g = new CylinderGeometry(1, 1, 1, 3, 1);
      g.rotateZ(Math.PI / 2);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0.5, 0);
      return g;
    }
    case "cross": {
      const post = new BoxGeometry(0.9, 1, 0.9);
      post.translate(0, 0.5, 0);
      const bar = new BoxGeometry(2.8, 0.8, 0.8);
      bar.translate(0, 0.68, 0);
      const g = mergeGeometries([post.toNonIndexed(), bar.toNonIndexed()]);
      post.dispose();
      bar.dispose();
      return g;
    }
  }
}

function countsFor(tier: StoryTier) {
  return tier === "low"
    ? { grid: 96, wind: 18, motes: 0.35, casters: 14, haze: 0.0042 }
    : tier === "medium"
      ? { grid: 140, wind: 30, motes: 0.65, casters: 20, haze: 0.0036 }
      : { grid: 180, wind: 44, motes: 1, casters: 24, haze: 0.0032 };
}

const WIND_MAX = 44;
/** Room for every monument's bounce clock in the shader. */
const PRIM_MAX = PRIM_COUNT;
const WIND_SEGMENTS = 18;
const GROUND_SIZE = 720;

export class DunesWorld extends World {
  readonly id = "dunes" as const;
  readonly key = 0xf94141;
  private ground: Mesh | null = null;
  private groundMaterial: ShaderMaterial | null = null;
  private groundGeometries = new Map<number, PlaneGeometry>();
  private primMaterial: ShaderMaterial | null = null;
  private primMesh: Mesh | null = null;
  /** When each monument was last tapped (life seconds), by its index in `primitives()`. */
  private readonly bounces = new Float32Array(PRIM_MAX).fill(-100);
  private windMesh: Mesh | null = null;
  private windMaterial: ShaderMaterial | null = null;
  private sky: ReturnType<typeof createSkyLayer> | null = null;
  private motes: Motes | null = null;
  private walk: Walk | null = null;
  private track: ShotTrack | null = null;
  private readonly casters: Vector4[] = [];
  private readonly casterDims: Vector4[] = [];
  private readonly shadowList: { base: Vector4; dims: Vector4; near: number }[] = [];
  private readonly shared: Record<string, IUniform>;
  private readonly hills = HILLS.map(([x, z, h, r]) => new Vector4(x, z, h, r));
  private readonly her = new Vector3();
  private readonly dir = new Vector3();
  private readonly right = new Vector3();
  private readonly flat = new Vector3();
  private readonly a = new Vector3();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly cursor = { x: 0, y: 0, on: 0 };
  private readonly pointerGround = new Vector3();
  private readonly gust = new Vector4(0, 0, 0, -1);
  private gustTime = -100;
  private hover = 0;
  private readonly flowOffset = new Vector3();
  /** Course times of her landmarks (found on the walk). */
  private readonly marks = { slalom: 1.4, slalomEnd: 3.3, arch: 3.4, ring: 4.0 };

  constructor(readonly length: number) {
    super();
    this.shared = {
      uTime: this.uniforms.uTime,
      uFlow: this.uniforms.uFlow,
      uFreeze: this.uniforms.uFreeze,
      uCamPos: { value: new Vector3() },
      uSun: { value: SUN.clone() },
      uHaze: { value: new Color(0xfbe9c4) },
      uHazeDensity: { value: 0.0032 },
      uInk: { value: new Color(0x2d318a) },
      uHills: { value: this.hills },
    };
  }

  async build(ctx: StoryContext) {
    this.tier = ctx.tier;
    this.setBackground(0xfbe9c4);
    this.setFrames(
      new Vector3(0, 5.5, 60),
      new Vector3(0, 0, -1),
      new Vector3(0, 11, -330),
      new Vector3(0, 0, -1),
    );
    this.buildCourse();
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);
    this.sky = createSkyLayer(fullscreen, DUNES_SKY, {
      uZenith: { value: new Color(0x2f5fb8) },
      uSkyMid: { value: new Color(0x8fb6ea) },
      uHaze: this.shared.uHaze,
      uSunColour: { value: new Color(0xfff6dc) },
      uSun: this.shared.uSun,
      uTime: this.uniforms.uTime,
      uFreeze: this.uniforms.uFreeze,
    });
    this.materials.push(this.sky.material);
    this.scene.add(this.sky.mesh);
    this.buildGround();
    await Promise.resolve();
    this.buildPrimitives();
    this.buildWind();
    this.motes = new Motes(
      {
        max: 360,
        box: new Vector3(30, 10, 40),
        ahead: 12,
        size: [0.03, 0.07],
        colours: [0xf7bf33, 0xfef6e0, 0xe2a43a, 0xf94141],
        additive: false,
        shape: 2,
        drift: 0.5,
        opacity: 0.85,
      },
      this.uniforms.uFreeze,
      this.uniforms.uTime,
    );
    this.scene.add(this.motes.points);
    this.setTier(ctx.tier);

    // Her light: the low sun, a blue sky above and the sand's warm bounce below.
    this.rig.hemi.color.setHex(0xa8c6f0);
    this.rig.hemi.groundColor.setHex(0xf2c25a);
    this.rig.hemi.intensity = 1.15;
    this.rig.key.color.setHex(0xfff2dc);
    this.rig.key.intensity = 2.5;
  }

  // ---------------------------------------------------------------- course

  private buildCourse() {
    const start = this.fromEntry(0, -0.5, -40);
    const points = [start, new Vector3(0, 4.2, 2), new Vector3(0, 3.4, -20)];
    for (let z = -30; z >= -186; z -= 7.5) {
      points.push(new Vector3(dunesPathX(z), 3.2 + 0.5 * Math.sin(z * 0.11), z));
    }
    points.push(
      new Vector3(0, 4.6, ARCH.z),
      new Vector3(0, 7.6, -216),
      new Vector3(0, RING.y, RING.z),
      new Vector3(0, 10.4, -252),
      new Vector3(0, 10.2, -290),
      this.fromExit(0, -1.3, 3.4),
    );
    const course = new Course(points);
    this.walk = new Walk(course, this.length, (T) => {
      if (T < 0.5) return 53 + (44 - 53) * ease01(T, 0, 0.5);
      if (T < 3.7) return 44 + 6 * ease01(T, 0.6, 1.4);
      if (T < 4.3) return 50 - 14 * ease01(T, 3.7, 4.0) + 8 * ease01(T, 4.05, 4.3);
      return 44 + (6 - 44) * ease01(T, 4.6, this.length);
    });
    // Landmarks: when does she reach the slalom, the arch and the ring?
    const find = (z: number) => {
      for (let i = 0; i <= 800; i += 1) {
        const T = (i / 800) * this.length;
        course.at(this.walk?.u(T) ?? 0, this.a);
        if (this.a.z <= z) return T;
      }
      return this.length;
    };
    this.marks.slalom = find(-36);
    this.marks.slalomEnd = find(-176);
    this.marks.arch = find(ARCH.z);
    this.marks.ring = find(RING.z);
    this.track = this.shots();
  }

  private place(T: number) {
    const walk = this.walk;
    if (!walk) return;
    const u = walk.u(T);
    walk.course.at(u, this.her);
    walk.course.tangent(u, this.dir);
    this.right.crossVectors(this.dir, UP).normalize();
    this.flat.set(this.dir.x, 0, this.dir.z).normalize();
  }

  private shots(): ShotTrack {
    const her = this.her;
    const dir = this.dir;
    const right = this.right;
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
          out.shake = 0.002;
          out.look = 0.03;
          out.roll = 0;
        },
      },
      {
        // The drone: high and wide off her left, the field of monuments ahead in the low sun.
        at: 0.68,
        blend: 0.5,
        shot: (T, out) => {
          at(T);
          const rise = ease01(T, 0.3, 1.3);
          out.position
            .copy(her)
            .addScaledVector(right, -12 - 6 * rise)
            .addScaledVector(UP, 6 + 10 * rise)
            .addScaledVector(flat, -16);
          out.target.copy(her).addScaledVector(flat, 36).addScaledVector(UP, 2);
          out.fov = 52;
          out.roll = 0.03;
          out.shake = 0.0015;
          out.look = 0.05;
        },
      },
      {
        // The slalom: tracking alongside on her right, low; the pillars wipe across the lens.
        at: m.slalom + 0.12,
        blend: 0.42,
        shot: (T, out) => {
          at(T);
          out.position.set(her.x + 9.5, her.y + 0.9, her.z + 1.5);
          out.target.set(her.x * 0.85, her.y + 0.9, her.z - 4);
          out.fov = 46;
          out.roll = 0.02 * Math.sin(T * 6);
          out.shake = 0.003;
          out.look = 0.03;
        },
      },
      {
        // She banks hard toward us: a low leading shot, ahead and to her left.
        at: (m.slalom + m.slalomEnd) / 2 + 0.35,
        blend: 0.38,
        pivot,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(flat, 7.5)
            .addScaledVector(right, -3.2)
            .addScaledVector(UP, 0.4);
          out.target.copy(her).addScaledVector(UP, 1.05);
          out.fov = 40;
          out.roll = -0.04;
          out.shake = 0.002;
          out.look = 0.04;
        },
      },
      {
        // Under the arch, the ring framed ahead.
        at: m.arch - 0.25,
        blend: 0.32,
        pivot,
        shot: (T, out) => {
          at(T);
          out.position.copy(her).addScaledVector(flat, -8).addScaledVector(UP, 1.6);
          out.target.copy(her).addScaledVector(flat, 14).addScaledVector(UP, 1.6);
          out.fov = 56;
          out.roll = 0;
          out.shake = 0.002;
          out.look = 0.03;
        },
      },
      {
        // Through the ring with her: close behind, the camera leaning into her roll.
        at: m.ring - 0.16,
        blend: 0.22,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(flat, -5)
            .addScaledVector(UP, 0.9)
            .addScaledVector(right, 1.4);
          out.target.copy(her).addScaledVector(flat, 6).addScaledVector(UP, 1);
          out.fov = 60;
          const k = lin01(T, m.ring - 0.24, m.ring + 0.24);
          out.roll = -0.5 * Math.sin(Math.PI * k);
          out.shake = 0;
          out.look = 0.02;
        },
      },
      {
        // Out of the ring: the camera rises behind her, the dunes rolling to the horizon.
        at: m.ring + 0.42,
        blend: 0.4,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(flat, -9)
            .addScaledVector(UP, 2.4)
            .addScaledVector(right, -2.5);
          out.target.copy(her).addScaledVector(flat, 18).addScaledVector(UP, 1.6);
          out.fov = 50;
          out.roll = 0.02;
          out.shake = 0.001;
          out.look = 0.04;
        },
      },
      {
        at: 5.05,
        blend: 0.32,
        pivot,
        shot: (T, out) => {
          at(T);
          chaseShot(out, her, dir, 8, 1.4, 8, 50);
          out.roll = 0;
          out.shake = 0.002;
          out.look = 0.03;
        },
      },
    ]);
  }

  // ---------------------------------------------------------------- geometry

  private groundGeometry(segments: number) {
    let g = this.groundGeometries.get(segments);
    if (!g) {
      g = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE, segments, segments);
      g.rotateX(-Math.PI / 2);
      this.groundGeometries.set(segments, g);
      this.geometries.push(g);
    }
    return g;
  }

  private buildGround() {
    this.groundMaterial = new ShaderMaterial({
      vertexShader: GROUND_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
      uniforms: {
        ...this.shared,
        uOrigin: { value: new Vector3() },
        uCream: { value: new Color(0xfde6b0) },
        uSand: { value: new Color(0xf7bf33) },
        uOchre: { value: new Color(0xd98c2b) },
        uCasters: { value: this.casters },
        uCasterDims: { value: this.casterDims },
        uCasterCount: { value: 0 },
        uGust: { value: this.gust },
        uPointerGround: { value: this.pointerGround },
      },
      toneMapped: false,
    });
    this.materials.push(this.groundMaterial);
    this.ground = new Mesh(this.groundGeometry(countsFor(this.tier).grid), this.groundMaterial);
    this.ground.frustumCulled = false;
    this.ground.renderOrder = -10;
    this.scene.add(this.ground);
  }

  private buildPrimitives() {
    const all = primitives();
    this.primMaterial = new ShaderMaterial({
      vertexShader: PRIM_VERTEX,
      fragmentShader: PRIM_FRAGMENT,
      uniforms: {
        ...this.shared,
        uSkyFill: { value: new Color(0xa8c6f0) },
        uBounce: { value: this.bounces },
      },
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.primMaterial);
    // Every monument baked into one static geometry (one draw call); each vertex knows its
    // monument (for the bounce and for taps) and the point it squashes about.
    const m = new Matrix4();
    const q = new Quaternion();
    const sc = new Vector3();
    const p = new Vector3();
    const colour = new Color();
    const parts: BufferGeometry[] = [];
    const shapes = new Map<Kind, BufferGeometry>();
    all.forEach((prim, id) => {
      const kind = prim.kind;
      let shape = shapes.get(kind);
      if (!shape) {
        const made = geometryFor(kind);
        shape = made.index ? made.toNonIndexed() : made;
        if (shape !== made) made.dispose();
        shape.deleteAttribute("uv");
        shapes.set(kind, shape);
      }
      const ground = duneHeight(prim.x, prim.z);
      q.identity();
      sc.set(prim.r, prim.h ?? prim.r, prim.r);
      p.set(prim.x, ground - 0.4, prim.z);
      if (kind === "sphere") p.y = ground + prim.r * 0.82;
      if (kind === "dome") p.y = ground - prim.r * 0.25;
      if (kind === "ring") {
        sc.set(prim.r, prim.r, prim.r);
        p.y = prim.y ?? prim.r;
        q.setFromAxisAngle(UP, prim.angle ?? 0);
      }
      if (kind === "arch") {
        sc.set(prim.r, prim.r, prim.r);
        p.y = Math.min(ground, 1.2) - 0.5;
        q.setFromAxisAngle(UP, prim.angle ?? 0);
      }
      if (kind === "prism") {
        sc.set(prim.r, prim.h ?? prim.r, prim.r * 2.2);
        q.setFromAxisAngle(UP, prim.angle ?? 0);
      }
      if (kind === "cross") sc.set(1, prim.h ?? 4, 1);
      m.compose(p, q, sc);
      const part = shape.clone();
      part.applyMatrix4(m);
      const n = part.getAttribute("position").count;
      colour.setHex(prim.colour);
      const colours = new Float32Array(n * 3);
      const pivots = new Float32Array(n * 3);
      const ids = new Float32Array(n);
      // Spheres and rings squash about their centre, everything else about its foot.
      const pivotY = kind === "sphere" || kind === "ring" ? p.y : ground;
      for (let i = 0; i < n; i += 1) {
        colours.set([colour.r, colour.g, colour.b], i * 3);
        pivots.set([p.x, pivotY, p.z], i * 3);
      }
      ids.fill(id);
      part.setAttribute("aColour", new BufferAttribute(colours, 3));
      part.setAttribute("aPivot", new BufferAttribute(pivots, 3));
      part.setAttribute("aPrim", new BufferAttribute(ids, 1));
      parts.push(part);
      // Its shadow on the sand.
      const shadow = shadowKind(kind);
      if (shadow !== undefined) {
        const base = new Vector4(p.x, p.y, p.z, shadow);
        const dims =
          kind === "ring"
            ? new Vector4(prim.r, prim.tube ?? prim.r * 0.1, prim.angle ?? 0, 0)
            : kind === "arch"
              ? new Vector4(prim.r - ARCH.thickness / 2, ARCH.thickness / 2, prim.angle ?? 0, 0)
              : kind === "sphere" || kind === "dome"
                ? new Vector4(prim.r, 0, 0, 0)
                : new Vector4(prim.r, prim.h ?? prim.r, 0, 0);
        this.shadowList.push({ base, dims, near: Math.abs(p.x - dunesPathX(p.z)) });
      }
    });
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    for (const shape of shapes.values()) shape.dispose();
    this.geometries.push(merged);
    merged.computeBoundingSphere();
    this.primMesh = new Mesh(merged, this.primMaterial);
    this.primMesh.frustumCulled = false;
    this.scene.add(this.primMesh);
    // Her two shadow spheres first (filled every frame), then the monuments nearest her course.
    this.casters.push(new Vector4(0, -100, 0, 2), new Vector4(0, -100, 0, 2));
    this.casterDims.push(new Vector4(0.36, 0, 0, 0), new Vector4(0.36, 0, 0, 0));
    this.shadowList.sort((x, y) => x.near - y.near);
    for (const item of this.shadowList.slice(0, SHADOW_MAX - 2)) {
      this.casters.push(item.base);
      this.casterDims.push(item.dims);
    }
  }

  private buildWind() {
    const geometry = new InstancedBufferGeometry();
    const us: number[] = [];
    const sides: number[] = [];
    const index: number[] = [];
    for (let i = 0; i <= WIND_SEGMENTS; i += 1) {
      for (const side of [-1, 1]) {
        us.push(i / WIND_SEGMENTS);
        sides.push(side);
      }
      if (i < WIND_SEGMENTS) {
        const a = i * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geometry.setAttribute("aU", new BufferAttribute(new Float32Array(us), 1));
    geometry.setAttribute("aSide", new BufferAttribute(new Float32Array(sides), 1));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(us.length * 3), 3));
    geometry.setIndex(index);
    const seeds = new Float32Array(WIND_MAX * 4);
    for (let i = 0; i < WIND_MAX; i += 1) {
      seeds.set([hash01(i, 81), hash01(i, 82), hash01(i, 83), hash01(i, 84)], i * 4);
    }
    geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = WIND_MAX;
    this.geometries.push(geometry);
    this.windMaterial = new ShaderMaterial({
      vertexShader: WIND_VERTEX,
      fragmentShader: WIND_FRAGMENT,
      uniforms: {
        ...this.shared,
        uCentre: { value: new Vector3() },
        uBox: { value: new Vector3(90, 10, 60) },
        uWind: { value: WIND.clone() },
        uPointer: { value: new Vector3() },
        uAspect: { value: 1 },
        uGust: { value: this.gust },
      },
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      premultipliedAlpha: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.windMaterial);
    this.windMesh = new Mesh(geometry, this.windMaterial);
    this.windMesh.frustumCulled = false;
    this.windMesh.renderOrder = 15;
    this.scene.add(this.windMesh);
  }

  // ---------------------------------------------------------------- story

  course(T: number, pose: FlightPose, shot: CameraShot, time: number) {
    const walk = this.walk;
    if (!walk || !this.track) return;
    const m = this.marks;
    this.track.sample(T, shot);
    this.place(T);
    pose.position.copy(this.her);
    pose.heading.copy(this.dir);
    const speed = walk.profile(T);
    pose.velocity.copy(this.dir).multiplyScalar(speed);
    const u = walk.u(T);
    const deg = Math.PI / 180;
    const rollP = lin01(T, m.ring - 0.24, m.ring + 0.24);
    const rolling = rollP > 0 && rollP < 1 ? 1 : 0;
    const tuck =
      ease01(T, m.ring - 0.3, m.ring - 0.2) * (1 - ease01(T, m.ring + 0.2, m.ring + 0.3));
    const slalom =
      ease01(T, m.slalom - 0.25, m.slalom) * (1 - ease01(T, m.slalomEnd, m.slalomEnd + 0.3));
    const cruise = 1 - slalom;
    pose.pitch = deg * 80;
    pose.roll = rolling * ease01(rollP, 0.13, 0.8) * Math.PI * 2;
    pose.yaw = 0;
    pose.spin = 0;
    // Banking into the weave: up to 45 degrees, physics plus style.
    pose.bank = walk.course.bank(u, speed / 2.6, 0.75, 0.8) + 0.05 * Math.sin(time * 1.8) * cruise;
    pose.lean = 0;
    pose.sway = 1;
    // fly_slalom's phase follows the weave (0.25 hardest left, 0.75 hardest right).
    const phase = ((((-this.her.z - 30) / 60 + 0.5) % 1) + 1) % 1;
    pose.layers = [
      {
        clip: "fly_slalom",
        weight: Math.max(1e-3, (slalom + 0.25 * cruise) * (1 - tuck)),
        progress: phase,
      },
      { clip: "fly_superhero", weight: cruise * 0.75 * (1 - tuck) },
      { clip: "barrel_tuck", weight: tuck, progress: rollP },
    ];
    pose.face = tuck > 0.5 ? "auto" : T > m.ring + 0.3 ? "big_smile" : "determined";
    pose.faceWeight = 1;
    pose.glow = 0.8;
    pose.glowColor = 0xf94141;
    pose.rim = 0.9;
    pose.rimColor = 0xfff2dc;
    pose.lift = 0.05;
    pose.look = null;
    pose.lookWeight = 0;
    pose.nervous = 0;
    pose.visible = true;
  }

  /** Through the ring, time slows (her first barrel roll, seen properly). */
  timeRate(T: number) {
    const c = this.marks.ring;
    const slow = ease01(T, c - 0.24, c - 0.06) * (1 - ease01(T, c + 0.06, c + 0.26));
    return 1 - 0.65 * slow;
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
    this.place(T);
    // The ground follows the camera in whole cells (so it never swims).
    const ground = this.ground;
    const material = this.groundMaterial;
    if (ground && material) {
      const segments = countsFor(this.tier).grid;
      const cell = GROUND_SIZE / segments;
      f.camera.getWorldDirection(this.a);
      const cx = f.camera.position.x + this.a.x * GROUND_SIZE * 0.32;
      const cz = f.camera.position.z + this.a.z * GROUND_SIZE * 0.32;
      (material.uniforms.uOrigin.value as Vector3).set(
        Math.round(cx / cell) * cell,
        0,
        Math.round(cz / cell) * cell,
      );
      // Her shadow: two spheres along her body.
      const head = this.casters.at(0);
      const feet = this.casters.at(1);
      if (head && feet) {
        this.a.copy(this.her).addScaledVector(UP, 1).addScaledVector(this.dir, 0.5);
        head.set(this.a.x, this.a.y, this.a.z, 2);
        this.a.copy(this.her).addScaledVector(UP, 1).addScaledVector(this.dir, -0.45);
        feet.set(this.a.x, this.a.y, this.a.z, 2);
      }
      // The cursor's spot on the sand and a tap's gust.
      const pointer = ctx.pointer;
      const mouse = f.view === "main" && pointer.type === "mouse" && pointer.inside;
      this.hover += ((mouse ? 1 : 0) - this.hover) * 0.12;
      if (mouse) {
        this.ndc.set(pointer.ndc.x, pointer.ndc.y);
        this.ray.setFromCamera(this.ndc, f.camera);
        const r = this.ray.ray;
        if (r.direction.y < -0.01) {
          const t = (3 - r.origin.y) / r.direction.y;
          this.pointerGround.set(
            r.origin.x + r.direction.x * t,
            r.origin.z + r.direction.z * t,
            this.hover,
          );
        }
      }
      this.pointerGround.z = f.view === "main" ? this.hover : 0;
      const age = f.time - this.gustTime;
      this.gust.w = f.view === "main" && age < 5 ? age : -1;
      this.cursor.x = pointer.ndc.x;
      this.cursor.y = pointer.ndc.y;
      this.cursor.on = f.view === "main" ? this.hover : 0;
    }
    const wind = this.windMaterial;
    if (wind) {
      f.camera.getWorldDirection(this.a);
      (wind.uniforms.uCentre.value as Vector3)
        .copy(f.camera.position)
        .addScaledVector(this.a, 26)
        .setY(0);
      (wind.uniforms.uPointer.value as Vector3).set(this.cursor.x, this.cursor.y, this.cursor.on);
      wind.uniforms.uAspect.value = ctx.size.aspect;
    }
    this.flowOffset.copy(WIND).multiplyScalar(f.flow * 5);
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

  post(): Partial<StoryPostParams> {
    return { bloom: 0.22, bloomThreshold: 0.84, bloomRadius: 0.5, vignette: 0.3, grain: 0.13 };
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent, time: number) {
    if (event.type !== "tap") return false;
    this.ndc.set(event.ndc.x, event.ndc.y);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    // A monument under the tap bounces; the gust starts where it stands (or where the tap meets the sand).
    const hit = this.primMesh ? this.ray.intersectObject(this.primMesh, false).at(0) : undefined;
    const ids = this.primMesh?.geometry.getAttribute("aPrim");
    const id = hit?.face && ids ? Math.round(ids.getX(hit.face.a)) : -1;
    const r = this.ray.ray;
    if (hit && id >= 0 && id < PRIM_MAX) {
      this.bounces.set([time], id);
      this.gust.set(hit.point.x, hit.point.z, 0, 0);
    } else if (r.direction.y < -0.01) {
      const t = (3 - r.origin.y) / r.direction.y;
      this.gust.set(r.origin.x + r.direction.x * t, r.origin.z + r.direction.z * t, 0, 0);
    } else {
      this.gust.set(r.origin.x + r.direction.x * 40, r.origin.z + r.direction.z * 40, 0, 0);
    }
    this.gustTime = time;
    return true;
  }

  setTier(tier: StoryTier) {
    super.setTier(tier);
    const c = countsFor(tier);
    if (this.ground) this.ground.geometry = this.groundGeometry(c.grid);
    if (this.windMesh) (this.windMesh.geometry as InstancedBufferGeometry).instanceCount = c.wind;
    this.shared.uHazeDensity.value = c.haze;
    if (this.groundMaterial) {
      this.groundMaterial.uniforms.uCasterCount.value = Math.min(
        this.casters.length,
        2 + c.casters,
      );
    }
    this.motes?.setShare(c.motes);
  }

  dispose() {
    this.motes?.dispose();
    super.dispose();
  }
}
