import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Points,
  ShaderMaterial,
  Vector3,
  type PerspectiveCamera,
} from "three";

import { GLOW_BLENDING } from "@/components/articles/world/library/window";
import { WORLD_PALETTE } from "@/components/articles/world/palette";
import { WORLD_COMMON, type WorldUniforms } from "@/components/articles/world/world-glsl";

/**
 * Every glowing mote the world throws: the trail the pointer leaves, the
 * burst of a tap or a click, the sparks racing along a theme switch's front.
 *
 * One GPU ring buffer: each emission writes a slot (where it was born, its
 * velocity, its birth time, life, size and kind) and uploads only the slots
 * it touched; the vertex shader flies every mote from those numbers alone,
 * so nothing is simulated or allocated per frame on the CPU. Old motes are
 * simply overwritten when the ring comes round.
 *
 * Light: gold dust and warm white glints laid over the pale fog. Dark: blue
 * sparks and embers that add their light. Motes are fogged by depth, and
 * drawn after the cards (they glint over the list) but under all DOM text.
 */

export type SparkKind = "trail" | "burst" | "front" | "ink";

const KIND: Record<SparkKind, number> = { trail: 0, burst: 1, front: 2, ink: 3 };

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform vec2 uViewport;
  attribute vec3 aVelocity;
  attribute vec4 aLife;
  varying float vFade;
  varying float vKind;
  varying float vSeed;
  varying float vDepth;
  void main() {
    // aLife: birth time, lifetime, size (CSS px), kind.
    float age = uTime - aLife.x;
    float t = age / max(aLife.y, 1e-3);
    vKind = aLife.w;
    vSeed = fract(aLife.x * 13.37 + position.x * 0.017);
    if (t < 0.0 || t > 1.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vFade = 0.0;
      return;
    }
    // Motes slow as they drift, lifting a little, wandering on a lazy curl.
    float drag = age * (1.0 - 0.45 * t);
    vec3 p = position + aVelocity * drag;
    float w = vSeed * 6.2831;
    p.x += sin(age * 2.1 + w) * 10.0 * t;
    p.y += cos(age * 1.7 + w * 1.3) * 8.0 * t + 22.0 * age * step(vKind, 0.5);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
    float grow = smoothstep(0.0, 0.08, t);
    float shrink = pow(1.0 - t, 0.7);
    gl_PointSize = aLife.z * uPixelRatio * grow * shrink * (2000.0 / max(vDepth, 200.0));
    // Twinkle.
    vFade = grow * pow(1.0 - t, 0.65) * (0.75 + 0.25 * sin(age * (9.0 + vSeed * 7.0) + w));
  }
`;

const FRAGMENT = /* glsl */ `
  ${WORLD_COMMON}
  uniform vec3 uGoldLight;
  uniform vec3 uGlintLight;
  uniform vec3 uBlueDark;
  uniform vec3 uEmberDark;
  uniform vec3 uFrontInk;
  uniform vec3 uFrontDawn;
  uniform float uOpacity;
  varying float vFade;
  varying float vKind;
  varying float vSeed;
  varying float vDepth;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float r = length(p) * 2.0;
    float core = exp(-r * r * 10.0);
    float halo = exp(-r * r * 3.0) * 0.6;
    // A few motes glint with a four-point star.
    float star = step(0.72, vSeed) * max(exp(-abs(p.x) * 38.0) , exp(-abs(p.y) * 38.0)) * (1.0 - r) * 0.8;
    float shape = clamp(core + halo + star, 0.0, 1.4) * step(r, 1.0);
    float dark = darkAt();
    vec3 light = mix(uGoldLight, uGlintLight, core);
    vec3 night = mix(uBlueDark, uEmberDark, step(0.66, vSeed)) * (1.0 + core * 0.9);
    vec3 color = mix(light, night, dark);
    // Front sparks take the switch's colour: blue fire into the dark, dawn gold into the light.
    if (vKind > 1.5 && vKind < 2.5) color = mix(uFrontDawn, uFrontInk, dark) * (1.0 + core);
    if (vKind > 2.5) color = mix(vec3(0.05, 0.07, 0.14), uBlueDark, dark);
    float fog = smoothstep(2600.0, 9000.0, vDepth);
    float a = shape * vFade * (1.0 - fog) * uOpacity;
    // Premultiplied glow: laid over the light fog (gold dust), added in the dark.
    float over = mix(vKind > 2.5 ? 0.9 : 0.8, 0.0, dark);
    // By day the halo is richer gold so the dust reads on the pale fog.
    a *= mix(1.25, 1.0, dark);
    gl_FragColor = vec4(color * a, clamp(a * over, 0.0, 1.0));
  }
`;

export type Sparks = {
  points: Points;
  /** Emits one mote at a world point. */
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: SparkKind,
  ): void;
  /** Viewport CSS px to the world point under it on the plane z (reuses `out`). */
  unproject(x: number, y: number, z: number, out: Vector3): Vector3;
  /** Flushes this frame's emissions to the GPU. */
  commit(): void;
  setCapacity(count: number): void;
  setOpacity(value: number): void;
  dispose(): void;
};

export function createSparks(
  world: WorldUniforms,
  camera: PerspectiveCamera,
  viewport: () => { width: number; height: number },
  capacity: number,
): Sparks {
  const size = capacity;
  const origin = new Float32Array(size * 3);
  const velocity = new Float32Array(size * 3);
  // Born long ago: everything starts dead.
  const life = new Float32Array(size * 4).fill(-1000);
  for (let i = 0; i < size; i++) life[i * 4 + 1] = 1;
  const geometry = new BufferGeometry();
  const originAttribute = new BufferAttribute(origin, 3).setUsage(DynamicDrawUsage);
  const velocityAttribute = new BufferAttribute(velocity, 3).setUsage(DynamicDrawUsage);
  const lifeAttribute = new BufferAttribute(life, 4).setUsage(DynamicDrawUsage);
  geometry.setAttribute("position", originAttribute);
  geometry.setAttribute("aVelocity", velocityAttribute);
  geometry.setAttribute("aLife", lifeAttribute);
  const attributes = [originAttribute, velocityAttribute, lifeAttribute];

  const palette = WORLD_PALETTE;
  const material = new ShaderMaterial({
    uniforms: {
      ...world,
      uGoldLight: { value: new Color("#D8A23F") },
      uGlintLight: { value: new Color("#FFF8E8") },
      uBlueDark: { value: new Color(palette.dark.mote) },
      uEmberDark: { value: new Color("#FFA24A") },
      uFrontInk: { value: new Color(palette.dark.front) },
      uFrontDawn: { value: new Color(palette.light.front) },
      uOpacity: { value: 1 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    ...GLOW_BLENDING,
    depthTest: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5000;

  let head = 0;
  let limit = size;
  let dirtyFrom = -1;
  let dirtyTo = -1;
  let wrapped = false;
  const ndc = new Vector3();

  const markDirty = (index: number) => {
    if (dirtyFrom < 0) {
      dirtyFrom = dirtyTo = index;
      return;
    }
    if (index < dirtyFrom) wrapped = true;
    dirtyTo = Math.max(dirtyTo, index);
  };

  return {
    points,
    emit(x, y, z, vx, vy, vz, lifetime, px, kind) {
      const i = head;
      head = (head + 1) % limit;
      origin[i * 3] = x;
      origin[i * 3 + 1] = y;
      origin[i * 3 + 2] = z;
      velocity[i * 3] = vx;
      velocity[i * 3 + 1] = vy;
      velocity[i * 3 + 2] = vz;
      life[i * 4] = world.uTime.value;
      life[i * 4 + 1] = lifetime;
      life[i * 4 + 2] = px;
      life[i * 4 + 3] = KIND[kind];
      markDirty(i);
    },
    unproject(x, y, z, out) {
      const { width, height } = viewport();
      ndc.set((x / width) * 2 - 1, -((y / height) * 2 - 1), 0.5).unproject(camera);
      ndc.sub(camera.position).normalize();
      const t = (z - camera.position.z) / (Math.abs(ndc.z) > 1e-6 ? ndc.z : -1e-6);
      return out.copy(camera.position).addScaledVector(ndc, t);
    },
    commit() {
      if (dirtyFrom < 0) return;
      const start = wrapped ? 0 : dirtyFrom;
      const count = wrapped ? limit : dirtyTo - dirtyFrom + 1;
      for (let a = 0; a < attributes.length; a++) {
        const attribute = attributes[a];
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(start * attribute.itemSize, count * attribute.itemSize);
        attribute.needsUpdate = true;
      }
      dirtyFrom = dirtyTo = -1;
      wrapped = false;
    },
    setCapacity(count) {
      limit = Math.max(16, Math.min(size, count));
      head %= limit;
      geometry.setDrawRange(0, limit);
    },
    setOpacity(value) {
      material.uniforms.uOpacity.value = value;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
