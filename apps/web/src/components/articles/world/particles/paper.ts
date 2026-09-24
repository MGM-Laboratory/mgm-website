import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from "three";

import { WORLD_PALETTE } from "@/components/articles/world/palette";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * The library's paper birds: loose sheets that come alive around the
 * visitor.
 *
 * - A swarm: when the pointer rests, a burst of small sheets flies up from
 *   under it and away into the depth, each on its own curling path,
 *   bending, spinning, and fading into the fog within a few seconds.
 * - Flyers: a slow flock of folded sheets circling deep in the nave, like
 *   unseen.co's butterflies; while the pointer moves, now and then one is
 *   born under it and flies off to join the others.
 *
 * All of it lives behind the card plane (the list's cards cover it where
 * they are, the gaps and margins show it), in world CSS px. One instanced
 * mesh for everything; the CPU steps at most a pool of sheets and writes
 * their matrices and a small per-sheet attribute, nothing allocates.
 */

const SWARM = 0;
const FLYER = 1;

const VERTEX = /* glsl */ `
  uniform float uTime;
  attribute vec4 aPaper;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  varying float vKind;
  varying vec3 vView;
  varying float vDepth;
  varying float vWorldY;
  void main() {
    vUv = uv;
    // aPaper: opacity, flutter phase, flutter amount, kind + seed.
    vAlpha = aPaper.x;
    vKind = floor(aPaper.w);
    vSeed = fract(aPaper.w);
    vec3 p = position;
    if (vKind > 0.5) {
      // A folded sheet flapping like a wing, both halves together.
      p.z += sin(aPaper.y) * aPaper.z * pow(abs(p.x) * 2.0, 1.3);
      p.y += cos(aPaper.y) * aPaper.z * 0.12 * abs(p.x);
    } else {
      // A loose sheet rippling as it tumbles.
      p.z += sin(aPaper.y + p.x * 3.2 + p.y * 1.7) * aPaper.z * 0.35;
      p.z += (p.x * p.x - 0.08) * aPaper.z * 0.45 * cos(aPaper.y * 0.7);
    }
    vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorldY = wp.y;
    vec4 mv = viewMatrix * wp;
    vView = mv.xyz;
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform vec3 uPaperLight;
  uniform vec3 uShadeLight;
  uniform vec3 uPaperDark;
  uniform vec3 uGlowDark;
  varying vec2 vUv;
  varying float vAlpha;
  varying float vSeed;
  varying float vKind;
  varying vec3 vView;
  varying float vDepth;
  varying float vWorldY;
  void main() {
    // Dithered fade: the sheets stay opaque (no sorting between them).
    if (vAlpha < worldHash(gl_FragCoord.xy + vSeed * 91.0)) discard;
    float dark = darkAt();
    vec3 n = normalize(cross(dFdx(vView), dFdy(vView)));
    float lit = abs(dot(n, normalize(vec3(-0.4, 0.75, 0.55))));
    float facing = abs(n.z);
    // Faint lines of script, and a soft darkening toward the edges.
    vec2 e = abs(vUv - 0.5);
    float edge = smoothstep(0.34, 0.5, max(e.x, e.y));
    float script = step(0.6, fract(vUv.y * 9.0 + vSeed)) * step(0.18, vUv.x) * step(vUv.x, 0.82)
                 * step(0.16, vUv.y) * step(vUv.y, 0.84) * (0.5 + 0.5 * worldNoise(vUv * vec2(40.0, 9.0)));
    vec3 day = mix(uShadeLight, uPaperLight, 0.35 + 0.65 * lit);
    day *= 1.0 - edge * 0.06 - script * 0.07;
    // By night the sheets are moonlit, their script glowing faintly.
    vec3 night = mix(uPaperDark * 1.6, uGlowDark * 0.75, lit * 0.7) + uGlowDark * (script * 0.6 + edge * 0.3);
    vec3 color = mix(day, night, dark);
    float fog = worldFogAmount(vDepth, vWorldY) * mix(0.62, 0.65, dark);
    gl_FragColor = vec4(mix(color, worldFogColor(dark), fog), 1.0);
  }
`;

type Sheet = {
  kind: number;
  active: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  size: number;
  phase: number;
  flap: number;
  bend: number;
  seed: number;
  grow: number;
  goalX: number;
  goalY: number;
  goalZ: number;
};

export type PaperFlock = {
  mesh: InstancedMesh;
  /** A swarm bursting from a world point (under the resting pointer). */
  burst(x: number, y: number, z: number, count: number): void;
  /** One flyer born at a world point, off to join the flock. */
  spawnFlyer(x: number, y: number, z: number): void;
  update(time: number, dt: number, naveHalf: number): void;
  /** How many flyers the flock keeps (fewer on weak devices and articles). */
  setFlyers(count: number): void;
  dispose(): void;
};

/** A cheap swirling field (not divergence free, but it curls well). */
function swirl(x: number, y: number, z: number, t: number, out: Vector3) {
  const f = 0.004;
  return out.set(
    Math.sin(y * f + t * 0.7) + Math.sin(z * f * 1.3 + t * 0.43),
    Math.sin(z * f + t * 0.52) + Math.sin(x * f * 1.1 - t * 0.61),
    Math.sin(x * f + t * 0.33) + Math.sin(y * f * 0.9 + t * 0.8),
  );
}

export function createPaperFlock(
  world: WorldUniforms,
  options: { pool: number; flyers: number; random: () => number },
): PaperFlock {
  const pool = options.pool;
  const rand = options.random;
  const rb = (a: number, b: number) => a + (b - a) * rand();
  const geometry = new PlaneGeometry(1, 1.32, 6, 3);
  const attribute = new InstancedBufferAttribute(new Float32Array(pool * 4), 4).setUsage(
    DynamicDrawUsage,
  );
  geometry.setAttribute("aPaper", attribute);
  const material = new ShaderMaterial({
    uniforms: {
      ...world,
      uPaperLight: { value: new Color("#FFFFFF") },
      uShadeLight: { value: new Color("#CDD2DB") },
      uPaperDark: { value: new Color(WORLD_PALETTE.dark.paper) },
      uGlowDark: { value: new Color(WORLD_PALETTE.dark.glyph) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: DoubleSide,
  });
  const mesh = new InstancedMesh(geometry, material, pool);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  // Before the cards (they cover the sheets behind them), after the library.
  mesh.renderOrder = 8;

  const sheets: Sheet[] = [];
  for (let i = 0; i < pool; i++) {
    sheets.push({
      kind: SWARM,
      active: false,
      age: 0,
      life: 1,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      sx: 0,
      sy: 0,
      sz: 0,
      size: 24,
      phase: 0,
      flap: 0,
      bend: 0,
      seed: rand(),
      grow: 1,
      goalX: 0,
      goalY: 0,
      goalZ: 0,
    });
  }

  let flyerTarget = Math.min(options.flyers, pool);
  const flock = { x: 0, y: 80, z: -1900 };
  const matrix = new Matrix4();
  const q = new Quaternion();
  const euler = new Euler();
  const position = new Vector3();
  const scale = new Vector3();
  const field = new Vector3();
  const zero = new Matrix4().makeScale(0, 0, 0);
  const data = attribute.array as Float32Array;

  const seedFlyer = (sheet: Sheet, naveHalf: number) => {
    sheet.kind = FLYER;
    sheet.active = true;
    sheet.age = 0;
    sheet.life = Infinity;
    sheet.x = rb(-0.8, 0.8) * naveHalf;
    sheet.y = rb(-150, 360);
    sheet.z = rb(-2700, -900);
    sheet.vx = rb(-60, 60);
    sheet.vy = rb(-20, 20);
    sheet.vz = rb(-60, 60);
    sheet.size = rb(26, 38);
    sheet.flap = rb(7, 11);
    sheet.bend = rb(0.35, 0.55);
    sheet.grow = 1;
    sheet.goalX = rb(-1, 1);
    sheet.goalY = rb(-1, 1);
    sheet.goalZ = rb(-1, 1);
  };

  const free = () => {
    for (const sheet of sheets) if (!sheet.active) return sheet;
    return null;
  };

  let flyersSeeded = false;

  return {
    mesh,
    burst(x, y, z, count) {
      for (let i = 0; i < count; i++) {
        const sheet = free();
        if (!sheet) return;
        const angle = rb(0, Math.PI * 2);
        const speed = rb(180, 460);
        Object.assign(sheet, {
          kind: SWARM,
          active: true,
          age: 0,
          life: rb(2.1, 3.0),
          x: x + Math.cos(angle) * rb(0, 14),
          y: y + Math.sin(angle) * rb(0, 14),
          z: z - rb(0, 40),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.8 + rb(60, 200),
          vz: -rb(420, 820),
          rx: rb(0, 6.28),
          ry: rb(0, 6.28),
          rz: rb(0, 6.28),
          sx: rb(-5, 5),
          sy: rb(-4, 4),
          sz: rb(-6, 6),
          size: rb(20, 36),
          phase: rb(0, 6.28),
          flap: rb(5, 10),
          bend: rb(0.25, 0.6),
          grow: 0,
        });
      }
    },
    spawnFlyer(x, y, z) {
      // Take the flyer furthest from the flock's heart (the one nobody misses).
      let pick: Sheet | null = null;
      let best = -1;
      for (const sheet of sheets) {
        if (!sheet.active || sheet.kind !== FLYER) continue;
        const d = Math.abs(sheet.z - flock.z) + Math.abs(sheet.x - flock.x);
        if (d > best) {
          best = d;
          pick = sheet;
        }
      }
      if (!pick) return;
      pick.x = x;
      pick.y = y;
      pick.z = z;
      pick.vx = rb(-80, 80);
      pick.vy = rb(40, 140);
      pick.vz = -rb(380, 600);
      pick.grow = 0;
    },
    update(time, dt, naveHalf) {
      if (!flyersSeeded) {
        flyersSeeded = true;
        for (let i = 0; i < flyerTarget; i++) seedFlyer(sheets[i], naveHalf);
      }
      // The flock's heart wanders slowly through the nave.
      flock.x = Math.sin(time * 0.045) * naveHalf * 0.35;
      flock.y = 120 + Math.sin(time * 0.07 + 1.3) * 140;
      flock.z = -1900 + Math.sin(time * 0.031) * 600;
      let flyers = 0;
      for (let i = 0; i < pool; i++) {
        const s = sheets[i];
        if (!s.active) {
          mesh.setMatrixAt(i, zero);
          continue;
        }
        s.age += dt;
        s.grow = Math.min(1, s.grow + dt * (s.kind === FLYER ? 1.2 : 7));
        let alpha = s.grow;
        if (s.kind === SWARM) {
          if (s.age >= s.life) {
            s.active = false;
            mesh.setMatrixAt(i, zero);
            continue;
          }
          swirl(s.x, s.y, s.z, time + s.seed * 10, field);
          s.vx += field.x * 160 * dt;
          s.vy += (field.y * 140 + 30) * dt;
          s.vz += (field.z * 120 - 120) * dt;
          const drag = Math.exp(-dt * 0.9);
          s.vx *= drag;
          s.vy *= drag;
          s.vz *= drag;
          s.rx += s.sx * dt;
          s.ry += s.sy * dt;
          s.rz += s.sz * dt;
          const t = s.age / s.life;
          alpha *= 1 - smooth(0.55, 1, t);
          euler.set(s.rx, s.ry, s.rz);
        } else {
          flyers += 1;
          if (flyers > flyerTarget) {
            s.active = false;
            mesh.setMatrixAt(i, zero);
            continue;
          }
          // Steer for a place of its own near the flock's heart.
          const gx = flock.x + s.goalX * naveHalf * 0.55;
          const gy = flock.y + s.goalY * 220;
          const gz = flock.z + s.goalZ * 700;
          swirl(s.x, s.y, s.z, time * 0.6 + s.seed * 20, field);
          s.vx += ((gx - s.x) * 0.12 + field.x * 40) * dt;
          s.vy += ((gy - s.y) * 0.12 + field.y * 30) * dt;
          s.vz += ((gz - s.z) * 0.1 + field.z * 40) * dt;
          const speed = Math.hypot(s.vx, s.vy, s.vz);
          const cap = 150;
          if (speed > cap) {
            s.vx *= cap / speed;
            s.vy *= cap / speed;
            s.vz *= cap / speed;
          }
          // Face the way it flies, banking into turns.
          const heading = Math.atan2(s.vx, -s.vz);
          const pitch = Math.atan2(s.vy, Math.hypot(s.vx, s.vz)) * 0.6;
          euler.set(-Math.PI / 2 + pitch, heading, Math.sin(time * 0.8 + s.seed * 9) * 0.3, "YXZ");
        }
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.z += s.vz * dt;
        s.phase += dt * s.flap * (s.kind === FLYER ? 1 : 0.6);
        q.setFromEuler(euler);
        euler.order = "XYZ";
        const size = s.size * (0.3 + 0.7 * s.grow);
        matrix.compose(position.set(s.x, s.y, s.z), q, scale.set(size, size, size));
        mesh.setMatrixAt(i, matrix);
        data[i * 4] = alpha;
        data[i * 4 + 1] = s.phase;
        data[i * 4 + 2] = s.bend;
        data[i * 4 + 3] = s.kind + s.seed * 0.99;
      }
      // Top the flock up (after a tier change raised the target).
      if (flyers < flyerTarget) {
        const sheet = free();
        if (sheet) seedFlyer(sheet, naveHalf);
      }
      mesh.instanceMatrix.needsUpdate = true;
      attribute.needsUpdate = true;
    },
    setFlyers(count) {
      flyerTarget = Math.max(0, Math.min(pool, count));
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

function smooth(a: number, b: number, t: number) {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
}
