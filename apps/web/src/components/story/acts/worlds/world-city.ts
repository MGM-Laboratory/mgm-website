import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Points,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type IUniform,
} from "three";

import type {
  StoryContext,
  StoryPointerEvent,
  StoryPostParams,
  StoryTier,
} from "@/components/story/engine/act";
import { hash01 } from "@/components/story/props/deck-shared";

import {
  PATH_SAMPLES,
  BEAM_FRAGMENT,
  BEAM_VERTEX,
  CITY_SKY,
  GROUND_FRAGMENT,
  GROUND_VERTEX,
  RIBBON_FRAGMENT,
  RIBBON_VERTEX,
  SPARK_FRAGMENT,
  SPARK_VERTEX,
  TOWER_FRAGMENT,
  TOWER_VERTEX,
  TRAFFIC_FRAGMENT,
  TRAFFIC_VERTEX,
} from "./city.glsl";
import {
  ShotTrack,
  chaseShot,
  createShot,
  createSkyLayer,
  ease01,
  fullscreenGeometry,
  lin01,
  type CameraShot,
  type FlightPose,
} from "./common";
import { Course, Walk } from "./course";
import { Motes } from "./motes";
import { World, type WorldFrame } from "./world";

/**
 * World 03, Signal City: "A night city made of light, where every window is
 * somebody's idea." The action world. She bursts out of the rift high over
 * a glittering grid, dives into an avenue (a Dutch-angle chase between the
 * towers, traffic streaming under her), whips round a corner, skims a
 * facade close enough to strike sparks, climbs, and rolls over the top of
 * a tower while time slows to a quarter, then glides out over the skyline,
 * superhero style, toward the next rift. Every room she passes lights up.
 *
 * Cheap by construction: the towers are one instanced box with procedural
 * windows, the traffic, the ribbons, the beams and the sparks are one draw
 * each, nothing is lit by real lights except her, and fog hides the end of
 * the city. The tier only changes counts and the fog.
 */

const UP = new Vector3(0, 1, 0);
const GRID = 18;
const SPAN: Readonly<{ x: readonly [number, number]; z: readonly [number, number] }> = {
  x: [-210, 300],
  z: [-420, 70],
};
/** The facade she skims: a long slab beside the cross street. */
const SKIM = { x0: 30, x1: 96, zFace: -139.6, depth: 14, height: 64 };
const SKIM_PATH_Z = -137.8;

/** Course marks (course time, vh). */
const M = {
  dive: 1.35,
  avenue: 1.9,
  turn: 2.5,
  skim: 2.78,
  climb: 3.32,
  roll: 3.72,
  rollEnd: 4.2,
  glide: 4.32,
} as const;

function countsFor(tier: StoryTier) {
  return tier === "low"
    ? { towers: 0.6, traffic: 220, fog: 0.0058, motes: 0.35, sparks: 50 }
    : tier === "medium"
      ? { towers: 0.82, traffic: 420, fog: 0.0042, motes: 0.65, sparks: 90 }
      : { towers: 1, traffic: 640, fog: 0.0034, motes: 1, sparks: 140 };
}

const TRAFFIC_MAX = 640;
const SPARK_MAX = 140;

export class CityWorld extends World {
  readonly id = "city" as const;
  readonly key = 0x3a6dc5;
  private towers: InstancedMesh | null = null;
  private towerMaterial: ShaderMaterial | null = null;
  private towerCount = 0;
  private traffic: Mesh | null = null;
  private trafficMaterial: ShaderMaterial | null = null;
  private ribbonMaterial: ShaderMaterial | null = null;
  private beamMaterial: ShaderMaterial | null = null;
  private groundMaterial: ShaderMaterial | null = null;
  private sparks: Points | null = null;
  private sparkMaterial: ShaderMaterial | null = null;
  private sky: ReturnType<typeof createSkyLayer> | null = null;
  private motes: Motes | null = null;
  private walk: Walk | null = null;
  private track: ShotTrack | null = null;
  private readonly shared: Record<string, IUniform>;
  private readonly path: Vector4[] = [];
  private readonly her = new Vector3();
  private readonly dir = new Vector3();
  private readonly right = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly flowOffset = new Vector3();
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly cursor = { x: 0, y: 0, on: 0 };
  private hover = 0;
  private tapTime = -100;
  private readonly tapAt = new Vector3();

  constructor(readonly length: number) {
    super();
    this.shared = {
      uTime: this.uniforms.uTime,
      uFreeze: this.uniforms.uFreeze,
      uFlow: this.uniforms.uFlow,
      uCamPos: { value: new Vector3() },
      uFog: { value: new Color(0x121741) },
      uFogDensity: { value: 0.0034 },
      uWarm: { value: new Color(0xf7bf33) },
      uCool: { value: new Color(0x5b8fe8) },
      uRed: { value: new Color(0xf94141) },
      uFrame: { value: new Color(0x10131c) },
      uSkyLow: { value: new Color(0x2d318a) },
    };
  }

  async build(ctx: StoryContext) {
    this.tier = ctx.tier;
    this.setBackground(0x0b0f24);
    // She arrives high over the city, heading in; the rift at the end opens over the skyline.
    this.setFrames(
      new Vector3(0, 74, 60),
      new Vector3(0, -0.12, -1),
      new Vector3(168, 88, -170),
      new Vector3(0.45, 0, -0.89),
    );
    this.buildCourse();
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);
    this.sky = createSkyLayer(fullscreen, CITY_SKY, {
      uZenith: { value: new Color(0x05060c) },
      uHorizon: { value: new Color(0x141a46) },
      uGlow: { value: new Color(0x3a6dc5) },
      uGlowRed: { value: new Color(0xf94141) },
      uFreeze: this.uniforms.uFreeze,
      uTime: this.uniforms.uTime,
      uFarFog: { value: new Color(0x121741) },
      uFarWarm: { value: new Color(0xf7bf33) },
    });
    this.materials.push(this.sky.material);
    this.scene.add(this.sky.mesh);
    this.buildGround();
    this.buildTowers();
    await Promise.resolve();
    this.buildTraffic();
    this.buildRibbons();
    this.buildBeams();
    this.buildSparks();
    this.motes = new Motes(
      {
        max: 420,
        box: new Vector3(30, 18, 50),
        ahead: 14,
        size: [0.03, 0.08],
        colours: [0xffffff, 0x5b8fe8, 0xf7bf33, 0xf94141],
        additive: true,
        shape: 1,
        drift: 0.4,
        opacity: 0.7,
      },
      this.uniforms.uFreeze,
      this.uniforms.uTime,
    );
    this.scene.add(this.motes.points);
    this.setTier(ctx.tier);

    // Her light: the city's glow from below, a cool moonless sky, a key from the rooftops.
    this.rig.hemi.color.setHex(0x8090c8);
    this.rig.hemi.groundColor.setHex(0x6a4428);
    this.rig.hemi.intensity = 1.05;
    this.rig.key.color.setHex(0xfff1e2);
    this.rig.key.intensity = 2.1;
  }

  // ---------------------------------------------------------------- course

  private buildCourse() {
    const start = this.fromEntry(0, -0.5, -40);
    const points = [
      start,
      new Vector3(0, 60, -6),
      new Vector3(-2, 38, -38),
      new Vector3(-1, 16, -66),
      new Vector3(1.5, 9, -92),
      new Vector3(2.5, 8.5, -112),
      new Vector3(9, 8.5, -129),
      new Vector3(24, 9, SKIM_PATH_Z),
      new Vector3(48, 9.5, SKIM_PATH_Z),
      new Vector3(74, 10.5, SKIM_PATH_Z),
      new Vector3(96, 18, -136.5),
      new Vector3(110, 42, -134),
      new Vector3(120, 66, -131),
      new Vector3(134, 80, -130),
      new Vector3(152, 85, -143),
      this.fromExit(0, -1.3, 3.4),
    ];
    const course = new Course(points);
    this.walk = new Walk(course, this.length, (T) => {
      if (T < 0.5) return 53 + (40 - 53) * ease01(T, 0, 0.5);
      if (T < M.dive) return 40 + 10 * ease01(T, 0.9, M.dive);
      if (T < M.climb)
        return 50 + 28 * ease01(T, M.dive, M.avenue) - 8 * ease01(T, M.turn - 0.1, M.turn + 0.2);
      if (T < M.rollEnd) return 70 - 34 * ease01(T, M.climb, M.roll + 0.15);
      return 36 + (6 - 36) * ease01(T, M.glide + 0.4, this.length);
    });
    for (let k = 0; k < PATH_SAMPLES; k += 1) {
      const T = (k / (PATH_SAMPLES - 1)) * this.length;
      course.at(this.walk.u(T), this.a);
      this.path.push(new Vector4(this.a.x, this.a.y, this.a.z, T));
    }
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
  }

  private shots(): ShotTrack {
    const her = this.her;
    const dir = this.dir;
    const right = this.right;
    const a = this.a;
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
          out.shake = 0.002;
          out.look = 0.03;
          out.roll = 0;
        },
      },
      {
        // Establishing: a wide aerial off her left, the whole glittering grid under her.
        at: 0.62,
        blend: 0.5,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(right, -24)
            .addScaledVector(UP, 9)
            .addScaledVector(dir, -14);
          out.target.copy(her).addScaledVector(dir, 34).addScaledVector(UP, -22);
          out.fov = 56;
          out.roll = 0.06;
          out.shake = 0.002;
          out.look = 0.05;
        },
      },
      {
        // The dive: steep behind her, a Dutch tilt, the avenue opening below.
        at: M.dive + 0.1,
        blend: 0.32,
        shot: (T, out) => {
          at(T);
          // Level behind her (not along her steep heading), so the lens rides down with her.
          this.b.set(dir.x, 0, dir.z).normalize();
          out.position
            .copy(her)
            .addScaledVector(this.b, -4.6)
            .addScaledVector(UP, 2.4)
            .addScaledVector(right, 0.8);
          out.target.copy(her).addScaledVector(dir, 12).addScaledVector(UP, 0.4);
          out.fov = 66;
          out.roll = 0.2;
          out.shake = 0.006;
          out.look = 0.03;
        },
      },
      {
        // The avenue: low behind her, Dutch angle the other way, the towers rushing by.
        at: M.avenue + 0.12,
        blend: 0.3,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(dir, -4.2)
            .addScaledVector(UP, 1.3)
            .addScaledVector(right, 1.1);
          out.target.copy(her).addScaledVector(dir, 16).addScaledVector(UP, 0.9);
          out.fov = 70;
          out.roll = -0.24 + 0.05 * Math.sin(T * 9);
          out.shake = 0.007;
          out.look = 0.03;
        },
      },
      {
        // The corner: a whip pan out to the side of the turn (blurred by the speed, sold by the roll).
        at: M.turn + 0.14,
        blend: 0.12,
        pivot: (T, out) => {
          at(T);
          return out.copy(her).addScaledVector(UP, 1);
        },
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(right, -5.5)
            .addScaledVector(UP, 1.4)
            .addScaledVector(dir, -1.5);
          out.target.copy(her).addScaledVector(dir, 6).addScaledVector(UP, 0.9);
          out.fov = 58;
          out.roll = 0.16;
          out.shake = 0.005;
          out.look = 0.03;
        },
      },
      {
        // The skim: from the street side, the facade and its windows streaming past behind her.
        at: M.skim + 0.14,
        blend: 0.22,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(right, 4.6)
            .addScaledVector(UP, 0.7)
            .addScaledVector(dir, -3.2);
          out.target
            .copy(her)
            .addScaledVector(dir, 4.5)
            .addScaledVector(UP, 1.1)
            .addScaledVector(right, -0.5);
          out.fov = 52;
          out.roll = 0.12;
          out.shake = 0.004;
          out.look = 0.03;
        },
      },
      {
        // The climb: from above and ahead, she rises toward us out of the lit city.
        at: M.climb + 0.1,
        blend: 0.28,
        pivot: (T, out) => {
          at(T);
          return out.copy(her).addScaledVector(UP, 1);
        },
        shot: (T, out) => {
          at(T);
          this.b.set(dir.x, 0, dir.z).normalize();
          out.position
            .copy(her)
            .addScaledVector(this.b, 7.5)
            .addScaledVector(UP, 6.5)
            .addScaledVector(right, -2.5);
          out.target.copy(her).addScaledVector(UP, 0.4);
          out.fov = 56;
          out.roll = -0.08;
          out.shake = 0.004;
          out.look = 0.03;
        },
      },
      {
        // The roll: level with her, beside her, the camera turning a little with her; time slows.
        at: M.roll + 0.04,
        blend: 0.26,
        pivot: (T, out) => {
          at(T);
          return out.copy(her).addScaledVector(UP, 1);
        },
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(right, 6.5)
            .addScaledVector(UP, 1.6)
            .addScaledVector(dir, 0.5);
          out.target.copy(her).addScaledVector(UP, 0.9).addScaledVector(dir, 1.5);
          out.fov = 44;
          out.roll =
            -0.6 * ease01(T, M.roll, M.rollEnd) * (1 - ease01(T, M.rollEnd, M.glide + 0.2));
          out.shake = 0;
          out.look = 0.04;
        },
      },
      {
        // The glide out: a leading shot, ahead of her looking back; she is in control now.
        at: M.glide + 0.3,
        blend: 0.4,
        pivot: (T, out) => {
          at(T);
          return out.copy(her).addScaledVector(UP, 1);
        },
        shot: (T, out) => {
          at(T);
          a.copy(her)
            .addScaledVector(dir, 7.5)
            .addScaledVector(UP, 1.6)
            .addScaledVector(right, 2.4);
          out.position.copy(a);
          out.target.copy(her).addScaledVector(UP, 0.9);
          out.fov = 42;
          out.roll = 0.03;
          out.shake = 0.001;
          out.look = 0.04;
        },
      },
      {
        // Behind her again for the punch at the rift.
        at: 5.05,
        blend: 0.32,
        pivot: (T, out) => {
          at(T);
          return out.copy(her).addScaledVector(UP, 1);
        },
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

  private buildGround() {
    // The streets under the towers only: past them the sky layer's carpet of lights takes over.
    const geometry = new PlaneGeometry(SPAN.x[1] - SPAN.x[0] + 100, SPAN.z[1] - SPAN.z[0] + 100);
    geometry.rotateX(-Math.PI / 2);
    this.geometries.push(geometry);
    this.groundMaterial = new ShaderMaterial({
      vertexShader: GROUND_VERTEX,
      fragmentShader: GROUND_FRAGMENT,
      uniforms: {
        ...this.shared,
        uGrid: { value: GRID },
        uGridOffset: { value: new Vector2(0, 0) },
      },
      toneMapped: false,
    });
    this.materials.push(this.groundMaterial);
    const ground = new Mesh(geometry, this.groundMaterial);
    ground.position.set((SPAN.x[0] + SPAN.x[1]) / 2, 0, (SPAN.z[0] + SPAN.z[1]) / 2);
    ground.frustumCulled = false;
    ground.renderOrder = -10;
    this.scene.add(ground);
  }

  /** Is the box (centre x/z, half sizes, height) in the way of her course or the camera path? */
  private blocked(
    cx: number,
    cz: number,
    hx: number,
    hz: number,
    height: number,
    probes: Vector4[],
  ) {
    for (const p of probes) {
      const dx = Math.max(0, Math.abs(p.x - cx) - hx);
      const dz = Math.max(0, Math.abs(p.z - cz) - hz);
      if (dx * dx + dz * dz < p.w * p.w && p.y < height + p.w) return true;
    }
    return false;
  }

  private buildTowers() {
    const walk = this.walk;
    const track = this.track;
    if (!walk || !track) return;
    // Probes: her course (6 m clear around her) and the camera path (3 m around the lens).
    const probes: Vector4[] = [];
    const shot = createShot();
    for (let i = 0; i <= 600; i += 1) {
      const T = (i / 600) * this.length;
      walk.course.at(walk.u(T), this.a);
      probes.push(new Vector4(this.a.x, this.a.y, this.a.z, 6.5));
      track.sample(T, shot);
      probes.push(new Vector4(shot.position.x, shot.position.y, shot.position.z, 3.5));
    }
    const towers: {
      x: number;
      z: number;
      w: number;
      d: number;
      h: number;
      seed: number;
      near: number;
    }[] = [];
    let index = 0;
    for (let gx = SPAN.x[0]; gx < SPAN.x[1]; gx += GRID) {
      for (let gz = SPAN.z[0]; gz < SPAN.z[1]; gz += GRID) {
        index += 1;
        if (hash01(index, 3) > 0.88) continue;
        const w = 8 + hash01(index, 4) * 7;
        const d = 8 + hash01(index, 5) * 7;
        const x = gx + GRID / 2 + (hash01(index, 6) - 0.5) * (GRID - w - 4);
        const z = gz + GRID / 2 + (hash01(index, 7) - 0.5) * (GRID - d - 4);
        const centre = Math.exp(-((x - 40) ** 2 + (z + 140) ** 2) / (2 * 150 ** 2));
        let h = 12 + (24 + 70 * centre) * (0.35 + 0.65 * hash01(index, 8) ** 1.6);
        // Under her path the towers stay low; in her way they go.
        while (h > 8 && this.blocked(x, z, w / 2, d / 2, h, probes)) h -= 6;
        if (h <= 8) continue;
        const near = Math.min(...this.path.map((p) => Math.hypot(p.x - x, p.z - z)));
        towers.push({ x, z, w, d, h, seed: hash01(index, 9), near });
      }
    }
    // The facade she skims.
    towers.push({
      x: (SKIM.x0 + SKIM.x1) / 2,
      z: SKIM.zFace - SKIM.depth / 2,
      w: SKIM.x1 - SKIM.x0,
      d: SKIM.depth,
      h: SKIM.height,
      seed: 0.37,
      near: 0,
    });
    // Nearest first, so a tier that draws fewer drops the far ones.
    towers.sort((p, q) => p.near - q.near);
    const geometry = new BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    this.geometries.push(geometry);
    const data = new Float32Array(towers.length * 4);
    towers.forEach((t, i) => {
      data.set([t.seed, hash01(i, 21), hash01(i, 22), 0], i * 4);
    });
    geometry.setAttribute("aTower", new InstancedBufferAttribute(data, 4));
    this.towerMaterial = new ShaderMaterial({
      vertexShader: TOWER_VERTEX,
      fragmentShader: TOWER_FRAGMENT,
      uniforms: {
        ...this.shared,
        uPath: { value: this.path },
        uPathCount: { value: this.path.length },
        uT: { value: 0 },
        uPointer: { value: new Vector3() },
        uTap: { value: new Vector4(0, 0, 0, -1) },
        uTapSpeed: { value: 70 },
      },
      toneMapped: false,
    });
    this.materials.push(this.towerMaterial);
    const mesh = new InstancedMesh(geometry, this.towerMaterial, towers.length);
    const m = new Matrix4();
    towers.forEach((t, i) => {
      m.makeScale(t.w, t.h, t.d);
      m.setPosition(t.x, 0, t.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.computeBoundingSphere();
    this.towers = mesh;
    this.towerCount = towers.length;
    this.scene.add(mesh);
  }

  private buildTraffic() {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      "aCorner",
      new BufferAttribute(new Float32Array([-0.5, -1, 0.5, -1, 0.5, 1, -0.5, 1]), 2),
    );
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const lanes = new Float32Array(TRAFFIC_MAX * 4);
    const cars = new Float32Array(TRAFFIC_MAX * 4);
    for (let i = 0; i < TRAFFIC_MAX; i += 1) {
      // Most of the traffic runs where she flies: four lanes of the avenue under her, the cross
      // street beside the facade, sky lanes along her course; the rest anywhere on the grid.
      const pick = hash01(i, 30);
      const dirn = hash01(i, 34) > 0.5 ? 1 : -1;
      let alongX: boolean;
      let street: number;
      let height: number;
      let sky = false;
      if (pick < 0.3) {
        alongX = false;
        street = (dirn > 0 ? 1 : -1) * (hash01(i, 32) > 0.5 ? 1.6 : 4.4);
        height = 1.1 + hash01(i, 35) * 0.5;
      } else if (pick < 0.44) {
        alongX = true;
        street = -131 + (dirn > 0 ? 1.6 : -1.6);
        height = 1.1 + hash01(i, 35) * 0.5;
      } else if (pick < 0.6) {
        sky = true;
        alongX = hash01(i, 31) > 0.5;
        street = alongX ? -110 - hash01(i, 32) * 60 : -18 + hash01(i, 32) * 36;
        height = 22 + hash01(i, 35) * 40;
      } else {
        alongX = hash01(i, 31) > 0.5;
        const span = alongX ? SPAN.z : SPAN.x;
        const cells = Math.floor((span[1] - span[0]) / GRID);
        street = span[0] + Math.floor(hash01(i, 32) * cells) * GRID + 0.9 + (dirn > 0 ? 1.4 : -1.4);
        sky = hash01(i, 33) > 0.7;
        height = sky ? 24 + hash01(i, 35) * 60 : 1.2 + hash01(i, 35) * 1.2;
      }
      lanes.set([alongX ? 0 : 1, street, height, dirn], i * 4);
      cars.set(
        [
          hash01(i, 36),
          (sky ? 30 : 16) + hash01(i, 37) * 20,
          sky ? 9 + hash01(i, 38) * 10 : 4.5 + hash01(i, 38) * 4,
          hash01(i, 39),
        ],
        i * 4,
      );
    }
    geometry.setAttribute("aLane", new InstancedBufferAttribute(lanes, 4));
    geometry.setAttribute("aCar", new InstancedBufferAttribute(cars, 4));
    geometry.instanceCount = TRAFFIC_MAX;
    this.geometries.push(geometry);
    this.trafficMaterial = new ShaderMaterial({
      vertexShader: TRAFFIC_VERTEX,
      fragmentShader: TRAFFIC_FRAGMENT,
      uniforms: {
        ...this.shared,
        uSpan: { value: new Vector2((SPAN.x[0] + SPAN.x[1]) / 2, (SPAN.z[0] + SPAN.z[1]) / 2) },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.trafficMaterial);
    this.traffic = new Mesh(geometry, this.trafficMaterial);
    this.traffic.frustumCulled = false;
    this.traffic.renderOrder = 10;
    this.scene.add(this.traffic);
  }

  private buildRibbons() {
    const colours = [0x5b8fe8, 0xf94141, 0xf7bf33, 0xffffff];
    const ribbons: Vector3[][] = [];
    // One rides alongside her course (above and to the side), the others wind over the skyline.
    ribbons.push(
      this.path
        .filter((_, k) => k % 3 === 0)
        .map(
          (p, k) =>
            new Vector3(p.x - 7 + 3 * Math.sin(k * 0.9), p.y + 6 + 2 * Math.cos(k * 1.3), p.z + 4),
        ),
    );
    for (let r = 0; r < 3; r += 1) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 9; k += 1) {
        const s = k / 9;
        pts.push(
          new Vector3(
            -120 + 330 * s + 30 * Math.sin(s * 7 + r * 2),
            34 + 26 * r + 14 * Math.sin(s * 9 + r),
            -60 - 110 * r - 70 * Math.sin(s * 4 + r * 1.7),
          ),
        );
      }
      ribbons.push(pts);
    }
    const positions: number[] = [];
    const tangents: number[] = [];
    const sides: number[] = [];
    const along: number[] = [];
    const tint: number[] = [];
    const index: number[] = [];
    const colour = new Color();
    const course = new Vector3();
    const tangent = new Vector3();
    ribbons.forEach((pts, r) => {
      const curve = new Course(pts);
      const n = 160;
      const base = positions.length / 3;
      colour.setHex(colours.at(r) ?? 0xffffff);
      for (let i = 0; i <= n; i += 1) {
        curve.at(i / n, course);
        curve.tangent(i / n, tangent);
        for (const s of [-1, 1]) {
          positions.push(course.x, course.y, course.z);
          tangents.push(tangent.x, tangent.y, tangent.z);
          sides.push(s);
          along.push((i / n) * curve.length);
          tint.push(colour.r, colour.g, colour.b);
        }
        if (i < n) {
          const a = base + i * 2;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute("aTangent", new BufferAttribute(new Float32Array(tangents), 3));
    geometry.setAttribute("aSide", new BufferAttribute(new Float32Array(sides), 1));
    geometry.setAttribute("aAlong", new BufferAttribute(new Float32Array(along), 1));
    geometry.setAttribute("aColour", new BufferAttribute(new Float32Array(tint), 3));
    geometry.setIndex(index);
    this.geometries.push(geometry);
    this.ribbonMaterial = new ShaderMaterial({
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      uniforms: { ...this.shared, uWidth: { value: 0.32 } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.ribbonMaterial);
    const mesh = new Mesh(geometry, this.ribbonMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 11;
    this.scene.add(mesh);
  }

  private buildBeams() {
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      "aCorner",
      new BufferAttribute(new Float32Array([-0.5, -1, 0.5, -1, 0.5, 1, -0.5, 1]), 2),
    );
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(12), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    const bases = [
      [-60, 70, -260, 0.1],
      [150, 85, -300, 0.7],
      [40, 60, -340, 0.35],
      [230, 75, -200, 0.9],
      [-140, 55, -180, 0.55],
    ];
    const data = new Float32Array(bases.length * 4);
    bases.forEach((b, i) => {
      data.set(b, i * 4);
    });
    geometry.setAttribute("aBeam", new InstancedBufferAttribute(data, 4));
    geometry.instanceCount = bases.length;
    this.geometries.push(geometry);
    this.beamMaterial = new ShaderMaterial({
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      uniforms: { ...this.shared },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.beamMaterial);
    const mesh = new Mesh(geometry, this.beamMaterial);
    mesh.frustumCulled = false;
    mesh.renderOrder = 9;
    this.scene.add(mesh);
  }

  private buildSparks() {
    const geometry = new BufferGeometry();
    const seeds = new Float32Array(SPARK_MAX);
    for (let i = 0; i < SPARK_MAX; i += 1) seeds.set([i], i);
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 1));
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(SPARK_MAX * 3), 3));
    this.geometries.push(geometry);
    this.sparkMaterial = new ShaderMaterial({
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      uniforms: {
        ...this.shared,
        uHand: { value: new Vector3() },
        uBack: { value: new Vector3(-1, 0, 0) },
        uOff: { value: new Vector3(0, 0, 1) },
        uAmount: { value: 0 },
        uScale: { value: 600 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true,
      side: DoubleSide,
      toneMapped: false,
    });
    this.materials.push(this.sparkMaterial);
    this.sparks = new Points(geometry, this.sparkMaterial);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 12;
    this.scene.add(this.sparks);
  }

  // ---------------------------------------------------------------- story

  course(T: number, pose: FlightPose, shot: CameraShot, time: number) {
    const walk = this.walk;
    if (!walk || !this.track) return;
    this.track.sample(T, shot);
    this.place(T);
    pose.position.copy(this.her);
    pose.heading.copy(this.dir);
    const speed = walk.profile(T);
    pose.velocity.copy(this.dir).multiplyScalar(speed);
    const u = walk.u(T);
    const deg = Math.PI / 180;
    const dive =
      ease01(T, M.dive - 0.2, M.dive + 0.1) * (1 - ease01(T, M.avenue - 0.1, M.avenue + 0.15));
    const action =
      ease01(T, M.avenue - 0.1, M.avenue + 0.15) * (1 - ease01(T, M.climb - 0.1, M.climb + 0.1));
    const skim =
      ease01(T, M.skim - 0.05, M.skim + 0.12) * (1 - ease01(T, M.climb - 0.12, M.climb + 0.04));
    const roll = lin01(T, M.roll, M.rollEnd);
    const rolling = roll > 0 && roll < 1 ? 1 : 0;
    const tuck =
      ease01(T, M.roll - 0.08, M.roll + 0.02) * (1 - ease01(T, M.rollEnd - 0.04, M.rollEnd + 0.08));
    const glide = ease01(T, M.glide - 0.05, M.glide + 0.25);
    const climb = ease01(T, M.climb - 0.05, M.climb + 0.15) * (1 - tuck) * (1 - glide);
    const slalom = (1 - dive) * (1 - action) * (1 - climb) * (1 - tuck) * (1 - glide);
    pose.pitch = deg * 84;
    // The barrel roll: one full turn about her travel axis over the tuck (barrel_tuck's own timing).
    const spin = ease01(roll, 0.13, 0.8);
    pose.roll = rolling * spin * Math.PI * 2;
    pose.yaw = 0;
    pose.spin = 0;
    // Into the wall: banked hard, her belly to the facade, fingers trailing sparks.
    pose.bank =
      walk.course.bank(u, speed / 2.2, 0.7, 0.95) * (1 - skim) +
      -0.95 * skim +
      0.12 * Math.sin(time * 3.2) * action;
    pose.lean = 0.1 * dive;
    pose.sway = 1;
    pose.layers = [
      { clip: "fly_slalom", weight: slalom + 0.15 },
      { clip: "fly_superhero", weight: dive + climb + glide },
      { clip: "fly_action", weight: action * (1 - skim * 0.5) },
      { clip: "fly_slalom", weight: skim * 0.5 },
      { clip: "barrel_tuck", weight: tuck, progress: roll },
    ];
    pose.face =
      tuck > 0.5 ? "auto" : glide > 0.5 ? "big_smile" : action > 0.5 ? "determined" : "auto";
    pose.faceWeight = 1;
    pose.glow = 0.75;
    pose.glowColor = 0x5b8fe8;
    pose.rim = 0.85;
    pose.rimColor = 0xb8c8ff;
    pose.lift = 0.08;
    pose.look = null;
    pose.lookWeight = 0;
    pose.nervous = 0;
    pose.visible = true;
  }

  /** The top of the roll: a speed ramp to a quarter, so the city hangs still while she turns over. */
  timeRate(T: number) {
    const top = (M.roll + M.rollEnd) / 2;
    const slow =
      ease01(T, M.roll - 0.05, top - 0.04) * (1 - ease01(T, top + 0.04, M.rollEnd + 0.06));
    return 1 - 0.75 * slow;
  }

  frame(ctx: StoryContext, f: WorldFrame) {
    const u = this.uniforms;
    u.uTime.value = f.time;
    u.uFreeze.value = f.freeze;
    u.uFlow.value = f.flow;
    const T = Math.max(0, f.T);
    (this.shared.uCamPos.value as Vector3).copy(f.camera.position);
    this.sky?.aim(f.camera);
    const towers = this.towerMaterial;
    if (towers) {
      towers.uniforms.uT.value = Math.max(-1, f.T);
      // The cursor wakes rooms under it (device pixels, y up), a tap's ring runs out from where it landed.
      const pointer = ctx.pointer;
      const mouse = f.view === "main" && pointer.type === "mouse" && pointer.inside;
      this.hover += ((mouse ? 1 : 0) - this.hover) * 0.15;
      const dpr = ctx.size.dpr;
      (towers.uniforms.uPointer.value as Vector3).set(
        pointer.px.x * dpr,
        (ctx.size.height - pointer.px.y) * dpr,
        f.view === "main" ? this.hover : 0,
      );
      const age = f.time - this.tapTime;
      (towers.uniforms.uTap.value as Vector4).set(
        this.tapAt.x,
        this.tapAt.y,
        this.tapAt.z,
        f.view === "main" && age < 6 ? age : -1,
      );
      this.cursor.x = pointer.ndc.x;
      this.cursor.y = pointer.ndc.y;
      this.cursor.on = this.hover;
    }
    this.place(T);
    // Sparks off her trailing hand while she skims the wall.
    const sparks = this.sparkMaterial;
    if (sparks) {
      const skim =
        ease01(T, M.skim + 0.05, M.skim + 0.15) * (1 - ease01(T, M.climb - 0.18, M.climb - 0.06));
      // The wall is on her left: her left hand trails along it, the sparks fly off it.
      (sparks.uniforms.uHand.value as Vector3)
        .copy(this.her)
        .addScaledVector(this.right, -1.2)
        .addScaledVector(UP, 0.7);
      (sparks.uniforms.uBack.value as Vector3).copy(this.dir).negate();
      (sparks.uniforms.uOff.value as Vector3).copy(this.right);
      sparks.uniforms.uAmount.value = skim;
      sparks.uniforms.uScale.value = ctx.size.height * ctx.size.dpr * 0.5;
      if (this.sparks) this.sparks.visible = skim > 0.01 || f.view === "portal";
    }
    // Sparkles in the air drift along the avenues with the treadmill.
    this.flowOffset.set(f.flow * 3, 0, -f.flow * 1.5);
    this.motes?.update(
      f.camera,
      this.flowOffset,
      f.view === "main" ? this.cursor : { x: 0, y: 0, on: 0 },
      ctx.size.height * ctx.size.dpr,
      ctx.size.aspect,
    );
    // Her key: cool light from above the rooftops, the warm city glow from below (the hemisphere).
    this.rig.key.position.copy(this.her).add(this.b.set(-20, 40, 20));
    this.rig.key.target.position.copy(this.her);
    this.rig.key.target.updateMatrixWorld();
  }

  post(): Partial<StoryPostParams> {
    return { bloom: 0.46, bloomThreshold: 0.64, bloomRadius: 0.55, vignette: 0.5, grain: 0.2 };
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent, time: number) {
    if (event.type !== "tap" || !this.towers) return false;
    this.ndc.set(event.ndc.x, event.ndc.y);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    const hits = this.ray.intersectObject(this.towers, false);
    const hit = hits.at(0);
    if (hit) this.tapAt.copy(hit.point);
    else this.tapAt.copy(this.ray.ray.origin).addScaledVector(this.ray.ray.direction, 80);
    this.tapTime = time;
    return true;
  }

  setTier(tier: StoryTier) {
    super.setTier(tier);
    const c = countsFor(tier);
    if (this.towers) this.towers.count = Math.max(1, Math.round(this.towerCount * c.towers));
    if (this.traffic) (this.traffic.geometry as InstancedBufferGeometry).instanceCount = c.traffic;
    this.shared.uFogDensity.value = c.fog;
    this.motes?.setShare(c.motes);
    this.sparks?.geometry.setDrawRange(0, c.sparks);
  }

  dispose() {
    this.motes?.dispose();
    this.towers?.dispose();
    super.dispose();
  }
}
