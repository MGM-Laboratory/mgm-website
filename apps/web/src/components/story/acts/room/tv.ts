import {
  AdditiveBlending,
  Color,
  DataTexture,
  Mesh,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  Vector4,
  type Texture,
} from "three";

import { BILLBOARD_VERTEX } from "@/components/story/props/fx/star-sdf.glsl";

/**
 * The TV of the table act: the picture on `tv_screen` and the standby LED.
 *
 * The picture is one program for every state: off (the room's own glossy
 * panel takes over, see `RoomAct`), the CRT power-on (a line, the picture
 * opening, static, a bloom of colour), and then the portal. The portal is
 * the worlds act's live feed when it has registered one, or this module's
 * own preview: a lensed starfield around a dark sphere with a bright ring,
 * brand yellow and white on deep navy, alive on the clock. As the camera
 * dives in, the glass effects (scanlines, edge falloff, the reflection)
 * fade out, so at full cover the screen shows the bare picture, the frame
 * the worlds act opens on.
 *
 * Colours here are display-referred: the shader writes the bytes it means
 * (`toneMapped: false`, no output encode), like the page backdrop.
 */

const VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uPower;
uniform float uDive;
uniform float uWarp;
uniform float uAspect;
uniform float uUseFeed;
uniform float uFeedFlip;
uniform float uFeedEncode;
uniform sampler2D uFeed;
uniform vec4 uEntry;
uniform vec3 uEye;
uniform vec3 uScreenCentre;
uniform vec3 uScreenNormal;
uniform float uHover;
varying vec2 vUv;
varying vec3 vWorld;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

const vec3 NAVY = vec3(0.035, 0.05, 0.14);
const vec3 BLUE = vec3(0.227, 0.427, 0.773);
const vec3 YELLOW = vec3(0.969, 0.749, 0.2);
const vec3 WARM_WHITE = vec3(1.0, 0.96, 0.88);

// One layer of stars in polar cells around the lens, streaming outward (we fly toward the portal). Each
// pixel looks at its cell and the cells around it along the stream, so a star (or a long warp streak)
// is never cut at a cell's edge.
vec3 starLayer(vec2 b, float t, float density, float seed, float warp) {
  float r = length(b);
  float a = atan(b.y, b.x);
  float around = density * 2.0;
  float w = log(max(r, 1e-3)) * density * 0.45 - t * (0.16 + warp * 2.4);
  vec2 g = vec2((a / 6.2831853 + 0.5) * around, w);
  vec2 base = floor(g);
  float stretch = 1.0 + warp * 7.0;
  vec3 sum = vec3(0.0);
  for (int j = -2; j <= 2; j++) {
    vec2 cell = base + vec2(0.0, float(j));
    vec2 key = vec2(mod(cell.x, around), cell.y);
    vec2 h = hash22(key + seed);
    if (h.x < 0.62) continue;
    vec2 centre = cell + 0.5 + (hash22(key + seed + 17.0) - 0.5) * 0.7;
    vec2 d = g - centre;
    d.y /= stretch;
    float size = mix(0.035, 0.075, h.y * h.y);
    float q = dot(d, d) / (size * size);
    float star = exp(-q * 1.8) + 0.18 * exp(-q * 0.22);
    float bright = (0.5 + 2.2 * h.y * h.y * h.y) / sqrt(stretch);
    float twinkle = 0.78 + 0.22 * sin(t * (1.3 + 3.0 * h.x) + h.y * 40.0);
    vec3 tint = h.x > 0.95 ? YELLOW : h.x > 0.82 ? mix(BLUE, WARM_WHITE, 0.55) : WARM_WHITE;
    sum += tint * star * bright * twinkle;
  }
  return sum;
}

// The space around the portal, seen through the lens.
vec3 space(vec2 b, float t, float warp) {
  float r = length(b);
  vec3 col = mix(NAVY * 1.6, NAVY * 0.7, smoothstep(0.0, 1.1, r));
  // A faint nebula in brand blue, slowly turning.
  float c = cos(t * 0.03);
  float s = sin(t * 0.03);
  vec2 n = mat2(c, -s, s, c) * b;
  col += BLUE * 0.18 * smoothstep(0.35, 0.95, fbm(n * 2.4 + 3.0)) * (1.0 - smoothstep(0.2, 1.2, r));
  col += starLayer(b, t, 18.0, 1.0, warp);
  col += starLayer(b * 1.37, t * 1.3, 26.0, 7.0, warp) * 0.7;
  col += starLayer(b * 1.9, t * 1.7, 40.0, 13.0, warp) * 0.45;
  return col;
}

// The other side, seen inside the sphere: another sky, warmer, swirling.
vec3 otherSide(vec2 u, float t, float warp) {
  float r = length(u);
  vec2 v = u / max(0.12, 1.0 - r * r * 0.75);
  float a = atan(v.y, v.x) + t * 0.12 + 1.2 / (0.4 + length(v));
  vec2 s = vec2(cos(a), sin(a)) * length(v);
  vec3 col = mix(vec3(0.06, 0.07, 0.2), vec3(0.02, 0.025, 0.07), r);
  col += mix(BLUE, YELLOW, 0.35) * 0.35 * smoothstep(0.45, 0.9, fbm(s * 1.6 + t * 0.05)) * (1.0 - r);
  col += starLayer(s * 0.7, t * 0.8, 22.0, 31.0, warp) * 0.9;
  return col * (0.55 + 0.45 * smoothstep(1.0, 0.6, r));
}

// The preview: a lensed starfield round a dark sphere with a bright ring.
vec3 portal(vec2 q, float t, float warp) {
  float r = length(q);
  float rs = 0.17;
  float re = 0.245;
  vec2 beta = q * (1.0 - re * re / max(r * r, 1e-4));
  vec3 col = space(beta, t, warp);
  float inside = 1.0 - smoothstep(rs - 0.004, rs + 0.003, r);
  col = mix(col, otherSide(q / rs, t, warp), inside);
  // The photon ring: a thin bright line hugging the sphere, a soft yellow halo outside it, breathing.
  float breathe = 0.9 + 0.1 * sin(t * 1.3);
  float line = exp(-pow((r - rs * 1.02) / 0.0045, 2.0));
  float halo = exp(-max(r - rs, 0.0) / 0.045) * (1.0 - inside);
  float arc = 0.75 + 0.25 * sin(atan(q.y, q.x) * 2.0 + t * 0.7);
  col += WARM_WHITE * line * 1.4 * breathe;
  col += YELLOW * halo * 0.55 * arc * breathe;
  return col;
}

vec3 feed(vec2 p) {
  vec2 uv = vec2(p.x, uFeedFlip > 0.5 ? p.y : 1.0 - p.y);
  vec3 c = texture2D(uFeed, uv).rgb;
  // A linear (colour managed) feed is encoded here; a display-byte feed is used as it is.
  return mix(c, pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)), uFeedEncode);
}

void main() {
  // p: 0..1 across the screen, y up (glTF UVs run down).
  vec2 p = vec2(vUv.x, 1.0 - vUv.y);
  vec2 q = (p - 0.5) * vec2(uAspect, 1.0);
  float t = uTime;
  float glass = 1.0 - uDive;

  // Where she went in: rings run out across the picture.
  if (uEntry.z > 0.0) {
    vec2 e = (uEntry.xy - 0.5) * vec2(uAspect, 1.0);
    vec2 d = q - e;
    float r = length(d);
    float s = uEntry.w;
    float wave = sin(r * 70.0 - s * 26.0) * exp(-r * 7.0) * exp(-s * 2.2) * smoothstep(0.0, 0.05, s);
    q += normalize(d + 1e-5) * wave * 0.012 * uEntry.z;
    p = q / vec2(uAspect, 1.0) + 0.5;
  }

  vec3 picture = uUseFeed > 0.5 ? feed(p) : portal(q, t, uWarp);

  // CRT power-on: a line, the picture opening, static, a bloom of colour.
  float P = uPower;
  float lineW = smoothstep(0.0, 0.07, P);
  float open = smoothstep(0.07, 0.26, P);
  float halfH = mix(0.002, 0.5, open * open);
  float inLine = step(abs(p.y - 0.5), halfH) * step(abs(p.x - 0.5), 0.5 * lineW);
  float staticAmt = smoothstep(0.12, 0.3, P) * (1.0 - smoothstep(0.42, 0.68, P));
  float grain = hash12(floor(p * vec2(320.0, 180.0)) + floor(t * 60.0));
  float roll = 0.5 + 0.5 * sin(p.y * 40.0 - t * 30.0);
  vec3 snow = vec3(grain * (0.55 + 0.45 * roll));
  float flash = smoothstep(0.0, 0.05, P) * (1.0 - smoothstep(0.1, 0.36, P)) * 1.6;
  float bloom = smoothstep(0.42, 0.62, P) * (1.0 - smoothstep(0.62, 0.95, P));
  float shown = smoothstep(0.45, 0.9, P);
  vec3 col = picture * shown;
  col = mix(col, snow, staticAmt);
  col += mix(BLUE, WARM_WHITE, 0.6) * bloom * 0.6;
  col = mix(col, WARM_WHITE * 1.3, flash * (1.0 - open));
  col *= inLine;
  col += WARM_WHITE * flash * open * 0.35 * inLine;

  // The glass: scanlines, an RGB mask, edges that fall off, a reflection that moves with the eye.
  float scan = 0.88 + 0.12 * sin(p.y * 900.0);
  float mask = 0.93 + 0.07 * sin(p.x * 1500.0);
  vec2 edge = abs(p - 0.5) * 2.0;
  float falloff = 1.0 - 0.38 * pow(max(edge.x, edge.y), 6.0);
  col *= mix(1.0, scan * mask * falloff, glass);
  vec3 toEye = normalize(uEye - vWorld);
  float facing = clamp(dot(toEye, uScreenNormal), 0.0, 1.0);
  float sheen = pow(1.0 - facing, 3.0) * 0.12 + 0.03 * smoothstep(0.2, 0.0, abs(p.x - p.y * 0.4 - 0.32 - (uEye.z - uScreenCentre.z) * 0.15));
  col += vec3(0.85, 0.9, 1.0) * sheen * glass * (0.4 + 0.6 * (1.0 - P));
  col *= 1.0 + 0.06 * uHover * glass;
  gl_FragColor = vec4(col, 1.0);
}
`;

const LED_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uGlow;
varying vec2 vQuad;
void main() {
  float r = length(vQuad);
  float core = 1.0 - smoothstep(0.14, 0.2, r);
  float halo = exp(-r * r * 9.0) * 0.5;
  float a = (core + halo) * uGlow;
  gl_FragColor = vec4(uColour * a, 1.0);
}
`;

export type TvFeedMode = Readonly<{ flip: boolean; encode: boolean }>;

/**
 * How to show a feed texture in screen space: a render target is stored
 * bottom up (flip), an image the other way; a display-byte target (RGBA8
 * tagged sRGB, like the stage's post target) is shown as it is, anything
 * colour managed is encoded.
 */
export function tvFeedMode(texture: Texture): TvFeedMode {
  const target = (texture as Texture & { isRenderTargetTexture?: boolean }).isRenderTargetTexture;
  const flip = target === true || texture.flipY;
  const displayBytes =
    target === true && texture.colorSpace === SRGBColorSpace && texture.internalFormat === "RGBA8";
  return { flip, encode: !displayBytes };
}

export class TvScreen {
  readonly material: ShaderMaterial;
  readonly led: Mesh;
  private readonly uniforms;
  private readonly ledUniforms;
  private readonly blank: DataTexture;

  constructor(aspect: number, centre: Vector3, normal: Vector3, ledAt: Vector3) {
    this.blank = new DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      RGBAFormat,
      UnsignedByteType,
    );
    this.blank.needsUpdate = true;
    this.uniforms = {
      uTime: { value: 0 },
      uPower: { value: 0 },
      uDive: { value: 0 },
      uWarp: { value: 0 },
      uAspect: { value: aspect },
      uUseFeed: { value: 0 },
      uFeedFlip: { value: 0 },
      uFeedEncode: { value: 0 },
      uFeed: { value: this.blank as Texture },
      uEntry: { value: new Vector4(0.5, 0.5, 0, 0) },
      uEye: { value: new Vector3() },
      uScreenCentre: { value: centre.clone() },
      uScreenNormal: { value: normal.clone().normalize() },
      uHover: { value: 0 },
    };
    this.material = new ShaderMaterial({
      name: "story-room-tv",
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      toneMapped: false,
    });

    this.ledUniforms = {
      uSize: { value: 0.012 },
      uSpin: { value: 0 },
      uColour: { value: new Color(0xff3b30) },
      uGlow: { value: 0 },
    };
    const ledMaterial = new ShaderMaterial({
      uniforms: this.ledUniforms,
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader: LED_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    });
    this.led = new Mesh(new PlaneGeometry(1, 1), ledMaterial);
    this.led.name = "story-room-tv-led";
    this.led.position.copy(ledAt);
    this.led.frustumCulled = false;
    this.led.renderOrder = 3;
  }

  /**
   * One frame of the picture. `power` 0..1 is the latched power-on, `dive`
   * 0..1 clears the glass for the full cover, `warp` stretches the stars.
   */
  set(options: {
    time: number;
    power: number;
    dive: number;
    warp: number;
    eye: Vector3;
    feed: Texture | null;
    entry: Readonly<{ x: number; y: number; strength: number; seconds: number }> | null;
    hover: number;
  }) {
    const u = this.uniforms;
    u.uTime.value = options.time;
    u.uPower.value = options.power;
    u.uDive.value = options.dive;
    u.uWarp.value = options.warp;
    u.uEye.value.copy(options.eye);
    u.uHover.value = options.hover;
    const feed = options.feed;
    if (feed) {
      const mode = tvFeedMode(feed);
      u.uFeed.value = feed;
      u.uUseFeed.value = 1;
      u.uFeedFlip.value = mode.flip ? 1 : 0;
      u.uFeedEncode.value = mode.encode ? 1 : 0;
    } else {
      u.uFeed.value = this.blank;
      u.uUseFeed.value = 0;
    }
    const entry = options.entry;
    if (entry) u.uEntry.value.set(entry.x, entry.y, entry.strength, entry.seconds);
    else u.uEntry.value.set(0.5, 0.5, 0, 0);
  }

  /** The standby LED: red and blinking while the set sleeps, a white wink as it wakes, then dark. */
  setLed(time: number, power: number) {
    const standby = 1 - Math.min(1, power * 6);
    const blink = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(time * 1.6)), 6);
    const wink = Math.max(0, 1 - Math.abs(power - 0.1) * 12);
    const lu = this.ledUniforms;
    lu.uColour.value.setRGB(1, 0.23 + 0.77 * wink, 0.19 + 0.81 * wink);
    lu.uGlow.value = standby * blink * 0.9 + wink * 0.8;
    this.led.visible = lu.uGlow.value > 0.01;
  }

  /** The screen's average light on the room (a colour for `room.tvGlow`). */
  averageColour(power: number, out: Color) {
    const staticAmt = smooth(0.12, 0.3, power) * (1 - smooth(0.42, 0.68, power));
    out.setRGB(0.32, 0.42, 0.78).lerp(WHITE, staticAmt * 0.7 + 0.2);
    return out;
  }

  dispose() {
    this.material.dispose();
    this.led.geometry.dispose();
    (this.led.material as ShaderMaterial).dispose();
    this.blank.dispose();
    this.led.removeFromParent();
  }
}

const WHITE = new Color(1, 1, 1);

function smooth(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
