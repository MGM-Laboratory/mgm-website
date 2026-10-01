import {
  BufferAttribute,
  Color,
  DoubleSide,
  InstancedBufferGeometry,
  Mesh,
  Plane,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  type Texture,
} from "three";

import type { StoryContext, StoryPointerEvent, StoryTier } from "@/components/story/engine/act";
import { ensureCardKit } from "@/components/story/props/shared";
import { STAR_SDF_GLSL } from "@/components/story/props/fx/star-sdf.glsl";

import {
  GLSL_COMMON,
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
import { PAPER_PALETTE, PAPER_SKY_GLSL } from "./paper-sky.glsl";
import { World, type WorldFrame } from "./world";

/**
 * World 01, Paper Tide: "The deck she came from becomes an ocean, and she
 * learns to skim it." A sea of card backs rolling in long swells under a
 * blue sky and one big yellow sun. She bursts out of the wormhole high in the
 * sky, dives, and skims the cards like a surfer, still wobbly: one stumble
 * (a splash of cards), then a wave curls over her into a tube of cards and
 * she rides it out with a grin. Cards flip to their white faces in her wake.
 *
 * The near sea is one instanced draw (cards placed by `gl_InstanceID` on a
 * grid that wraps around the camera and flows with the treadmill, waves and
 * flips in the vertex shader); beyond it the sky layer paints the same
 * cards flat into the haze, so the ocean has no edge.
 */

/** Her skim line: x as a function of z (the sea shader has the same function). */
export function paperPathX(z: number) {
  const env = ease01(z, 34, 8) * (1 - ease01(z, -118, -146));
  return (6 * Math.sin(z / 37) + 3 * Math.sin(z / 13 + 1)) * env;
}

const PATH_GLSL = /* glsl */ `
float smooth01(float a, float b, float x) {
  float t = clamp((x - a) / (b - a), 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}
float pathX(float z) {
  float env = smooth01(34.0, 8.0, z) * (1.0 - smooth01(-118.0, -146.0, z));
  return (6.0 * sin(z / 37.0) + 3.0 * sin(z / 13.0 + 1.0)) * env;
}
`;

/** The swell, shared by the cards and her ride (metres). */
function swell(x: number, z: number, t: number) {
  return (
    0.32 * Math.sin(x * 0.21 + z * 0.13 + t * 1.1) +
    0.22 * Math.sin(x * -0.17 + z * 0.29 + t * 1.7) +
    0.1 * Math.sin(x * 0.53 + z * 0.41 + t * 2.6)
  );
}

const WAVES_GLSL = /* glsl */ `
float swell(vec2 p, float t) {
  return 0.32 * sin(p.x * 0.21 + p.y * 0.13 + t * 1.1)
    + 0.22 * sin(p.x * -0.17 + p.y * 0.29 + t * 1.7)
    + 0.1 * sin(p.x * 0.53 + p.y * 0.41 + t * 2.6);
}
vec2 swellSlope(vec2 p, float t) {
  float dx = 0.32 * 0.21 * cos(p.x * 0.21 + p.y * 0.13 + t * 1.1)
    - 0.22 * 0.17 * cos(p.x * -0.17 + p.y * 0.29 + t * 1.7)
    + 0.1 * 0.53 * cos(p.x * 0.53 + p.y * 0.41 + t * 2.6);
  float dz = 0.32 * 0.13 * cos(p.x * 0.21 + p.y * 0.13 + t * 1.1)
    + 0.22 * 0.29 * cos(p.x * -0.17 + p.y * 0.29 + t * 1.7)
    + 0.1 * 0.41 * cos(p.x * 0.53 + p.y * 0.41 + t * 2.6);
  return vec2(dx, dz);
}
`;

const CELL = { x: 0.62, z: 0.98 };
const CARD = { w: 0.56, h: 0.94 };

const SEA_VERTEX = /* glsl */ `
uniform vec2 uGrid;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uFlowZ;
uniform vec3 uHer;
uniform float uWake;
uniform float uCurl;
uniform float uCurlZ;
uniform vec4 uSplash;
uniform vec4 uPointerSea;
uniform vec4 uTapSea;
uniform float uTapTime;
uniform float uReach;
attribute vec2 aCorner;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vEdge;
varying float vSeed;
${GLSL_COMMON}
${PATH_GLSL}
${WAVES_GLSL}
mat3 rotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
void main() {
  float id = float(gl_InstanceID);
  float i = mod(id, uGrid.x);
  float j = floor(id / uGrid.x);
  // Water space flows toward +z with the treadmill; the window follows the camera.
  float camWz = uCamPos.z - uFlowZ;
  float gx = floor(uCamPos.x / ${CELL.x.toFixed(2)}) + i - floor(uGrid.x * 0.5);
  float gz = floor(camWz / ${CELL.z.toFixed(2)}) + j - floor(uGrid.y * 0.78);
  vec3 base = vec3(gx * ${CELL.x.toFixed(2)}, 0.0, gz * ${CELL.z.toFixed(2)} + uFlowZ);
  vec3 seed = hash33(vec3(gx, gz, 11.0));
  vSeed = seed.x;
  // Flat toward the window's edge, where the sky layer's flat cards take over.
  vec2 rel = (base.xz - uCamPos.xz);
  float reach = 1.0 - smoothstep(uReach * 0.62, uReach, length(rel * vec2(1.6, 1.0)));
  vEdge = reach;
  float t = uTime;
  float h = swell(base.xz, t) * reach;
  vec2 g = swellSlope(base.xz, t) * reach;

  // Her wake: cards flip to their white faces behind her, then settle back.
  float behind = base.z - uHer.z;
  float lateral = abs(base.x - pathX(base.z));
  float wake = smoothstep(0.2, 2.2, behind) * (1.0 - smoothstep(7.0 + seed.y * 6.0, 26.0, behind))
    * (1.0 - smoothstep(0.7, 3.4, lateral)) * uWake;
  float flip = smoothstep(0.0, 1.0, wake * (1.15 + 0.3 * seed.z)) * 3.14159;
  float hop = sin(clamp(wake * 1.2, 0.0, 1.0) * 3.14159) * (0.25 + 0.25 * seed.y);

  // The splash of her stumble: cards kicked up and spinning.
  vec2 sd = base.xz - uSplash.xy;
  float sr = length(sd);
  float age = uSplash.z;
  float kick = age > 0.0 ? exp(-sr * sr * 0.18) * (1.0 - smoothstep(0.0, 1.6, age)) : 0.0;
  float air = kick * (2.4 + 2.0 * seed.x) * sin(clamp(age * 2.3, 0.0, 3.14159));

  // The cursor parts the cards a little; a tap sends a ring of flips outward.
  float pd = length(base.xz - uPointerSea.xy);
  float nudge = exp(-pd * pd * 0.35) * uPointerSea.z;
  float tapAge = uTime - uTapTime;
  float ring = tapAge > 0.0 && tapAge < 3.0 ? exp(-pow(length(base.xz - uTapSea.xy) - tapAge * 9.0, 2.0) * 0.6) * (1.0 - tapAge / 3.0) : 0.0;
  flip = max(flip, smoothstep(0.1, 0.9, ring) * 3.14159);
  hop += ring * 0.5 + nudge * 0.35;

  // Card corner in its own plane: long side along z.
  vec3 local = vec3(aCorner.x * ${CARD.w.toFixed(2)}, 0.0, aCorner.y * ${CARD.h.toFixed(2)});
  mat3 R = rotZ(flip + kick * seed.z * 9.0 * age) * rotX(kick * (seed.y - 0.5) * 8.0 * age + nudge * 0.4);
  vec3 n = R * vec3(0.0, 1.0, 0.0);
  local = R * local;
  // Tilt with the swell.
  mat3 tilt = rotX(atan(g.y)) * rotZ(-atan(g.x));
  local = tilt * local;
  n = tilt * n;
  vec3 p = base + vec3(0.0, h + hop + air, 0.0) + local;

  // The curl: on her left the sea rises into a wall that rolls over her into a tube.
  float dzc = base.z - uCurlZ;
  float curlZone = uCurl * smoothstep(-34.0, -12.0, dzc) * (1.0 - smoothstep(3.0, 14.0, dzc));
  if (curlZone > 0.001) {
    float px = pathX(base.z);
    float e = px - base.x;
    float tube = 3.1;
    float theta = clamp((e - 0.6) / 8.6, 0.0, 1.0) * 3.75 * curlZone;
    if (e > 0.6) {
      vec2 arc = vec2(px - tube * sin(theta), tube * (1.0 - cos(theta)));
      vec3 onArc = vec3(arc.x, arc.y, base.z);
      vec3 flat0 = vec3(base.x, 0.0, base.z);
      float k = smoothstep(0.0, 0.25, theta);
      vec3 anchor = mix(flat0, onArc, k);
      mat3 roll = rotZ(-theta);
      vec3 l2 = roll * (R * vec3(aCorner.x * ${CARD.w.toFixed(2)}, 0.0, aCorner.y * ${CARD.h.toFixed(2)}));
      p = anchor + vec3(0.0, h * (1.0 - k) + 0.05, 0.0) + l2;
      n = roll * (R * vec3(0.0, 1.0, 0.0));
    }
  }
  vUv = aCorner + 0.5;
  vNormal = n;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const SEA_FRAGMENT = /* glsl */ `
uniform sampler2D tBack;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uFreeze;
uniform vec3 uPaper;
uniform vec3 uFrontInk;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vEdge;
varying float vSeed;
${GLSL_COMMON}
${PAPER_SKY_GLSL}
${STAR_SDF_GLSL}
float roundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  vec2 q = (vUv - 0.5) * vec2(${CARD.w.toFixed(2)}, ${CARD.h.toFixed(2)});
  float d = roundBox(q, vec2(${(CARD.w / 2).toFixed(3)}, ${(CARD.h / 2).toFixed(3)}), 0.045);
  if (d > 0.0) discard;
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vWorld - uCamPos);
  bool top = dot(n, -view) > 0.0;
  if (!top) n = -n;
  // The top side (its normal toward the sky when the card lies flat) shows the back.
  bool backSide = gl_FrontFacing;
  vec3 col;
  if (backSide) {
    col = texture2D(tBack, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  } else {
    // A white face with a thin navy frame and a small compass star.
    float frame = smoothstep(0.012, 0.004, abs(d + 0.03));
    float star = sdFill(sdStar4(q, 0.085, 0.314), 0.004);
    col = mix(uPaper, uFrontInk, max(frame * 0.8, star * 0.85));
  }
  vec3 sd = normalize(uPaperSunDir);
  float lambert = 0.62 + 0.38 * max(dot(n, sd), 0.0) + 0.18 * n.y;
  col *= lambert;
  // Varnish: a glint of the sun and a little sky.
  vec3 r = reflect(view, n);
  float spec = pow(max(dot(r, sd), 0.0), 70.0);
  float fres = pow(1.0 - abs(dot(n, -view)), 4.0);
  col = mix(col, paperSky(r, uTime), 0.06 + 0.35 * fres);
  col += uPaperSun * spec * 1.3;
  float dist = length(vWorld - uCamPos);
  float fog = 1.0 - exp(-dist * 0.0045);
  col = mix(col, mix(uPaperHorizon, uPaperLow, 0.35), clamp(fog * 1.15, 0.0, 1.0));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

const SKY_BODY = /* glsl */ `
uniform float uTime;
uniform float uFlowZ;
uniform float uFreeze;
${GLSL_COMMON}
${PAPER_SKY_GLSL}
vec3 skyColour(vec3 d) {
  return freezeGrade(paperWorld(uCamPos, d, uTime, uFlowZ), uFreeze);
}
`;

function gridFor(tier: StoryTier) {
  return tier === "low"
    ? { x: 56, z: 92 }
    : tier === "medium"
      ? { x: 76, z: 120 }
      : { x: 96, z: 150 };
}

const GRID_MAX = gridFor("high");

function paperUniforms() {
  return {
    uPaperZenith: { value: new Color(PAPER_PALETTE.zenith) },
    uPaperSky: { value: new Color(PAPER_PALETTE.sky) },
    uPaperLow: { value: new Color(PAPER_PALETTE.low) },
    uPaperHorizon: { value: new Color(PAPER_PALETTE.horizon) },
    uPaperSun: { value: new Color(PAPER_PALETTE.sun) },
    uPaperNavy: { value: new Color(PAPER_PALETTE.navy) },
    uPaperSunDir: { value: new Vector3(0.18, 0.055, -1).normalize() },
  };
}

const SUN_DIR = new Vector3(0.18, 0.055, -1).normalize();

/** Where the wormhole's far mouth opens in this world, and its forward direction. */
export const PAPER_ENTRY = { at: new Vector3(0, 70, 260), forward: new Vector3(0, -0.25, -1) };
/** The rift she opens at the end. */
const PAPER_EXIT = { at: new Vector3(0, 6, -165), forward: new Vector3(0, 0, -1) };

const T_STUMBLE = 2.12;
const T_CURL_IN = 3.3;
const T_CURL_OUT = 4.4;

export class PaperTide extends World {
  readonly id = "paper" as const;
  readonly key = 0xf7bf33;
  readonly length = 5.5;
  private sea: Mesh | null = null;
  private seaMaterial: ShaderMaterial | null = null;
  private sky: ReturnType<typeof createSkyLayer> | null = null;
  private walk: Walk | null = null;
  private track: ShotTrack | null = null;
  private readonly her = new Vector3();
  private readonly dir = new Vector3();
  private readonly right = new Vector3();
  private readonly up = new Vector3(0, 1, 0);
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private readonly ray = new Raycaster();
  private readonly plane = new Plane(new Vector3(0, 1, 0), 0);
  private readonly hit = new Vector3();
  private readonly ndc = new Vector2();
  private pointerSea = new Vector3(0, 0, 0);
  private tapAt = new Vector2(0, -9999);
  private tapTime = -100;

  async build(ctx: StoryContext) {
    this.tier = ctx.tier;
    this.setBackground(PAPER_PALETTE.low);
    this.setFrames(PAPER_ENTRY.at, PAPER_ENTRY.forward, PAPER_EXIT.at, PAPER_EXIT.forward);
    const kit = await ensureCardKit(ctx);
    const paper = paperUniforms();
    const fullscreen = fullscreenGeometry();
    this.geometries.push(fullscreen);

    this.sky = createSkyLayer(fullscreen, SKY_BODY, {
      ...paper,
      uTime: this.uniforms.uTime,
      uFlowZ: { value: 0 },
      uFreeze: this.uniforms.uFreeze,
    });
    this.materials.push(this.sky.material);
    this.scene.add(this.sky.mesh);

    this.seaMaterial = this.createSea(kit.back, paper);
    this.materials.push(this.seaMaterial);
    const geometry = new InstancedBufferGeometry();
    geometry.setAttribute(
      "aCorner",
      new BufferAttribute(new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]), 2),
    );
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5]),
        3,
      ),
    );
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    geometry.instanceCount = GRID_MAX.x * GRID_MAX.z;
    this.geometries.push(geometry);
    this.sea = new Mesh(geometry, this.seaMaterial);
    this.sea.frustumCulled = false;
    this.scene.add(this.sea);
    this.setTier(ctx.tier);

    // Lights for her: a warm low sun ahead, sky fill above, the deep navy sea below.
    this.rig.hemi.color.setHex(0xb8cdf2);
    this.rig.hemi.groundColor.setHex(0x2d318a);
    this.rig.hemi.intensity = 1.1;
    this.rig.key.color.setHex(0xffe0a6);
    this.rig.key.intensity = 2.3;

    this.buildCourse();
  }

  private createSea(back: Texture, paper: ReturnType<typeof paperUniforms>) {
    const grid = gridFor(this.tier);
    return new ShaderMaterial({
      vertexShader: SEA_VERTEX,
      fragmentShader: SEA_FRAGMENT,
      uniforms: {
        ...paper,
        tBack: { value: back },
        uGrid: { value: new Vector2(grid.x, grid.z) },
        uCamPos: { value: new Vector3() },
        uTime: this.uniforms.uTime,
        uFreeze: this.uniforms.uFreeze,
        uFlowZ: { value: 0 },
        uHer: { value: new Vector3() },
        uWake: { value: 1 },
        uCurl: { value: 0 },
        uCurlZ: { value: 0 },
        uSplash: { value: new Vector4() },
        uPointerSea: { value: new Vector3() },
        uTapSea: { value: new Vector3() },
        uTapTime: { value: -100 },
        uReach: { value: grid.z * CELL.z * 0.6 },
        uPaper: { value: new Color(0xfbfaf6) },
        uFrontInk: { value: new Color(0x2d318a) },
      },
      side: DoubleSide,
      toneMapped: false,
    });
  }

  private buildCourse() {
    const entryHer = this.fromEntry(0, -0.9, -157);
    const entryDir = PAPER_ENTRY.forward.clone().normalize();
    const exitHer = this.fromExit(0, -1.3, 3.4);
    const points: Vector3[] = [
      entryHer,
      entryHer.clone().addScaledVector(entryDir, 22),
      new Vector3(-0.6, 9, 50),
      new Vector3(-1.4, 2.4, 26),
    ];
    for (let z = 8; z >= -132; z -= 14) {
      points.push(new Vector3(paperPathX(z), 0.95, z));
    }
    points.push(new Vector3(paperPathX(-146) * 0.5, 2.6, -146));
    points.push(new Vector3(0, 4.2, -156));
    points.push(exitHer);
    const course = new Course(points);
    this.walk = new Walk(course, this.length, (T) => {
      if (T < 0.75) return 98 + (27 - 98) * ease01(T, 0, 0.75);
      if (T < 4.5) return 27 + 3 * Math.sin(T * 2.3);
      return 27 + (6 - 27) * ease01(T, 4.5, this.length);
    });
    this.track = this.shots();
  }

  /** Her position, heading and right vector at course time `T`. */
  private place(T: number, time: number) {
    const walk = this.walk;
    if (!walk) return;
    const u = walk.u(T);
    walk.course.at(u, this.her);
    walk.course.tangent(u, this.dir);
    this.right.crossVectors(this.dir, this.up).normalize();
    // Riding the swell while she skims (life: the swell runs on the clock).
    const skim = ease01(T, 0.55, 0.85) * (1 - ease01(T, 4.35, 4.8));
    this.her.y += swell(this.her.x, this.her.z, time) * 0.75 * skim;
    // The stumble: a dip into the cards and a scramble back up.
    const s = lin01(T, T_STUMBLE - 0.08, T_STUMBLE + 0.5);
    this.her.y -= Math.sin(Math.min(1, s * 1.6) * Math.PI) * 0.55 * (s > 0 && s < 1 ? 1 : 0);
  }

  private shots(): ShotTrack {
    const her = this.her;
    const dir = this.dir;
    const right = this.right;
    const up = this.up;
    const a = this.a;
    const b = this.b;
    const at = (T: number) => {
      this.place(T, this.uniforms.uTime.value);
    };
    return new ShotTrack([
      {
        at: 0,
        blend: 0,
        shot: (T, out) => {
          at(T);
          chaseShot(out, her, dir);
          out.shake = 0.004;
          out.look = 0.03;
          out.roll = 0;
        },
      },
      {
        // Establishing: wide and low from her left, the sun ahead over her shoulder.
        at: 1.15,
        blend: 0.55,
        shot: (T, out) => {
          at(T);
          a.copy(right).negate();
          out.position
            .copy(her)
            .addScaledVector(a, 8.5)
            .addScaledVector(dir, -2.5)
            .addScaledVector(up, 1.3);
          out.target
            .copy(her)
            .addScaledVector(dir, 10)
            .addScaledVector(right, 3.5)
            .addScaledVector(up, 0.9);
          out.fov = 44;
          out.roll = 0.03;
          out.shake = 0.003;
          out.look = 0.04;
        },
      },
      {
        // Low tracking, three quarters behind, a hand's breadth over the cards.
        at: 1.85,
        blend: 0.45,
        shot: (T, out) => {
          at(T);
          a.copy(right).negate();
          out.position
            .copy(her)
            .addScaledVector(dir, -4.8)
            .addScaledVector(a, 1.6)
            .addScaledVector(up, 0.3);
          out.target.copy(her).addScaledVector(dir, 7).addScaledVector(up, 0.55);
          out.fov = 52;
          out.roll = -0.02;
          out.shake = 0.007 - 0.004 * ease01(T, 1.9, 3.2);
          out.look = 0.03;
        },
      },
      {
        // The stumble: a jolt in, the lens wider, the handheld kicks.
        at: T_STUMBLE + 0.04,
        blend: 0.12,
        shot: (T, out) => {
          at(T);
          a.copy(right).negate();
          out.position
            .copy(her)
            .addScaledVector(dir, -3.4)
            .addScaledVector(a, 1.0)
            .addScaledVector(up, 0.45);
          out.target.copy(her).addScaledVector(dir, 4).addScaledVector(up, 0.5);
          out.fov = 58;
          out.roll = 0.05;
          out.shake = 0.014;
          out.look = 0.02;
        },
      },
      {
        at: T_STUMBLE + 0.62,
        blend: 0.3,
        shot: (T, out) => {
          at(T);
          a.copy(right).negate();
          out.position
            .copy(her)
            .addScaledVector(dir, -4.8)
            .addScaledVector(a, 1.6)
            .addScaledVector(up, 0.3);
          out.target.copy(her).addScaledVector(dir, 7).addScaledVector(up, 0.55);
          out.fov = 52;
          out.roll = -0.02;
          out.shake = 0.004;
          out.look = 0.03;
        },
      },
      {
        // Inside the curl: behind her, low, the tube of cards rolling overhead.
        at: T_CURL_IN + 0.12,
        blend: 0.38,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(dir, -5.6)
            .addScaledVector(right, 0.5)
            .addScaledVector(up, 0.75);
          out.target
            .copy(her)
            .addScaledVector(dir, 12)
            .addScaledVector(up, 0.9)
            .addScaledVector(right, -0.6);
          out.fov = 62;
          out.roll = -0.09;
          out.shake = 0.003;
          out.look = 0.03;
        },
      },
      {
        // Leading: ahead of her, looking back at her grin as she rides out.
        at: T_CURL_OUT + 0.15,
        blend: 0.35,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(dir, 6.5)
            .addScaledVector(right, 2.2)
            .addScaledVector(up, 0.9);
          b.copy(her).addScaledVector(up, 1.2);
          out.target.copy(b);
          out.fov = 40;
          out.roll = 0.02;
          out.shake = 0.002;
          out.look = 0.04;
        },
      },
      {
        // Behind her again as she climbs toward the light ahead.
        at: 5.12,
        blend: 0.4,
        shot: (T, out) => {
          at(T);
          out.position
            .copy(her)
            .addScaledVector(dir, -9)
            .addScaledVector(up, 1.8)
            .addScaledVector(right, 1.2);
          out.target.copy(her).addScaledVector(dir, 14).addScaledVector(up, 0.4);
          out.fov = 48;
          out.roll = 0;
          out.shake = 0.002;
          out.look = 0.03;
        },
      },
    ]);
  }

  course(T: number, pose: FlightPose, shot: CameraShot, time: number) {
    const walk = this.walk;
    if (!walk || !this.track) return;
    this.track.sample(T, shot);
    this.place(T, time);
    pose.position.copy(this.her);
    pose.heading.copy(this.dir);
    const speed = walk.profile(T);
    pose.velocity.copy(this.dir).multiplyScalar(speed + 6);
    const u = walk.u(T);
    const dive = 1 - ease01(T, 0.35, 0.8);
    const skim = ease01(T, 0.45, 0.85) * (1 - ease01(T, 4.4, 4.95));
    const glide = ease01(T, 4.4, 4.95);
    const stumble = lin01(T, T_STUMBLE - 0.1, T_STUMBLE + 0.55);
    const flail =
      Math.sin(Math.min(1, stumble * 1.4) * Math.PI) * (stumble > 0 && stumble < 1 ? 1 : 0);
    const deg = Math.PI / 180;
    pose.pitch = deg * (85 * dive + 25 * skim + 80 * glide + 18 * flail);
    pose.yaw = -25 * deg * skim * (1 - flail * 0.6);
    pose.roll = 0;
    pose.spin = 0;
    // Still wobbly: the sway is loose and the bank overshoots.
    pose.bank =
      walk.course.bank(u, speed, 0.75) +
      0.22 * Math.sin(time * 2.6) * skim * (1 - ease01(T, 3.2, 4.2));
    pose.lean = 0.12 * Math.sin(time * 1.9 + 0.7) * skim + 0.25 * flail;
    pose.sway = 1;
    pose.layers = [
      { clip: "fly_superhero", weight: dive },
      { clip: "fly_skim", weight: skim * (1 - flail * 0.7) },
      {
        clip: "balance_glide",
        weight: skim * flail * 0.7 + 0.12 * skim * (1 - ease01(T, 2.8, 3.4)),
      },
      { clip: "fly_glide", weight: glide },
    ];
    const curl =
      ease01(T, T_CURL_IN, T_CURL_IN + 0.3) * (1 - ease01(T, T_CURL_OUT - 0.1, T_CURL_OUT + 0.2));
    pose.face =
      flail > 0.2
        ? "oh_no"
        : curl > 0.3 || glide > 0.3
          ? "big_smile"
          : T < 0.6
            ? "surprised"
            : "auto";
    pose.faceWeight = 1;
    pose.glow = 0.9 + 0.3 * curl;
    pose.glowColor = 0xf7bf33;
    pose.rim = 0.7;
    pose.rimColor = 0xfff1d0;
    pose.lift = 0.06;
    pose.look = null;
    pose.lookWeight = 0;
    pose.nervous = 0.25 * skim * (1 - ease01(T, 3.0, 3.6));
    pose.visible = true;
  }

  frame(ctx: StoryContext, f: WorldFrame) {
    const u = this.uniforms;
    u.uTime.value = f.time;
    u.uFreeze.value = f.freeze;
    u.uFlow.value = f.flow;
    const sea = this.seaMaterial;
    const sky = this.sky;
    if (!sea || !sky) return;
    const flowZ = f.flow * 7;
    sky.uniforms.uFlowZ.value = flowZ;
    sea.uniforms.uFlowZ.value = flowZ;
    sky.aim(f.camera);
    (sea.uniforms.uCamPos.value as Vector3).copy(f.camera.position);
    // The splash spot first (it walks the course), then her, which the rest uses.
    this.place(T_STUMBLE + 0.06, f.time);
    const splash = sea.uniforms.uSplash.value as Vector4;
    splash.set(this.her.x, this.her.z - 1.2, (f.T - (T_STUMBLE + 0.02)) * 1.25, 0);
    this.place(Math.max(0, f.T), f.time);
    (sea.uniforms.uHer.value as Vector3).copy(this.her);
    sea.uniforms.uWake.value = ease01(f.T, 0.6, 0.95) * (1 - ease01(f.T, 4.6, 5.1));
    sea.uniforms.uCurl.value =
      ease01(f.T, T_CURL_IN - 0.25, T_CURL_IN + 0.1) *
      (1 - ease01(f.T, T_CURL_OUT, T_CURL_OUT + 0.35));
    sea.uniforms.uCurlZ.value = this.her.z;
    (sea.uniforms.uPointerSea.value as Vector3).copy(this.pointerSea);
    (sea.uniforms.uTapSea.value as Vector3).set(this.tapAt.x, this.tapAt.y, 1);
    sea.uniforms.uTapTime.value = this.tapTime;
    // The pointer's spot on the sea (mouse only), eased in and out.
    const pointer = ctx.pointer;
    let strength = 0;
    if (f.view === "main" && pointer.type === "mouse" && pointer.inside) {
      this.ndc.set(pointer.ndc.x, pointer.ndc.y);
      this.ray.setFromCamera(this.ndc, f.camera);
      if (
        this.ray.ray.intersectPlane(this.plane, this.hit) &&
        this.hit.distanceTo(f.camera.position) < 60
      ) {
        this.pointerSea.x = this.hit.x;
        this.pointerSea.y = this.hit.z;
        strength = 1;
      }
    }
    this.pointerSea.z += (strength - this.pointerSea.z) * 0.12;
    // Her light: the low sun ahead, along the sky's own sun direction.
    this.rig.key.position.copy(this.her).addScaledVector(SUN_DIR, 30);
    this.rig.key.target.position.copy(this.her);
    this.rig.key.target.updateMatrixWorld();
  }

  pointer(ctx: StoryContext, event: StoryPointerEvent, time: number) {
    if (event.type !== "tap") return false;
    this.ndc.set(event.ndc.x, event.ndc.y);
    this.ray.setFromCamera(this.ndc, ctx.stage.camera);
    if (this.ray.ray.intersectPlane(this.plane, this.hit)) {
      this.tapAt.set(this.hit.x, this.hit.z);
      this.tapTime = time;
      return true;
    }
    return false;
  }

  setTier(tier: StoryTier) {
    super.setTier(tier);
    const grid = gridFor(tier);
    const mesh = this.sea;
    const material = this.seaMaterial;
    if (!mesh || !material) return;
    (mesh.geometry as InstancedBufferGeometry).instanceCount = grid.x * grid.z;
    (material.uniforms.uGrid.value as Vector2).set(grid.x, grid.z);
    material.uniforms.uReach.value = grid.z * CELL.z * 0.6;
  }
}
