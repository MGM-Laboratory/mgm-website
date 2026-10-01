import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  DynamicDrawUsage,
  FloatType,
  GLSL3,
  Mesh,
  NearestFilter,
  NormalBlending,
  Points,
  RGBAFormat,
  ShaderMaterial,
  Vector2,
} from "three";

import { STAR_SDF_GLSL } from "@/components/story/props/fx/star-sdf.glsl";

/**
 * The thread batch: many polylines drawn as anti-aliased hairlines of a
 * width in screen pixels, in one draw call. Each row of a float data
 * texture holds one polyline (up to `SAMPLES` points: position in the
 * stage frame and a width in CSS px, then a straight sRGB colour with
 * alpha); a static strip of vertices reads its point and both neighbours
 * from the texture and offsets itself across the line on screen. A point
 * with width 0 is not drawn, so a row may use any number of points.
 *
 * The lines are depth tested (they pass in front of and behind the cards
 * and the box) and never write depth. Colours are written as they are
 * (no tone mapping), so an ink line on the light page is the page's ink.
 *
 * `StarPoints` is the matching batch of small four-point stars (the card
 * back's constellation stars) as screen-sized points.
 */

export const SAMPLES = 256;

const LINE_VERTEX = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform sampler2D uData;
uniform vec2 uViewport;
uniform float uPixelRatio;
in float aRow;
in float aIndex;
in float aSide;
out vec4 vColor;
out float vAcross;
out float vHalf;
vec4 pointAt(float i) {
  return texelFetch(uData, ivec2(int(i) * 2, int(aRow)), 0);
}
vec2 toScreen(vec4 clip) {
  return clip.xy / max(clip.w, 1e-5) * 0.5 * uViewport;
}
void main() {
  vec4 p = pointAt(aIndex);
  vColor = texelFetch(uData, ivec2(int(aIndex) * 2 + 1, int(aRow)), 0);
  vec4 prev = pointAt(max(aIndex - 1.0, 0.0));
  vec4 next = pointAt(min(aIndex + 1.0, ${SAMPLES - 1}.0));
  mat4 mvp = projectionMatrix * modelViewMatrix;
  vHalf = 0.0;
  vAcross = 0.0;
  if (p.w <= 0.0) {
    // A dead point: sit on a live neighbour's centre (the boundary triangles have no area),
    // or leave the screen when both neighbours are dead too.
    vColor.a = 0.0;
    vec4 live = prev.w > 0.0 && aIndex > 0.0 ? prev : next;
    gl_Position = live.w > 0.0 ? mvp * vec4(live.xyz, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (prev.w <= 0.0) prev = p;
  if (next.w <= 0.0) next = p;
  vec4 clip = mvp * vec4(p.xyz, 1.0);
  vec2 a = toScreen(mvp * vec4(prev.xyz, 1.0));
  vec2 b = toScreen(mvp * vec4(next.xyz, 1.0));
  vec2 dir = b - a;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  // At least a device pixel wide; thinner lines fade instead of breaking up.
  float width = max(p.w * uPixelRatio, 1.0);
  vHalf = width * 0.5;
  float reach = vHalf + 1.0;
  vAcross = aSide * reach;
  clip.xy += normal * aSide * reach / (0.5 * uViewport) * clip.w;
  vColor.a *= min(1.0, p.w * uPixelRatio);
  gl_Position = clip.w > 0.0 ? clip : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const LINE_FRAGMENT = /* glsl */ `
precision highp float;
in vec4 vColor;
in float vAcross;
in float vHalf;
layout(location = 0) out highp vec4 outColor;
void main() {
  float cover = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0);
  float a = vColor.a * cover;
  if (a < 0.002) discard;
  outColor = vec4(vColor.rgb, a);
}
`;

export class ThreadField {
  readonly mesh: Mesh;
  readonly rows: number;
  private readonly data: Float32Array;
  private readonly texture: DataTexture;
  private readonly material: ShaderMaterial;
  private readonly viewport = new Vector2(1, 1);
  private readonly scratch = new Float32Array(8);

  constructor(rows: number) {
    this.rows = rows;
    this.data = new Float32Array(SAMPLES * 2 * 4 * rows);
    this.texture = new DataTexture(this.data, SAMPLES * 2, rows, RGBAFormat, FloatType);
    this.texture.minFilter = NearestFilter;
    this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;

    const vertices = rows * SAMPLES * 2;
    const row = new Float32Array(vertices);
    const index = new Float32Array(vertices);
    const side = new Float32Array(vertices);
    const triangles: number[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let i = 0; i < SAMPLES; i += 1) {
        const v = (r * SAMPLES + i) * 2;
        row.fill(r, v, v + 2);
        index.fill(i, v, v + 2);
        side.set([-1, 1], v);
        // Counter-clockwise on screen: side -1 lies to the right of the line's direction.
        if (i < SAMPLES - 1) triangles.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
      }
    }
    const geometry = new BufferGeometry();
    // A position attribute three can count vertices by (the shader reads the texture instead).
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices * 3), 3));
    geometry.setAttribute("aRow", new BufferAttribute(row, 1));
    geometry.setAttribute("aIndex", new BufferAttribute(index, 1));
    geometry.setAttribute("aSide", new BufferAttribute(side, 1));
    geometry.setIndex(triangles);
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      uniforms: {
        uData: { value: this.texture },
        uViewport: { value: this.viewport },
        uPixelRatio: { value: 1 },
      },
      vertexShader: LINE_VERTEX,
      fragmentShader: LINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: NormalBlending,
      toneMapped: false,
    });
    this.material.name = "cards-threads";
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.name = "cards-threads";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
  }

  /** The drawing buffer's size and the pixel ratio (widths are CSS px). */
  setViewport(width: number, height: number, pixelRatio: number) {
    this.viewport.set(width * pixelRatio, height * pixelRatio);
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  /** Empties every row (width 0 everywhere). */
  clear() {
    this.data.fill(0);
  }

  /** Empties one row. */
  clearRow(row: number) {
    const start = row * SAMPLES * 8;
    this.data.fill(0, start, start + SAMPLES * 8);
  }

  /**
   * Writes point `i` of `row`: stage position, width (CSS px) and a straight
   * sRGB colour with alpha.
   */
  point(
    row: number,
    i: number,
    x: number,
    y: number,
    z: number,
    width: number,
    r: number,
    g: number,
    b: number,
    a: number,
  ) {
    const s = this.scratch;
    s[0] = x;
    s[1] = y;
    s[2] = z;
    s[3] = width;
    s[4] = r;
    s[5] = g;
    s[6] = b;
    s[7] = a;
    this.data.set(s, (row * SAMPLES + i) * 8);
  }

  /** Uploads this frame's lines. */
  commit() {
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute vec4 aColour;
attribute float aSpin;
uniform float uPixelRatio;
varying vec4 vColour;
varying float vSpin;
void main() {
  vColour = aColour;
  vSpin = aSpin;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
  if (aSize <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const STAR_FRAGMENT = /* glsl */ `
varying vec4 vColour;
varying float vSpin;
${STAR_SDF_GLSL}
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = sdStar4Rot(q, 0.92, 0.36, vSpin);
  float aa = fwidth(d) * 1.2 + 0.02;
  float a = sdFill(d, aa) * vColour.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColour.rgb, a);
}
`;

export class StarPoints {
  readonly points: Points;
  readonly capacity: number;
  private readonly position: BufferAttribute;
  private readonly size: BufferAttribute;
  private readonly colour: BufferAttribute;
  private readonly spin: BufferAttribute;
  private readonly material: ShaderMaterial;

  constructor(capacity: number) {
    this.capacity = capacity;
    const geometry = new BufferGeometry();
    this.position = new BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(
      DynamicDrawUsage,
    );
    this.size = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
    this.colour = new BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(DynamicDrawUsage);
    this.spin = new BufferAttribute(new Float32Array(capacity), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("position", this.position);
    geometry.setAttribute("aSize", this.size);
    geometry.setAttribute("aColour", this.colour);
    geometry.setAttribute("aSpin", this.spin);
    this.material = new ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: NormalBlending,
      toneMapped: false,
    });
    this.material.name = "cards-stars";
    this.points = new Points(geometry, this.material);
    this.points.name = "cards-stars";
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  setPixelRatio(pixelRatio: number) {
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }

  clear() {
    (this.size.array as Float32Array).fill(0);
  }

  /** Star `i`: stage position, size (CSS px), sRGB colour and alpha, spin (radians). */
  star(
    i: number,
    x: number,
    y: number,
    z: number,
    size: number,
    r: number,
    g: number,
    b: number,
    a: number,
    spin: number,
  ) {
    if (i < 0 || i >= this.capacity) return;
    this.position.setXYZ(i, x, y, z);
    this.size.setX(i, size);
    this.colour.setXYZW(i, r, g, b, a);
    this.spin.setX(i, spin);
  }

  commit() {
    this.position.needsUpdate = true;
    this.size.needsUpdate = true;
    this.colour.needsUpdate = true;
    this.spin.needsUpdate = true;
  }

  dispose() {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
