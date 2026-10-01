import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from "three";

import { BRAND, hash01 } from "@/components/story/props/deck-shared";
import { STAR_SDF_GLSL } from "@/components/story/props/fx/star-sdf.glsl";

/**
 * Bursts of little four-point stars (a card landing, a letter hopping, a
 * rift opening, a click on anything that deserves a cheer). Every particle
 * is a pure function of (time - burst start) and its index hash, computed
 * in the vertex shader, so a burst can be scrubbed backwards as well as
 * played on the clock. Up to `slots` bursts live at once in one draw call.
 *
 * Add `burst.points` to a scene (identity parent). Call `update(time,
 * drawingBufferHeight)` once a frame with the same clock you pass to `fire`.
 */

export type SparkleBurstOptions = {
  /** Particles per burst. */
  count?: number;
  /** Bursts that can overlap. */
  slots?: number;
  /** Seconds a particle lives at most. */
  life?: number;
  /** Particle size, metres. */
  size?: number;
  /** Launch speed, metres per second. */
  speed?: number;
  /** Gravity on the sparkles (they drift down, magically slow). */
  gravity?: number;
  colours?: readonly number[];
  /** Over the light page: normal blending and saturated colours (additive light vanishes on white). */
  onLight?: boolean;
};

export type SparkleBurst = {
  readonly points: Points;
  /** Starts a burst at `origin` at `time`; `power` scales speed and size. Returns its slot. */
  fire(origin: Vector3, time: number, power?: number): number;
  /** Moves or re-times an existing burst (for scrubbed bursts). */
  place(slot: number, origin: Vector3, time: number, power?: number): void;
  update(time: number, drawingBufferHeight: number): void;
  clear(): void;
  dispose(): void;
};

const MAX_SLOTS = 8;

const VERTEX = /* glsl */ `
attribute float aSlot;
attribute vec3 aDir;
attribute vec4 aRand;
uniform vec3 uOrigin[${MAX_SLOTS}];
uniform float uStart[${MAX_SLOTS}];
uniform float uPower[${MAX_SLOTS}];
uniform float uTime;
uniform float uLife;
uniform float uSize;
uniform float uSpeed;
uniform float uGravity;
uniform float uViewport;
uniform vec3 uColours[4];
varying vec3 vColour;
varying float vAlpha;
varying float vSpin;
void main() {
  int slot = int(aSlot);
  float power = uPower[slot];
  float t = uTime - uStart[slot];
  float life = uLife * (0.45 + 0.55 * aRand.z);
  float k = t / life;
  if (t < 0.0 || k > 1.0 || power <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  float drag = 3.2;
  float speed = uSpeed * power * (0.35 + 0.65 * aRand.x);
  vec3 p = uOrigin[slot] + aDir * speed * (1.0 - exp(-drag * t)) / drag;
  p.y -= 0.5 * uGravity * t * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.75 + 0.25 * sin(t * (18.0 + aRand.y * 14.0) + aRand.w * 40.0);
  float grow = smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 1.0, k));
  float world = uSize * (0.5 + aRand.y) * sqrt(power) * grow * twinkle;
  gl_PointSize = world * projectionMatrix[1][1] * uViewport * 0.5 / max(-mv.z, 1e-3);
  int c = int(floor(aRand.w * 3.999));
  vColour = uColours[c];
  vAlpha = 1.0 - k * k;
  vSpin = aRand.w * 6.2831 + t * (aRand.x - 0.5) * 6.0;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uWhiten;
varying vec3 vColour;
varying float vAlpha;
varying float vSpin;
${STAR_SDF_GLSL}
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = sdStar4Rot(q, 0.62, 0.36, vSpin);
  float core = sdFill(d, 0.06);
  float glow = exp(-max(d, 0.0) * 9.0) * 0.55;
  vec3 col = mix(vColour, vec3(1.0), core * 0.45 * uWhiten);
  gl_FragColor = vec4(col, clamp(core + glow, 0.0, 1.0) * vAlpha);
}
`;

export function createSparkleBurst(options: SparkleBurstOptions = {}): SparkleBurst {
  const count = Math.max(1, Math.floor(options.count ?? 48));
  const slots = Math.max(1, Math.min(MAX_SLOTS, Math.floor(options.slots ?? 4)));
  const total = count * slots;
  const slotAttr = new Float32Array(total);
  const dir = new Float32Array(total * 3);
  const rand = new Float32Array(total * 4);
  const position = new Float32Array(total * 3);
  const v = new Vector3();
  for (let s = 0; s < slots; s++) {
    for (let i = 0; i < count; i++) {
      const n = s * count + i;
      slotAttr.set([s], n);
      // Directions on a sphere, biased upward: sparkles leap out and float.
      const u = hash01(n, 21) * 2 - 1;
      const phi = hash01(n, 22) * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      v.set(r * Math.cos(phi), Math.abs(u) * 0.8 + 0.2, r * Math.sin(phi)).normalize();
      v.toArray(dir, n * 3);
      rand.set([hash01(n, 23), hash01(n, 24), hash01(n, 25), hash01(n, 26)], n * 4);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(position, 3));
  geometry.setAttribute("aSlot", new BufferAttribute(slotAttr, 1));
  geometry.setAttribute("aDir", new BufferAttribute(dir, 3));
  geometry.setAttribute("aRand", new BufferAttribute(rand, 4));

  const onLight = options.onLight ?? false;
  const palette =
    options.colours ??
    (onLight
      ? [BRAND.yellow, BRAND.blue, BRAND.red, BRAND.navy]
      : [BRAND.yellow, 0xffffff, BRAND.blue, BRAND.warm]);
  const uniforms = {
    uOrigin: { value: Array.from({ length: MAX_SLOTS }, () => new Vector3()) },
    uStart: { value: new Array<number>(MAX_SLOTS).fill(-1e6) },
    uPower: { value: new Array<number>(MAX_SLOTS).fill(0) },
    uTime: { value: 0 },
    uLife: { value: options.life ?? 1.1 },
    uSize: { value: options.size ?? 0.006 },
    uSpeed: { value: options.speed ?? 0.35 },
    uGravity: { value: options.gravity ?? 0.12 },
    uViewport: { value: 1000 },
    uColours: {
      value: [0, 1, 2, 3].map((i) => new Color(palette.at(i % palette.length) ?? BRAND.yellow)),
    },
    uWhiten: { value: onLight ? 0 : 1 },
  };
  const material = new ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    blending: onLight ? NormalBlending : AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const points = new Points(geometry, material);
  points.name = "story-sparkle-burst";
  points.frustumCulled = false;
  points.renderOrder = 4;

  let nextSlot = 0;
  const burst: SparkleBurst = {
    points,
    fire(origin, time, power = 1) {
      const slot = nextSlot;
      nextSlot = (nextSlot + 1) % slots;
      burst.place(slot, origin, time, power);
      return slot;
    },
    place(slot, origin, time, power = 1) {
      if (slot < 0 || slot >= slots) return;
      uniforms.uOrigin.value.at(slot)?.copy(origin);
      uniforms.uStart.value.splice(slot, 1, time);
      uniforms.uPower.value.splice(slot, 1, power);
    },
    update(time, drawingBufferHeight) {
      uniforms.uTime.value = time;
      uniforms.uViewport.value = drawingBufferHeight;
    },
    clear() {
      uniforms.uPower.value.fill(0);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      points.removeFromParent();
    },
  };
  return burst;
}
