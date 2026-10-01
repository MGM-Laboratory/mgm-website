import {
  Color,
  DataTexture,
  DataUtils,
  HalfFloatType,
  LinearFilter,
  Matrix3,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type IUniform,
  type ShaderMaterial,
  type WebGLRenderer,
} from "three";

import type { StoryContext } from "@/components/story/engine/act";
import type { StoryTvFeed } from "@/components/story/props/shared";

import {
  ARRIVAL_CHASE,
  GLSL_COMMON,
  RendererState,
  createScreenPass,
  ease01,
  lin01,
  type CameraShot,
  type FlightPose,
} from "./common";
import { PAPER_PALETTE, PAPER_SKY_GLSL } from "./paper-sky.glsl";

/**
 * The wormhole (`w-hole`): the TV's portal grown to the whole screen. A
 * spherical wormhole of the Double Negative shape (research/inspiration.md
 * 3.5) seen from our side: a navy sky of brand stars bending around a sphere
 * that holds World 01's sky and sea, ringed by light. She dives in, small and
 * silhouetted, the stars stretch, and the camera follows her through the
 * throat into Paper Tide.
 *
 * The rays are traced once in `init` (a lookup of the bend angle and the side
 * a ray ends on, for every camera distance and every angle to the axis), so
 * the pixel shader does no marching: it reads the table, turns the ray and
 * paints the sky it lands in. The same shader draws the TV feed for the table
 * act (`StoryTvFeed`), from the camera the dive ends on.
 *
 * Frame (wormhole-local): the centre at the origin, the camera starts on +z
 * and flies along -z; metres, the throat radius `HOLE_RADIUS`.
 */

export const HOLE_RADIUS = 40;
/** The camera's distance from the centre when the dive into the TV hands over. */
export const HOLE_START = 9.5 * HOLE_RADIUS;
/** Where in `w-hole` the camera passes the throat, and where the cut to World 01 sits. */
export const HOLE_THROAT = 0.74;
export const HOLE_CUT = 0.86;
/** The TV screen's aspect (room anchors: 0.9522 x 0.5508 m). */
export const TV_ASPECT = 0.9522 / 0.5508;
/** The feed camera's vertical FOV, degrees. */
export const FEED_FOV = 40;

// Shape of the wormhole, in units of the throat radius.
const SHAPE_A = 0.015;
const SHAPE_W = 0.42;
const SHAPE_M = SHAPE_W / 1.42953;
const LUT_PSI = 512;
const LUT_ELL = 48;
const LUT_ELL_MAX = 12;

function radiusAt(l: number) {
  const al = Math.abs(l);
  if (al <= SHAPE_A) return 1;
  const x = (2 * (al - SHAPE_A)) / (Math.PI * SHAPE_M);
  return 1 + SHAPE_M * (x * Math.atan(x) - 0.5 * Math.log(1 + x * x));
}

function slopeAt(l: number) {
  const al = Math.abs(l);
  if (al <= SHAPE_A) return 0;
  const x = (2 * (al - SHAPE_A)) / (Math.PI * SHAPE_M);
  return Math.sign(l) * (2 / Math.PI) * Math.atan(x);
}

/** l (throat units) for a distance from the centre on our side (bisection; r(l) grows with l). */
export function ellForRadius(r: number) {
  if (r <= 1) return 0;
  let lo = 0;
  let hi = r + 4;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (radiusAt(mid) < r) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * One ray in the equatorial plane: from camera `lc` at angle `psi` to the
 * axis (+l). Returns the final angle travelled (with the flat tail added),
 * the side it escapes to and how close it came to winding around the throat.
 */
function trace(psi: number, lc: number): [number, number, number] {
  const b = radiusAt(lc) * Math.sin(psi);
  let l = lc;
  let phi = 0;
  let pl = Math.cos(psi);
  const deriv = (ll: number, p: number): [number, number, number] => {
    const r = radiusAt(ll);
    return [p, b / (r * r), (b * b * slopeAt(ll)) / (r * r * r)];
  };
  let steps = 0;
  while (Math.abs(l) < 40 && steps < 2400) {
    const r = radiusAt(l);
    const h = Math.min(0.9, Math.max(0.004, 0.045 * r));
    const k1 = deriv(l, pl);
    const k2 = deriv(l + 0.5 * h * k1[0], pl + 0.5 * h * k1[2]);
    const k3 = deriv(l + 0.5 * h * k2[0], pl + 0.5 * h * k2[2]);
    const k4 = deriv(l + h * k3[0], pl + h * k3[2]);
    l += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    phi += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    pl += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    steps += 1;
  }
  const rEnd = radiusAt(l);
  const tail = Math.asin(Math.min(1, b / Math.max(rEnd, 1e-3)));
  const wind = Math.min(1, Math.max(0, (phi - 2.2) / 3));
  return [phi + tail, l >= 0 ? 1 : -1, wind];
}

let lutPromise: Promise<Uint16Array> | null = null;

/** The lookup, traced in slices so no task runs long (cached for the visit). */
function traceLut(yieldNow: () => Promise<void>): Promise<Uint16Array> {
  if (lutPromise) return lutPromise;
  lutPromise = (async () => {
    const data = new Uint16Array(LUT_PSI * LUT_ELL * 4);
    let sliceStart = performance.now();
    for (let j = 0; j < LUT_ELL; j += 1) {
      const v = -1 + (2 * j) / (LUT_ELL - 1);
      const lc = LUT_ELL_MAX * Math.sign(v) * v * v;
      for (let i = 0; i < LUT_PSI; i += 1) {
        const psi = (Math.PI * i) / (LUT_PSI - 1);
        const [phi, side, wind] = trace(psi, lc);
        data.set(
          [
            DataUtils.toHalfFloat(phi),
            DataUtils.toHalfFloat(side),
            DataUtils.toHalfFloat(wind),
            DataUtils.toHalfFloat(1),
          ],
          (j * LUT_PSI + i) * 4,
        );
        if (performance.now() - sliceStart > 8) {
          await yieldNow();
          sliceStart = performance.now();
        }
      }
    }
    return data;
  })();
  return lutPromise;
}

const HOLE_FRAGMENT = /* glsl */ `
uniform sampler2D tLut;
uniform float uTime;
uniform float uFlow;
uniform float uFreeze;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform vec2 uTan;
uniform float uEll;
uniform vec3 uAxis;
uniform float uStreak;
uniform vec3 uForward;
uniform float uPix;
uniform int uSamples;
uniform mat3 uToPaper;
uniform vec3 uPaperEye;
uniform vec3 uSpace;
uniform vec3 uSpaceBand;
uniform vec3 uStarBlue;
uniform vec3 uStarYellow;
uniform vec3 uRing;
uniform float uFlipY;
varying vec2 vUv;
${GLSL_COMMON}
${PAPER_SKY_GLSL}

const float PI = 3.14159265;

float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = hash31(i);
  float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// Stars on a cube-face grid: a soft dot per lit cell, brand tinted.
vec3 starCell(vec3 d, float scale, float density, float salt) {
  vec3 a = abs(d);
  vec2 uv;
  float face;
  if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
  else if (a.y > a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
  else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
  vec2 g = uv * scale;
  vec2 cell = floor(g);
  vec3 h = hash33(vec3(cell, face * 7.0 + salt));
  if (h.z < 1.0 - density) return vec3(0.0);
  vec2 pos = 0.15 + 0.7 * h.xy;
  float dist = length(fract(g) - pos) / scale;
  float size = uPix * (0.55 + 0.9 * h.x * h.x);
  float glint = exp(-dist * dist / (size * size));
  float tw = 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * h.y) + h.x * 40.0);
  vec3 tint = h.y > 0.86 ? uStarYellow : h.y > 0.52 ? uStarBlue : vec3(1.0);
  return tint * glint * tw * (0.25 + 1.1 * h.y * h.y * h.y);
}

vec3 stars(vec3 d) {
  return starCell(d, 22.0, 0.12, 1.0) + starCell(d, 55.0, 0.08, 2.0) * 0.7 + starCell(d, 130.0, 0.06, 3.0) * 0.45;
}

// Our side of the wormhole: navy space, a brand nebula, guilloche filaments and stars.
vec3 space(vec3 d) {
  float n = vnoise3(d * 2.2 + vec3(0.0, uTime * 0.01, 0.0)) * 0.6 + vnoise3(d * 5.1) * 0.4;
  float band = exp(-abs(d.y + 0.25 * d.x) * 2.6);
  vec3 col = mix(uSpace, uSpaceBand, clamp(band * n * n * 0.9, 0.0, 0.7));
  float fil = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 axis = normalize(vec3(sin(fi * 2.1 + 0.4), 0.55 + 0.2 * fi, cos(fi * 1.7)));
    float lat = dot(d, axis);
    float lon = atan(dot(d, cross(axis, vec3(0.0, 0.0, 1.0))), dot(d, vec3(0.0, 0.0, 1.0)));
    float w = lat - 0.07 * sin(lon * (4.0 + fi) + uTime * 0.04 + fi);
    fil += exp(-abs(w) * 260.0) * 0.16;
  }
  col += uStarBlue * fil;
  // Stars, streaked toward where we fly when we fly fast.
  vec3 acc = vec3(0.0);
  vec3 radial = d - uForward * dot(d, uForward);
  for (int k = 0; k < 6; k++) {
    if (k >= uSamples) break;
    float s = float(k) / max(1.0, float(uSamples - 1));
    vec3 dk = normalize(d - radial * uStreak * s);
    acc = max(acc, stars(dk));
  }
  return col + acc;
}

void main() {
  vec2 uv = vec2(vUv.x, mix(vUv.y, 1.0 - vUv.y, uFlipY));
  vec2 ndc = uv * 2.0 - 1.0;
  vec3 N = normalize(uCamRot * vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));
  float c = clamp(dot(N, uAxis), -1.0, 1.0);
  float psi = acos(c);
  float x = psi / PI;
  float v = sign(uEll) * sqrt(clamp(abs(uEll) / ${LUT_ELL_MAX.toFixed(1)}, 0.0, 1.0));
  vec2 lutUv = vec2((x * ${(LUT_PSI - 1).toFixed(1)} + 0.5) / ${LUT_PSI.toFixed(1)}, ((v * 0.5 + 0.5) * ${(LUT_ELL - 1).toFixed(1)} + 0.5) / ${LUT_ELL.toFixed(1)});
  vec4 lut = texture2D(tLut, lutUv);
  vec3 t = N - c * uAxis;
  float tl = length(t);
  t = tl > 1e-5 ? t / tl : normalize(cross(uAxis, vec3(0.31, 0.83, 0.47)));
  float phi = lut.r;
  float side = lut.g;
  vec3 dUp = cos(phi) * uAxis + sin(phi) * t;
  vec3 dDown = -cos(phi) * uAxis + sin(phi) * t;
  float k = smoothstep(-0.35, 0.35, side);
  vec3 col = vec3(0.0);
  if (k > 0.001) col += space(dUp) * k;
  if (k < 0.999) col += paperWorld(uPaperEye, normalize(uToPaper * dDown), uTime, uFlow) * (1.0 - k);
  // The ring of light where the two skies meet, brighter where rays wind around the throat.
  float edge = 1.0 - abs(side);
  float ring = edge * edge * edge * 1.1 + lut.b * 0.45;
  col += uRing * ring * (0.85 + 0.15 * sin(uTime * 2.0 + psi * 30.0));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

const LINEAR = (hex: number) => new Color(hex);

/** The uniforms of the wormhole pass (one object, shared by the main view and the feed). */
function holeUniforms(lut: DataTexture): Record<string, IUniform> {
  return {
    tLut: { value: lut },
    uTime: { value: 0 },
    uFlow: { value: 0 },
    uFreeze: { value: 0 },
    uCamPos: { value: new Vector3() },
    uCamRot: { value: new Matrix3() },
    uTan: { value: new Vector2(1, 1) },
    uEll: { value: LUT_ELL_MAX },
    uAxis: { value: new Vector3(0, 0, 1) },
    uStreak: { value: 0 },
    uForward: { value: new Vector3(0, 0, -1) },
    uPix: { value: 0.002 },
    uSamples: { value: 4 },
    uToPaper: { value: new Matrix3() },
    uPaperEye: { value: new Vector3(0, 60, 0) },
    uSpace: { value: LINEAR(0x070a1f) },
    uSpaceBand: { value: LINEAR(0x1a2063) },
    uStarBlue: { value: LINEAR(0x86a8ff) },
    uStarYellow: { value: LINEAR(0xf7bf33) },
    uRing: { value: LINEAR(0xffe6a6) },
    uFlipY: { value: 0 },
    uPaperZenith: { value: LINEAR(PAPER_PALETTE.zenith) },
    uPaperSky: { value: LINEAR(PAPER_PALETTE.sky) },
    uPaperLow: { value: LINEAR(PAPER_PALETTE.low) },
    uPaperHorizon: { value: LINEAR(PAPER_PALETTE.horizon) },
    uPaperSun: { value: LINEAR(PAPER_PALETTE.sun) },
    uPaperNavy: { value: LINEAR(PAPER_PALETTE.navy) },
    uPaperSunDir: { value: new Vector3(0.18, 0.055, -1).normalize() },
  };
}

const camRot = new Matrix3();
const toWorld = new Matrix4();
const tmp = new Vector3();

/**
 * Camera distance from the centre (unfolded: negative once through the
 * throat) as the dive goes, `w-hole` progress `p`. Slow at first (the
 * picture still matches the TV), then a long acceleration into the throat.
 */
export function holeDistance(p: number) {
  if (p <= HOLE_THROAT) {
    const k = p / HOLE_THROAT;
    return HOLE_START * (1 - (0.35 * k + 0.65 * k * k * k));
  }
  const k = (p - HOLE_THROAT) / (1 - HOLE_THROAT);
  return -HOLE_RADIUS * 3.6 * k * (1.4 - 0.4 * k);
}

/** Camera speed along the dive, metres per vh (for the streaks and her hair). */
function holeSpeed(p: number) {
  const h = 0.002;
  return (
    Math.abs(holeDistance(Math.min(1, p + h)) - holeDistance(Math.max(0, p - h))) / (2 * h * 2)
  );
}

/** The vertical FOV of the w-hole camera at p = 0 for a viewport `aspect`: the TV's crop at full cover. */
export function coverFov(aspect: number) {
  const shown = Math.min(1, TV_ASPECT / Math.max(aspect, 1e-3));
  const tanV = Math.tan((FEED_FOV * Math.PI) / 360) * shown;
  return (2 * Math.atan(tanV) * 180) / Math.PI;
}

/**
 * Her pose and the camera for `w-hole` progress `p`, wormhole-local. At
 * p = 0 the camera is exactly the feed's (so the full-cover TV frame and the
 * first frame here are the same picture), and she is ahead of it, small, at
 * about (0, -0.12) of the frame.
 */
export function holeChoreo(
  p: number,
  aspect: number,
  pose: FlightPose,
  shot: CameraShot,
  time: number,
) {
  const s = holeDistance(p);
  const nearThroat = 1 - ease01(Math.abs(s), HOLE_RADIUS * 0.4, HOLE_RADIUS * 3);
  const out = ease01(p, HOLE_THROAT, 1);
  const drift = (1 - nearThroat) * ease01(p, 0.04, 0.4) * (1 - out);
  shot.position.set(6 * Math.sin(p * 5.1) * drift, 3.2 * Math.sin(p * 3.7 + 0.6) * drift, s);
  const startFov = coverFov(aspect);
  shot.fov =
    startFov +
    (54 - startFov) * ease01(p, 0.02, 0.4) +
    10 * ease01(p, 0.45, HOLE_THROAT) -
    14 * out;
  // Ahead of the camera: far and low at first (the TV's last frame), then
  // closer, then the arrival chase every world starts from.
  const gap =
    p < HOLE_THROAT ? 26 - 14 * ease01(p, 0, HOLE_THROAT) : 12 + (ARRIVAL_CHASE.back - 12) * out;
  const tanV = Math.tan((shot.fov * Math.PI) / 360);
  const drop = (0.12 * gap * tanV + 1.0) * (1 - out) + ARRIVAL_CHASE.up * out;
  const weave = 1.2 * Math.sin(time * 0.9) * ease01(p, 0.05, 0.3) * (1 - out);
  pose.position.set(shot.position.x * 0.4 * (1 - out) + weave, shot.position.y - drop, s - gap);
  const farTarget = new Vector3(pose.position.x * 0.6, shot.position.y - drop * 0.4, s - gap * 4);
  const chaseTarget = new Vector3(
    pose.position.x,
    pose.position.y + ARRIVAL_CHASE.lift,
    pose.position.z - ARRIVAL_CHASE.ahead,
  );
  shot.target.lerpVectors(farTarget, chaseTarget, out);
  shot.roll = 0.05 * Math.sin(p * 4.2) * drift;
  shot.shake = 0.002 + 0.004 * ease01(p, 0.4, HOLE_THROAT) * (1 - ease01(p, HOLE_THROAT, HOLE_CUT));
  shot.look = 0.03;

  pose.heading.set(0, 0, -1);
  pose.pitch = (85 * Math.PI) / 180;
  pose.roll = 0.12 * Math.sin(time * 0.7);
  pose.yaw = 0;
  pose.spin = 0;
  pose.bank = 0.15 * Math.sin(p * 6);
  pose.lean = 0;
  pose.velocity.set(0, 0, -Math.min(40, holeSpeed(p)));
  pose.sway = 0.8;
  pose.layers = [
    { clip: "fly_superhero", weight: 1 - ease01(p, 0.4, 0.6) * 0.6 },
    { clip: "fly_glide", weight: ease01(p, 0.4, 0.6) * 0.6 },
  ];
  pose.face = p < 0.4 ? "determined" : "big_smile";
  pose.faceWeight = 1;
  pose.glow = 1.15;
  pose.glowColor = 0xf7bf33;
  pose.rim = 1.6;
  pose.rimColor = 0xffe6a6;
  pose.lift = 0.05;
  pose.look = null;
  pose.lookWeight = 0;
  pose.nervous = 0;
  pose.visible = true;
}

/** The speed cue for the stars, 0..~0.25. */
export function holeStreak(p: number) {
  return (
    Math.min(0.28, holeSpeed(p) / 9000) * (1 - ease01(p, HOLE_THROAT - 0.02, HOLE_THROAT + 0.04))
  );
}

/**
 * The wormhole pass and the TV feed. `render(target, camera)` draws the
 * wormhole as seen from `camera` into `target` (a display target for the
 * act's own view, the feed's sRGB target for the TV).
 */
export class WormholePass {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly material: ShaderMaterial;
  readonly lut: DataTexture;
  readonly feedCamera = new PerspectiveCamera(FEED_FOV, TV_ASPECT, 0.1, 1000);
  readonly feedTarget: WebGLRenderTarget;
  private readonly state = new RendererState();
  private disposed = false;

  constructor(geometry: BufferGeometry, data: Uint16Array) {
    this.lut = new DataTexture(data, LUT_PSI, LUT_ELL, RGBAFormat, HalfFloatType);
    this.lut.magFilter = LinearFilter;
    this.lut.minFilter = LinearFilter;
    this.lut.generateMipmaps = false;
    this.lut.needsUpdate = true;
    const pass = createScreenPass(geometry, HOLE_FRAGMENT, holeUniforms(this.lut));
    this.material = pass.material;
    this.scene.add(pass.mesh);
    this.feedCamera.position.set(0, 0, HOLE_START);
    this.feedCamera.lookAt(0, 0, 0);
    this.feedCamera.updateMatrixWorld(true);
    // A standard sRGB target: linear contents in SRGB8_ALPHA8 storage, what three's materials expect to sample.
    this.feedTarget = new WebGLRenderTarget(640, Math.round(640 / TV_ASPECT), {
      type: UnsignedByteType,
      depthBuffer: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      generateMipmaps: false,
    });
    this.feedTarget.texture.colorSpace = SRGBColorSpace;
    this.feedTarget.texture.name = "worlds-tv-feed";
  }

  static async create(geometry: BufferGeometry, yieldNow: () => Promise<void>) {
    const data = await traceLut(yieldNow);
    return new WormholePass(geometry, data);
  }

  /** Points the pass at `camera` (any camera: the stage's, the feed's). */
  aim(camera: PerspectiveCamera, holeToPaper: Matrix4, paperEye: Vector3, height: number) {
    const u = this.material.uniforms;
    camera.updateMatrixWorld();
    camRot.setFromMatrix4(camera.matrixWorld);
    (u.uCamRot.value as Matrix3).copy(camRot);
    (u.uCamPos.value as Vector3).copy(camera.position);
    const tanV = Math.tan((camera.fov * Math.PI) / 360) / Math.max(1e-3, camera.zoom);
    (u.uTan.value as Vector2).set(tanV * camera.aspect, tanV);
    const r = camera.position.length() / HOLE_RADIUS;
    const through = camera.position.z < 0;
    const ell = ellForRadius(Math.max(1, r));
    u.uEll.value = Math.max(-LUT_ELL_MAX, Math.min(LUT_ELL_MAX, through ? -ell : ell));
    tmp.copy(camera.position);
    if (tmp.lengthSq() < 1e-6) tmp.set(0, 0, 1);
    tmp.normalize();
    if (through) tmp.negate();
    (u.uAxis.value as Vector3).copy(tmp);
    u.uPix.value = (2 * tanV) / Math.max(64, height);
    toWorld.copy(holeToPaper);
    (u.uToPaper.value as Matrix3).setFromMatrix4(toWorld);
    (u.uPaperEye.value as Vector3).copy(paperEye);
  }

  /** Draws into `target` (null: the current one); saves and restores the renderer's state. */
  render(renderer: WebGLRenderer, target: WebGLRenderTarget, flipY = false) {
    if (this.disposed) return;
    this.state.save(renderer);
    this.material.uniforms.uFlipY.value = flipY ? 1 : 0;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(this.scene, this.camera);
    this.state.restore(renderer);
  }

  set(time: number, flow: number, freeze: number, streak: number, samples: number) {
    const u = this.material.uniforms;
    u.uTime.value = time;
    u.uFlow.value = flow;
    u.uFreeze.value = freeze;
    u.uStreak.value = streak;
    u.uSamples.value = samples;
  }

  /** Resizes the feed so the TV stays sharp when it fills the screen. */
  sizeFeed(ctx: StoryContext, scale: number) {
    const w = Math.max(512, Math.min(1400, Math.round(ctx.size.width * ctx.size.dpr * scale)));
    const h = Math.round(w / TV_ASPECT);
    if (this.feedTarget.width !== w || this.feedTarget.height !== h) this.feedTarget.setSize(w, h);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.material.dispose();
    this.lut.dispose();
    this.feedTarget.dispose();
  }
}

/**
 * The live picture for the TV (`ctx.props` "tvFeed"). The table act calls
 * `update()` while the screen is on and maps `texture` on `tv_screen`.
 *
 * Contract (docs: state/worlds-docs.md):
 * - `texture` is a plain render target: sample it at (vUv.x, 1.0 - vUv.y)
 *   on the screen quad (whose UV origin is its top left). It is a standard
 *   sRGB texture with linear contents: a built-in material shows it as it
 *   is; in a ShaderMaterial the sample is linear (end with
 *   `linearToOutputTexel`, `toneMapped: false`).
 * - The picture is the wormhole seen by the camera the worlds act starts
 *   from at `w-hole` 0 (FOV `FEED_FOV` at the screen's aspect), so a dive
 *   that ends with the screen exactly covering the viewport
 *   (`screenFillDistance(tv, aspect, fov, 0)`) cuts on the same picture.
 */
export function createTvFeed(
  pass: WormholePass,
  onAdvance: (ctx: StoryContext) => { time: number; flow: number; freeze: number },
  frames: () => { toPaper: Matrix4; eye: Vector3 },
  scale: () => number,
): StoryTvFeed & { dispose(): void; draw(ctx: StoryContext, camera: Camera | null): void } {
  const feed = {
    texture: pass.feedTarget.texture,
    update(ctx: StoryContext) {
      feed.draw(ctx, null);
    },
    draw(ctx: StoryContext, camera: Camera | null) {
      const life = onAdvance(ctx);
      pass.sizeFeed(ctx, scale());
      pass.set(life.time, life.flow, life.freeze, 0, 2);
      const f = frames();
      pass.aim(
        camera instanceof PerspectiveCamera ? camera : pass.feedCamera,
        f.toPaper,
        f.eye,
        pass.feedTarget.height,
      );
      pass.render(ctx.stage.renderer, pass.feedTarget);
    },
    dispose() {
      pass.dispose();
    },
  };
  return feed;
}

/** A small helper for callers: 0..1 into the dive's flash at the very start (the pop-in of her figure). */
export function holeEntryFlash(p: number) {
  return 0.12 * (1 - lin01(p, 0, 0.04));
}
