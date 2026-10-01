import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  type Vector3,
} from "three";

import {
  STAR_RATIO_COMPASS,
  STAR_RATIO_TWINKLE,
  STAR_SDF_GLSL,
} from "@/components/story/props/fx/star-sdf.glsl";

/**
 * The finale's two draw batches. Every small thing on the plain page is
 * written into one of them by the act each frame, so the whole act costs
 * Godette plus two draw calls:
 *
 * - `SpriteBatch`: camera-facing sprites in four shapes: the card back's
 *   compass star, its small constellation star, a soft disc (dust puffs)
 *   and a thin ring.
 * - `StrokeBatch`: camera-facing ribbons with round caps (speed lines, the
 *   constellation links of the dizzy ring, impact dashes).
 *
 * Positions are world units in the act's scene. Colours are 0xRRGGBB in
 * sRGB, encoded once for the target (`colorspace_fragment`), so a brand hex
 * stays that hex on the canvas. Not tone mapped, depth tested (her head
 * hides the stars behind it), no depth writes. `begin()` empties a batch,
 * `push*()` adds an instance, `end()` uploads what changed.
 */

export type SpriteShape = "compass" | "twinkle" | "disc" | "ring";

const SHAPE_INDEX: ReadonlyMap<SpriteShape, number> = new Map([
  ["compass", 0],
  ["twinkle", 1],
  ["disc", 2],
  ["ring", 3],
]);

const SPRITE_VERTEX = /* glsl */ `
attribute vec3 aCenter;
attribute vec4 aLook; // size (world), spin (rad), shape index, alpha
attribute vec3 aColor;
varying vec2 vQuad;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vSpin;
void main() {
  vQuad = position.xy * 2.0;
  vColor = aColor;
  vAlpha = aLook.w;
  vShape = aLook.z;
  vSpin = aLook.y;
  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  mv.xy += position.xy * aLook.x;
  gl_Position = projectionMatrix * mv;
}
`;

const SPRITE_FRAGMENT = /* glsl */ `
varying vec2 vQuad;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vSpin;
${STAR_SDF_GLSL}
void main() {
  float r = length(vQuad);
  float aa = fwidth(r) * 1.25 + 1e-4;
  float a;
  if (vShape < 0.5) {
    a = sdFill(sdStar4Rot(vQuad, 0.98, ${STAR_RATIO_COMPASS.toFixed(3)}, vSpin), aa);
  } else if (vShape < 1.5) {
    a = sdFill(sdStar4Rot(vQuad, 0.98, ${STAR_RATIO_TWINKLE.toFixed(3)}, vSpin), aa);
  } else if (vShape < 2.5) {
    // a flat cartoon puff with a crisp edge (overlapping puffs merge into one cloud)
    a = 1.0 - smoothstep(0.9 - aa, 0.9 + aa, r);
  } else {
    a = smoothstep(0.8 - aa, 0.8 + aa, r) * (1.0 - smoothstep(0.96 - aa, 0.96 + aa, r));
  }
  a *= vAlpha;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

const STROKE_VERTEX = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aEnd;
attribute vec3 aLook; // width (world), alpha, softness 0..1
attribute vec3 aColor;
varying vec2 vLocal;
varying float vLength;
varying float vHalf;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  vec4 s = modelViewMatrix * vec4(aStart, 1.0);
  vec4 e = modelViewMatrix * vec4(aEnd, 1.0);
  vec2 d = e.xy - s.xy;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(0.0, 1.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float h = aLook.x * 0.5;
  // position.x runs -0.5..0.5 along the stroke (plus a cap at each end), position.y across it.
  float along = position.x + 0.5;
  vec4 p = mix(s, e, along);
  p.xy += dir * sign(position.x) * h + perp * position.y * 2.0 * h;
  vLocal = vec2(along * len + sign(position.x) * h, position.y * 2.0 * h);
  vLength = len;
  vHalf = h;
  vColor = aColor;
  vAlpha = aLook.y;
  vSoft = aLook.z;
  gl_Position = projectionMatrix * p;
}
`;

const STROKE_FRAGMENT = /* glsl */ `
varying vec2 vLocal;
varying float vLength;
varying float vHalf;
varying vec3 vColor;
varying float vAlpha;
varying float vSoft;
void main() {
  // A capsule: the distance to the segment (0, 0) to (len, 0) against the half width.
  float x = clamp(vLocal.x, 0.0, vLength);
  float d = length(vLocal - vec2(x, 0.0));
  float aa = fwidth(d) * 1.1 + 1e-6;
  float a = 1.0 - smoothstep(vHalf - aa, vHalf + aa, d);
  float core = 1.0 - clamp(d / max(vHalf, 1e-6), 0.0, 1.0);
  a *= mix(1.0, core * core, vSoft);
  a *= vAlpha;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vColor, a);
  #include <colorspace_fragment>
}
`;

const scratch = new Color();

function attribute(capacity: number, size: number) {
  const a = new InstancedBufferAttribute(new Float32Array(capacity * size), size);
  a.setUsage(DynamicDrawUsage);
  return a;
}

function batchMaterial(vertexShader: string, fragmentShader: string, name: string) {
  return new ShaderMaterial({
    name,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    toneMapped: false,
  });
}

/** Writes 0xRRGGBB (sRGB) into `array` at `offset` as linear working-space floats. */
function writeColor(array: Float32Array, offset: number, hex: number) {
  scratch.setHex(hex);
  array.set([scratch.r, scratch.g, scratch.b], offset);
}

export class SpriteBatch {
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly center: InstancedBufferAttribute;
  private readonly look: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private count = 0;

  constructor(readonly capacity: number) {
    const quad = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    this.center = attribute(capacity, 3);
    this.look = attribute(capacity, 4);
    this.color = attribute(capacity, 3);
    geometry.setAttribute("aCenter", this.center);
    geometry.setAttribute("aLook", this.look);
    geometry.setAttribute("aColor", this.color);
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.mesh = new Mesh(geometry, batchMaterial(SPRITE_VERTEX, SPRITE_FRAGMENT, "finale-sprites"));
    this.mesh.name = "finale-sprites";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  begin() {
    this.count = 0;
  }

  /** One sprite: `size` is its full width in world units, `spin` radians in the view plane. */
  push(
    at: Readonly<Vector3> | readonly [number, number, number],
    size: number,
    shape: SpriteShape,
    color: number,
    alpha: number,
    spin = 0,
  ) {
    if (this.count >= this.capacity || alpha <= 0.003 || size <= 0) return;
    const i = this.count;
    const c = this.center.array as Float32Array;
    if ("x" in at) {
      c[i * 3] = at.x;
      c[i * 3 + 1] = at.y;
      c[i * 3 + 2] = at.z;
    } else {
      c[i * 3] = at[0];
      c[i * 3 + 1] = at[1];
      c[i * 3 + 2] = at[2];
    }
    const l = this.look.array as Float32Array;
    l[i * 4] = size;
    l[i * 4 + 1] = spin;
    l[i * 4 + 2] = SHAPE_INDEX.get(shape) ?? 2;
    l[i * 4 + 3] = Math.min(1, alpha);
    writeColor(this.color.array as Float32Array, i * 3, color);
    this.count += 1;
  }

  end() {
    const n = this.count;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const [a, size] of [
      [this.center, 3],
      [this.look, 4],
      [this.color, 3],
    ] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * size);
      a.needsUpdate = true;
    }
  }

  /** Shows one sprite so the program compiles with the scene (a hidden mesh is skipped). */
  warm() {
    this.begin();
    this.push([0, -100, 0], 0.001, "disc", 0xffffff, 0.01);
    this.end();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}

export class StrokeBatch {
  readonly mesh: Mesh;
  private readonly geometry: InstancedBufferGeometry;
  private readonly start: InstancedBufferAttribute;
  private readonly end_: InstancedBufferAttribute;
  private readonly look: InstancedBufferAttribute;
  private readonly color: InstancedBufferAttribute;
  private count = 0;

  constructor(readonly capacity: number) {
    const quad = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute("position", quad.getAttribute("position"));
    this.start = attribute(capacity, 3);
    this.end_ = attribute(capacity, 3);
    this.look = attribute(capacity, 3);
    this.color = attribute(capacity, 3);
    geometry.setAttribute("aStart", this.start);
    geometry.setAttribute("aEnd", this.end_);
    geometry.setAttribute("aLook", this.look);
    geometry.setAttribute("aColor", this.color);
    geometry.instanceCount = 0;
    this.geometry = geometry;
    this.mesh = new Mesh(geometry, batchMaterial(STROKE_VERTEX, STROKE_FRAGMENT, "finale-strokes"));
    this.mesh.name = "finale-strokes";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  begin() {
    this.count = 0;
  }

  /** One stroke from `a` to `b`, `width` world units across, `soft` 0 (crisp) to 1 (a glow). */
  push(
    a: Readonly<Vector3>,
    b: Readonly<Vector3>,
    width: number,
    color: number,
    alpha: number,
    soft = 0,
  ) {
    if (this.count >= this.capacity || alpha <= 0.003 || width <= 0) return;
    const i = this.count;
    const s = this.start.array as Float32Array;
    const e = this.end_.array as Float32Array;
    s[i * 3] = a.x;
    s[i * 3 + 1] = a.y;
    s[i * 3 + 2] = a.z;
    e[i * 3] = b.x;
    e[i * 3 + 1] = b.y;
    e[i * 3 + 2] = b.z;
    const l = this.look.array as Float32Array;
    l[i * 3] = width;
    l[i * 3 + 1] = Math.min(1, alpha);
    l[i * 3 + 2] = soft;
    writeColor(this.color.array as Float32Array, i * 3, color);
    this.count += 1;
  }

  end() {
    const n = this.count;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n === 0) return;
    for (const [a, size] of [
      [this.start, 3],
      [this.end_, 3],
      [this.look, 3],
      [this.color, 3],
    ] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * size);
      a.needsUpdate = true;
    }
  }

  warm(origin: Readonly<Vector3>) {
    this.begin();
    this.push(origin, origin, 0.001, 0xffffff, 0.01);
    this.end();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
