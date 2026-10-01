import {
  AlwaysDepth,
  BufferAttribute,
  BufferGeometry,
  GLSL3,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  type WebGLRenderer,
} from "three";

import {
  BACKDROP_DEFAULTS,
  saturate,
  type StoryBackdropApi,
  type StoryBackdropParams,
} from "@/components/story/engine/act";

/**
 * The page colour backdrop and its dissolve (docs/homepage-story.md,
 * "Composition"). The canvas is transparent, so where the backdrop does not
 * paint, the DOM page shows through. Where it paints, it writes the page
 * colour's sRGB bytes as they are (no tone mapping, no colour conversion),
 * so it matches the DOM pixel for pixel in both schemes.
 *
 * During a reveal the stage draws the `behind` layer (the room), then this
 * mask: pixels the dissolve has not opened get the page colour (or a hole
 * when `paint` is 0) and a far depth, so the `front` layer drawn after it
 * lands on top there and depth-tests against the room where it is open.
 */

const VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out highp vec4 outColor;
uniform vec3 uColor;
uniform vec3 uEdgeColor;
uniform float uPaint;
uniform float uReveal;
uniform float uNoise;
uniform float uEdge;
uniform vec2 uOrigin;
uniform vec2 uAspect;
uniform float uFar;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uAspect;
  vec2 o = uOrigin * uAspect;
  float d = length(p - o) / uFar;
  float n = fbm(vUv * uAspect * 3.2);
  float m = mix(d, n, uNoise);
  if (m < uReveal) discard;
  gl_FragDepth = 1.0;
  float band = uEdge * 0.08;
  if (band > 0.0 && m < uReveal + band) {
    outColor = vec4(uEdgeColor, 1.0);
    return;
  }
  outColor = vec4(uColor * uPaint, uPaint);
}
`;

/** sRGB 0..1 channels of 0xRRGGBB, untouched by colour management. */
function srgbChannels(hex: number, out: Vector3) {
  return out.set(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

export class StoryBackdrop implements StoryBackdropApi {
  params: StoryBackdropParams = { ...BACKDROP_DEFAULTS };
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;

  constructor() {
    this.geometry = new BufferGeometry();
    // One triangle over the whole screen.
    this.geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
    );
    this.material = new ShaderMaterial({
      glslVersion: GLSL3,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uColor: { value: new Vector3() },
        uEdgeColor: { value: new Vector3() },
        uPaint: { value: 1 },
        uReveal: { value: 0 },
        uNoise: { value: 0.35 },
        uEdge: { value: 0 },
        uOrigin: { value: new Vector2() },
        uAspect: { value: new Vector2(1, 1) },
        uFar: { value: 1 },
      },
      depthTest: true,
      depthWrite: true,
      depthFunc: AlwaysDepth,
      transparent: false,
      toneMapped: false,
    });
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  /** Back to the defaults (every frame, before the acts update). */
  reset() {
    this.params = { ...BACKDROP_DEFAULTS };
  }

  set(params: Partial<StoryBackdropParams>) {
    Object.assign(this.params, params);
  }

  get paint() {
    return saturate(this.params.paint);
  }

  get reveal() {
    return saturate(this.params.reveal);
  }

  /** The colour it paints: the override, else `page`. */
  color(page: number) {
    return this.params.color ?? page;
  }

  /** Draws the dissolve mask into the current target (the behind layer is already there). */
  renderMask(renderer: WebGLRenderer, page: number, aspect: number) {
    const u = this.material.uniforms;
    const p = this.params;
    srgbChannels(this.color(page), u.uColor.value as Vector3);
    srgbChannels(p.edgeColor, u.uEdgeColor.value as Vector3);
    u.uPaint.value = this.paint;
    u.uReveal.value = this.reveal;
    u.uNoise.value = saturate(p.noise);
    u.uEdge.value = saturate(p.edge);
    (u.uOrigin.value as Vector2).set(p.origin[0], p.origin[1]);
    const ax = aspect >= 1 ? aspect : 1;
    const ay = aspect >= 1 ? 1 : 1 / aspect;
    (u.uAspect.value as Vector2).set(ax, ay);
    // Normalise by the farthest screen corner from the origin, so reveal 1 opens everything.
    const ox = p.origin[0] * ax;
    const oy = p.origin[1] * ay;
    u.uFar.value = Math.hypot(ax + Math.abs(ox), ay + Math.abs(oy)) + 1e-3;
    renderer.render(this.scene, this.camera);
  }

  /** Compiles the mask program (the loading screen warms it). */
  compile(renderer: WebGLRenderer) {
    renderer.compile(this.scene, this.camera);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
