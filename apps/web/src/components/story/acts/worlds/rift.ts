import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Texture,
} from "three";

import { hash01 } from "@/components/story/props/deck-shared";
import { STAR_RATIO_COMPASS, STAR_SDF_GLSL } from "@/components/story/props/fx/star-sdf.glsl";
import type { StoryTier } from "@/components/story/engine/act";

import {
  ARRIVAL_CHASE,
  GLSL_COMMON,
  ease01,
  lin01,
  type CameraShot,
  type FlightPose,
} from "./common";

/**
 * The rift: the card back's compass star torn into the air, the doorway
 * from one world to the next (research/inspiration.md 4.2). Its stability
 * is her confidence: the first one is jagged and flickers and sheds shards,
 * the fourth is crisp and calm.
 *
 * Two parts:
 * - the choreography of a rift beat (`riftChoreo`), authored once in a
 *   rift-local frame (the rift's plane z = 0, she travels toward -z), and
 *   placed into a world by its `exit` (before the crossing) or into the next
 *   one by its `entry` (after it);
 * - the visual (`RiftVisual`): the star itself (a seed of light, cracks
 *   along its axes, the shatter, a breathing crystal rim, the next world
 *   seen through it from a portal camera), its shards and its light.
 */

export type RiftKind = "weak" | "punch" | "kick";

export type RiftSpec = Readonly<{
  kind: RiftKind;
  /** 0 (jagged, unstable) to 1 (crisp and calm). */
  stability: number;
}>;

/** The four rifts, in order (w-1r to w-4r). */
export const RIFTS: readonly RiftSpec[] = [
  { kind: "weak", stability: 0.12 },
  { kind: "punch", stability: 0.45 },
  { kind: "punch", stability: 0.72 },
  { kind: "kick", stability: 0.96 },
];

/** Where in the rift beat the camera crosses the rift's plane (the cut to the next world). */
export const RIFT_CUT = 0.62;
/** Outer radius of the open star, metres (she is 1.85 m tall). */
export const RIFT_RADIUS = 3.4;

/** When her fist (or foot) meets the air, as a share of the rift beat. */
export function riftContact(kind: RiftKind) {
  return kind === "weak" ? 0.235 : kind === "kick" ? 0.15 : 0.13;
}

/** The share of the beat the opener clip is scrubbed over. */
function openerSpan(kind: RiftKind) {
  return kind === "weak" ? 0.46 : kind === "kick" ? 0.44 : 0.42;
}

const P = new Vector3();

/**
 * Her pose and the camera for rift beat progress `p`, rift-local. Pure in
 * `p`; `time` only adds the breath of life.
 */
export function riftChoreo(
  p: number,
  spec: RiftSpec,
  pose: FlightPose,
  shot: CameraShot,
  time: number,
  keyColour: number,
  nextKey: number,
) {
  const open = openerSpan(spec.kind);
  const dive = ease01(p, open - 0.04, open + 0.08);
  const settle = 1 - Math.pow(1 - lin01(p, 0, open), 2.2);
  const accel = lin01(p, open, RIFT_CUT);
  const after = lin01(p, RIFT_CUT, 1);
  // Her root: drifting in to the punch, then a dive through, then away into the next world.
  let z = 3.4 - 1.9 * settle;
  let y = -1.3 + 0.04 * Math.sin(time * 2.1);
  if (p > open) {
    z = 1.5 - 10.5 * accel * accel;
    y = -1.3 + 0.4 * accel;
  }
  if (p > RIFT_CUT) {
    z = -9 - 31 * (after * (1.35 - 0.35 * after));
    y = -0.9 + 0.4 * after;
  }
  pose.position.set(0.05 * Math.sin(time * 1.3) * (1 - dive), y, z);
  pose.heading.set(0, 0, -1);
  pose.yaw = 0;
  pose.roll = 0;
  pose.spin = 0;
  pose.pitch = ((85 * Math.PI) / 180) * dive;
  pose.bank = 0;
  pose.lean = 0;
  const speed = p < open ? 6 : p < RIFT_CUT ? 25 + 50 * accel : 80 - 30 * after;
  pose.velocity.set(0, 0, -speed);
  pose.sway = 0.3 + 0.7 * dive;
  const clip =
    spec.kind === "weak" ? "rift_punch_weak" : spec.kind === "kick" ? "rift_kick" : "rift_punch";
  pose.layers = [
    { clip, weight: 1 - dive, progress: lin01(p, 0, open) },
    { clip: "fly_superhero", weight: dive },
  ];
  pose.face = dive > 0.5 ? "big_smile" : "auto";
  pose.faceWeight = 1;
  const contact = riftContact(spec.kind);
  const flare = ease01(p, contact - 0.02, contact + 0.04) * (1 - ease01(p, open, RIFT_CUT + 0.1));
  pose.glow = 1 + 0.4 * flare;
  pose.glowColor = keyColour;
  pose.rim = 0.7 + 0.8 * flare;
  pose.rimColor = nextKey;
  pose.lift = 0.1;
  pose.look = p < open ? P.set(0, 0, 0).clone() : null;
  pose.lookWeight = p < open ? 0.4 : 0;
  pose.nervous = spec.kind === "weak" ? 0.35 * (1 - dive) : 0;
  pose.visible = true;

  // The camera: three quarters behind her while she punches, then a push that
  // follows her through (crossing the plane at the cut), then the arrival chase.
  const near = ease01(Math.min(p, open - 0.06), 0, open);
  const push = ease01(p, open - 0.06, RIFT_CUT);
  const ax = 2.2 - 1.1 * near;
  const ay = 0.4 - 0.3 * near;
  const az = 10 - 3.5 * near;
  const ty = -0.4 + 0.4 * near;
  shot.position.set(ax * (1 - push), ay * (1 - push), az * (1 - push));
  shot.target.set(0, ty + (-0.8 - ty) * push, -10 * push);
  if (p > RIFT_CUT) {
    const back = 9 + (ARRIVAL_CHASE.back - 9) * ease01(after, 0, 1);
    shot.position.set(pose.position.x, pose.position.y + ARRIVAL_CHASE.up, pose.position.z + back);
    shot.target.set(pose.position.x, pose.position.y + ARRIVAL_CHASE.lift, pose.position.z - 1);
  }
  shot.fov = 46 - 2 * near + 10 * push * (1 - after * 0.4);
  shot.roll = (1 - spec.stability) * 0.06 * Math.sin(time * 3.1) * (1 - push);
  shot.shake = (1 - spec.stability) * 0.006 + 0.004 * flare;
  shot.look = 0.02;
}

/** The star's state at rift beat progress `p` (and the end of the world before it). */
export type RiftState = {
  /** A seed of light before the punch, 0..1. */
  seed: number;
  /** Cracks along the axes, 0..1. */
  crack: number;
  /** The star's outer radius, metres. */
  radius: number;
  /** The shatter burst's age in beat progress (negative before). */
  burst: number;
  /** The view through it is on. */
  portal: boolean;
  /** Light spill on her, 0..1. */
  light: number;
  /** The bloom surge and flash of the crossing. */
  surge: number;
};

/**
 * `worldTail` is the progress through the last 18% of the world before the
 * rift (0..1, the seed of light ahead), `p` the rift beat's progress.
 */
export function riftState(worldTail: number, p: number, spec: RiftSpec, out: RiftState) {
  const contact = riftContact(spec.kind);
  const shatter = ease01(p, contact, contact + 0.14);
  out.seed = ease01(worldTail, 0.0, 1.0) * (1 - shatter);
  out.crack = ease01(p, contact - 0.01, contact + 0.06);
  const open = 1 - Math.pow(1 - shatter, 3);
  out.radius = 0.25 + (RIFT_RADIUS - 0.25) * open + 0.12 * out.seed;
  out.burst = p - contact;
  out.portal = p > contact + 0.02;
  out.light = Math.max(out.seed * 0.5, open);
  out.surge = Math.exp(-Math.pow((p - RIFT_CUT) / 0.06, 2));
  return out;
}

// ------------------------------------------------------------------ visual

const STAR_VERTEX = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const STAR_FRAGMENT = /* glsl */ `
uniform sampler2D tPortal;
uniform float uPortal;
uniform float uRadius;
uniform float uSeed;
uniform float uCrack;
uniform float uInstab;
uniform float uTime;
uniform float uBurst;
uniform vec3 uKey;
uniform vec3 uNext;
uniform vec2 uRes;
varying vec2 vLocal;
${GLSL_COMMON}
${STAR_SDF_GLSL}
void main() {
  vec2 p = vLocal;
  float r = length(p);
  float a = atan(p.y, p.x);
  // The edge never sits still: it cracks and heals, more when she is unsure.
  float jag = (vnoise(vec2(a * 9.0, uTime * 7.0)) - 0.5) * 0.55 + (vnoise(vec2(a * 31.0, uTime * 13.0)) - 0.5) * 0.25;
  float flicker = 1.0 - uInstab * 0.35 * step(0.86, hash11(floor(uTime * 24.0)));
  float R = uRadius * (1.0 + jag * 0.22 * uInstab);
  float d = sdStar4(p, R, ${STAR_RATIO_COMPASS.toFixed(3)}) + jag * 0.06 * uInstab;
  float inside = 1.0 - smoothstep(-0.015, 0.015, d);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  if (uPortal > 0.5 && inside > 0.0) {
    // The next world through the star, refracted a little at the crystal edge.
    vec2 uv = gl_FragCoord.xy / uRes;
    float edge = smoothstep(-0.55, 0.0, d);
    vec2 bend = (r > 1e-4 ? p / r : vec2(0.0)) * edge * edge * 0.018;
    vec3 view;
    view.r = texture2D(tPortal, uv - bend * 1.25).r;
    view.g = texture2D(tPortal, uv - bend).g;
    view.b = texture2D(tPortal, uv - bend * 0.75).b;
    // Display bytes: stay in that space, then the rim adds light on top.
    col = view * inside;
    alpha = inside;
  }
  // The rim: a hot white core inside a band of the next world's light.
  float band = exp(-abs(d) * mix(26.0, 12.0, uInstab));
  float core = exp(-abs(d) * 90.0);
  vec3 rim = (uNext * band * 0.9 + vec3(1.0) * core * 1.1) * smoothstep(0.2, 0.6, uRadius) * flicker;
  // The glow around it, and the seed: a four-ray glint before the punch.
  float halo = exp(-max(d, 0.0) * 3.2) * 0.16 * smoothstep(0.2, 1.0, uRadius);
  float rays = exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 0.9) + exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 0.9);
  float dot0 = exp(-r * r * 30.0);
  float seed = uSeed * (rays * 0.9 + dot0 * 2.0) * (0.85 + 0.15 * sin(uTime * 9.0));
  // Cracks shoot out along the star's axes, with finer ones around the outline.
  float axis = min(abs(p.x), abs(p.y));
  float along = max(abs(p.x), abs(p.y));
  float crackLen = uCrack * R * 1.3;
  float crack = exp(-axis * (60.0 + 40.0 * vnoise(vec2(along * 4.0, uTime)))) * step(along, crackLen) * (1.0 - smoothstep(0.4, 1.0, uCrack * (1.0 - uInstab)));
  float web = smoothstep(0.93, 0.99, vnoise(p * 5.5 + uTime * 0.6)) * exp(-abs(d) * 3.0) * uCrack * (0.3 + uInstab);
  vec3 light = rim + uKey * (halo + seed * 0.6) + vec3(1.0) * (seed * 0.5 + crack * 1.6 + web * 0.9);
  // Burst: a ring of light runs out from the punch.
  float ring = uBurst > 0.0 ? exp(-pow((r - uBurst * 26.0) * 5.0, 2.0)) * exp(-uBurst * 12.0) : 0.0;
  light += mix(uNext, vec3(1.0), 0.5) * ring * 0.45;
  // Premultiplied: the portal replaces what is behind, the light adds on top.
  col += linearToOutputTexel(vec4(light, 1.0)).rgb;
  gl_FragColor = vec4(col, alpha);
}
`;

const SHARD_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uBurst;
uniform float uRadius;
uniform float uTime;
uniform float uInstab;
varying float vFade;
varying float vShade;
${STAR_SDF_GLSL}
// A point on the star's outline at parameter s in [0, 1).
vec2 outline(float s, float R) {
  float k = ${STAR_RATIO_COMPASS.toFixed(3)};
  float t = fract(s) * 8.0;
  float i = floor(t);
  float f = t - i;
  float a0 = i * 0.785398;
  float a1 = (i + 1.0) * 0.785398;
  float r0 = mod(i, 2.0) < 0.5 ? R : R * k;
  float r1 = mod(i, 2.0) < 0.5 ? R * k : R;
  return mix(vec2(cos(a0), sin(a0)) * r0, vec2(cos(a1), sin(a1)) * r1, f);
}
void main() {
  float age = uBurst * (0.8 + 0.4 * aSeed.y);
  float life = 0.45 + 0.35 * aSeed.z;
  float k = age / life;
  if (age <= 0.0 || k >= 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec2 o = outline(aSeed.x, uRadius * 0.85);
  vec3 dir = normalize(vec3(o * (0.5 + aSeed.w), -2.5 - 3.0 * aSeed.y));
  float speed = 9.0 + 14.0 * aSeed.z;
  vec3 centre = vec3(o, 0.0) + dir * speed * age * (1.0 - 0.45 * k);
  float spin = (aSeed.w - 0.5) * 30.0 * age + aSeed.x * 40.0;
  float c = cos(spin);
  float s = sin(spin);
  vec3 q = position * (0.22 + 0.4 * aSeed.y) * (1.0 + uInstab);
  q = vec3(q.x * c - q.y * s, q.x * s * 0.6 + q.y * c * 0.6, q.x * s * 0.8 + q.z);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(centre + q, 1.0);
  gl_Position = projectionMatrix * mv;
  vFade = (1.0 - k) * (1.0 - k);
  vShade = 0.6 + 0.4 * sin(spin * 1.7 + aSeed.x * 20.0);
}
`;

const SHARD_FRAGMENT = /* glsl */ `
uniform vec3 uNext;
varying float vFade;
varying float vShade;
void main() {
  vec3 col = mix(uNext, vec3(1.0), 0.55 * vShade) * (0.8 + vShade) * vFade;
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

const WARP_VERTEX = /* glsl */ `
varying vec2 vNdc;
void main() {
  vNdc = position.xy;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const WARP_FRAGMENT = /* glsl */ `
uniform float uAmount;
uniform float uTime;
uniform float uAspect;
uniform vec3 uTint;
varying vec2 vNdc;
${GLSL_COMMON}
void main() {
  vec2 q = vNdc * vec2(uAspect, 1.0);
  float r = length(q);
  float a = atan(q.y, q.x);
  // Radial streaks: cells around the vanishing point, each a short line racing outward.
  float cells = 180.0;
  float cell = floor(a / 6.2831853 * cells);
  float h = hash11(cell + 17.0);
  float lane = fract(a / 6.2831853 * cells);
  float width = exp(-pow((lane - 0.5) * 7.0, 2.0));
  float phase = fract(h * 13.0 - uTime * (1.2 + h * 2.2));
  float streak = smoothstep(phase - 0.25, phase, r * 0.5) * (1.0 - smoothstep(phase, phase + 0.02, r * 0.5));
  float on = step(0.45, h);
  float glow = width * streak * on * smoothstep(0.08, 0.45, r);
  vec3 col = mix(uTint, vec3(1.0), 0.6) * glow * uAmount * 1.4;
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/** Shards per tier (the mesh is built for the highest and drawn with `count`). */
function shardCount(tier: StoryTier) {
  return tier === "low" ? 28 : tier === "medium" ? 56 : 84;
}

const SHARD_MAX = 84;

/**
 * The star, its shards and the warp streaks. One object for the whole act:
 * the act puts `group` into the world whose rift is showing, under that
 * world's `exit` frame, and `warp` into the scene it renders after a
 * crossing.
 */
export class RiftVisual {
  readonly group = new Group();
  readonly star: Mesh;
  readonly shards: InstancedMesh;
  readonly warp: Mesh;
  private readonly starMaterial: ShaderMaterial;
  private readonly shardMaterial: ShaderMaterial;
  private readonly warpMaterial: ShaderMaterial;
  private readonly geometries: BufferGeometry[] = [];
  readonly resolution = new Vector2(1, 1);

  constructor(fullscreen: BufferGeometry) {
    const size = RIFT_RADIUS * 2.6;
    const plane = new PlaneGeometry(size, size);
    this.geometries.push(plane);
    this.starMaterial = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: {
        tPortal: { value: null },
        uPortal: { value: 0 },
        uRadius: { value: 0.3 },
        uSeed: { value: 0 },
        uCrack: { value: 0 },
        uInstab: { value: 0.5 },
        uTime: { value: 0 },
        uBurst: { value: -1 },
        uKey: { value: new Color(0xffffff) },
        uNext: { value: new Color(0xffffff) },
        uRes: { value: this.resolution },
      },
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.star = new Mesh(plane, this.starMaterial);
    this.star.frustumCulled = false;
    this.star.renderOrder = 20;

    const tri = new BufferGeometry();
    tri.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([0, 0.6, 0, -0.35, -0.3, 0.05, 0.42, -0.25, -0.04]), 3),
    );
    const seeds = new Float32Array(SHARD_MAX * 4);
    for (let i = 0; i < SHARD_MAX; i += 1) {
      seeds.set([hash01(i, 71), hash01(i, 72), hash01(i, 73), hash01(i, 74)], i * 4);
    }
    tri.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 4));
    this.geometries.push(tri);
    this.shardMaterial = new ShaderMaterial({
      vertexShader: SHARD_VERTEX,
      fragmentShader: SHARD_FRAGMENT,
      uniforms: {
        uBurst: { value: -1 },
        uRadius: { value: RIFT_RADIUS },
        uTime: { value: 0 },
        uInstab: { value: 0.5 },
        uNext: { value: new Color(0xffffff) },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.shards = new InstancedMesh(tri, this.shardMaterial, SHARD_MAX);
    this.shards.frustumCulled = false;
    this.shards.renderOrder = 21;

    this.warpMaterial = new ShaderMaterial({
      vertexShader: WARP_VERTEX,
      fragmentShader: WARP_FRAGMENT,
      uniforms: {
        uAmount: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uTint: { value: new Color(0xffffff) },
      },
      blending: AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.warp = new Mesh(fullscreen, this.warpMaterial);
    this.warp.frustumCulled = false;
    this.warp.renderOrder = 900;

    this.group.add(this.star, this.shards);
    this.group.matrixAutoUpdate = false;
  }

  setTier(tier: StoryTier) {
    this.shards.count = shardCount(tier);
  }

  /** The star for this frame. `portal` is the view through it (a display target). */
  set(
    state: RiftState,
    spec: RiftSpec,
    time: number,
    key: number,
    next: number,
    portal: Texture | null,
  ) {
    const u = this.starMaterial.uniforms;
    u.uRadius.value = state.radius;
    u.uSeed.value = state.seed;
    u.uCrack.value = state.crack;
    u.uInstab.value = 1 - spec.stability;
    u.uTime.value = time;
    u.uBurst.value = state.burst;
    (u.uKey.value as Color).setHex(key);
    (u.uNext.value as Color).setHex(next);
    u.tPortal.value = portal;
    u.uPortal.value = portal && state.portal ? 1 : 0;
    const s = this.shardMaterial.uniforms;
    s.uBurst.value = state.burst;
    s.uRadius.value = state.radius;
    s.uTime.value = time;
    s.uInstab.value = 1 - spec.stability;
    (s.uNext.value as Color).setHex(next);
    this.shards.visible = state.burst > 0 && state.burst < 0.6;
  }

  /** The warp streaks over the frame after a crossing (0 hides them). */
  setWarp(amount: number, time: number, aspect: number, tint: number) {
    const u = this.warpMaterial.uniforms;
    u.uAmount.value = amount;
    u.uTime.value = time;
    u.uAspect.value = aspect;
    (u.uTint.value as Color).setHex(tint);
    this.warp.visible = amount > 0.002;
  }

  /** Everything visible for a compile pass. */
  warm(on: boolean) {
    this.star.visible = true;
    this.shards.visible = on;
    this.warp.visible = on;
  }

  dispose() {
    this.group.removeFromParent();
    this.warp.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    this.starMaterial.dispose();
    this.shardMaterial.dispose();
    this.warpMaterial.dispose();
    this.shards.dispose();
  }
}

/** Where the rift's light sits, rift-local (just behind the plane). */
export const RIFT_LIGHT = new Vector3(0, 0, -0.8);
