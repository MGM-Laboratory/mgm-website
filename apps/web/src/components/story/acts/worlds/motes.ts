import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from "three";

import { hash01 } from "@/components/story/props/deck-shared";

import { GLSL_COMMON } from "./common";

/**
 * Motes: the small things that drift through a world close to the lens
 * (star dust at The Edge, sand at the Dunes, sparks in Signal City, pollen
 * in Leafhold). They sell speed and depth (near-lens parallax), keep the
 * world alive while nobody scrolls, and swirl around the cursor.
 *
 * One draw call. Every mote is a pure function of its seed, the camera, the
 * treadmill offset and the clock, computed in the vertex shader: the field
 * is a box that wraps around a point ahead of the camera, so it never runs
 * out, and it slides along `flow` with the treadmill (backwards after a
 * scroll up). A soft fade at the box's faces hides the wrap.
 */

export type MotesSpec = Readonly<{
  /** The most motes this field draws (the tier picks a share). */
  max: number;
  /** The wrap box, metres. */
  box: Vector3;
  /** How far ahead of the camera the box's centre sits, metres. */
  ahead: number;
  /** Mote size range, metres. */
  size: readonly [number, number];
  /** Up to four colours (sRGB hex). */
  colours: readonly number[];
  /** Light that adds up (dust in the dark), or flecks that cover (sand, pollen). */
  additive: boolean;
  /** 0: a soft dot; 1: a little four-point star; 2: a fleck (a tumbling tiny card). */
  shape: 0 | 1 | 2;
  /** Drift (a slow wander on the clock), metres. */
  drift: number;
  /** Opacity, 0..1. */
  opacity: number;
}>;

const VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform vec3 uBox;
uniform vec3 uCentre;
uniform vec3 uFlowOffset;
uniform float uTime;
uniform float uDrift;
uniform vec2 uSize;
uniform float uScale;
uniform vec3 uPointer;
uniform float uAspect;
uniform float uSwirl;
uniform vec3 uColours[4];
varying vec3 vColour;
varying float vAlpha;
varying float vSpin;
${GLSL_COMMON}
void main() {
  vec3 local = fract(aSeed.xyz + (uFlowOffset - uCentre) / uBox) - 0.5;
  float t = uTime * (0.25 + 0.3 * aSeed.w);
  vec3 wander = vec3(sin(t + aSeed.x * 40.0), sin(t * 1.3 + aSeed.y * 31.0), cos(t * 0.9 + aSeed.z * 23.0)) * uDrift;
  vec3 p = uCentre + local * uBox + wander;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vec4 clip = projectionMatrix * mv;
  // The cursor stirs them: a swirl around it in screen space, strongest close to it.
  vec2 ndc = clip.xy / max(clip.w, 1e-4);
  vec2 dlt = (ndc - uPointer.xy) * vec2(uAspect, 1.0);
  float r = length(dlt);
  float k = uPointer.z * uSwirl * exp(-r * r * 18.0);
  float a = k * (2.2 + sin(uTime * 1.7 + aSeed.w * 6.0));
  float ca = cos(a);
  float sa = sin(a);
  dlt = mat2(ca, sa, -sa, ca) * dlt * (1.0 + k * 0.35);
  ndc = uPointer.xy + dlt / vec2(uAspect, 1.0);
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  vec3 edge = smoothstep(vec3(0.5), vec3(0.36), abs(local));
  float fade = edge.x * edge.y * edge.z * smoothstep(0.15, 1.2, -mv.z);
  int ci = int(floor(fract(aSeed.w * 7.31) * 3.999));
  vColour = uColours[ci];
  float tw = 0.65 + 0.35 * sin(uTime * (2.0 + 3.0 * aSeed.y) + aSeed.x * 50.0);
  vAlpha = fade * tw;
  vSpin = aSeed.z * 6.2831 + uTime * (1.0 + 3.0 * aSeed.x);
  float size = mix(uSize.x, uSize.y, aSeed.w * aSeed.w);
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.05), 0.0, 64.0);
  if (mv.z > -0.05) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform int uShape;
uniform float uOpacity;
uniform float uFreeze;
uniform float uAdditive;
varying vec3 vColour;
varying float vAlpha;
varying float vSpin;
${GLSL_COMMON}
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float m;
  if (uShape == 1) {
    // A four-point twinkle: two thin crossed rays and a bright core.
    float rays = exp(-abs(q.x) * 9.0) * exp(-abs(q.y) * 1.6) + exp(-abs(q.y) * 9.0) * exp(-abs(q.x) * 1.6);
    m = rays * 0.8 + exp(-dot(q, q) * 9.0);
  } else if (uShape == 2) {
    float c = cos(vSpin);
    float s = sin(vSpin);
    q = mat2(c, -s, s, c) * q;
    float d = max(abs(q.x) / (0.3 + 0.35 * abs(c)), abs(q.y) / 0.6);
    m = 1.0 - smoothstep(0.8, 1.0, d);
  } else {
    m = exp(-dot(q, q) * 3.2) * (1.0 - smoothstep(0.85, 1.0, length(q)));
  }
  float a = clamp(m * vAlpha * uOpacity, 0.0, 1.0);
  if (a < 0.004) discard;
  vec3 col = freezeGrade(vColour, uFreeze);
  // Premultiplied either way: additive light, or flecks that cover what is behind.
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb * a, mix(a, 0.0, uAdditive));
}
`;

export class Motes {
  readonly points: Points;
  readonly material: ShaderMaterial;
  private readonly geometry: BufferGeometry;
  private readonly forward = new Vector3();

  constructor(
    private readonly spec: MotesSpec,
    freeze: { value: number },
    time: { value: number },
  ) {
    const seeds = new Float32Array(spec.max * 4);
    for (let i = 0; i < spec.max; i += 1) {
      seeds.set([hash01(i, 401), hash01(i, 402), hash01(i, 403), hash01(i, 404)], i * 4);
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute("aSeed", new BufferAttribute(seeds, 4));
    this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(spec.max * 3), 3));
    const colours = [0, 1, 2, 3].map(
      (i) => new Color(spec.colours.at(i) ?? spec.colours.at(0) ?? 0xffffff),
    );
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uBox: { value: spec.box.clone() },
        uCentre: { value: new Vector3() },
        uFlowOffset: { value: new Vector3() },
        uTime: time,
        uDrift: { value: spec.drift },
        uSize: { value: new Vector2(spec.size[0], spec.size[1]) },
        uScale: { value: 400 },
        uPointer: { value: new Vector3() },
        uAspect: { value: 1 },
        uSwirl: { value: 1 },
        uColours: { value: colours },
        uShape: { value: spec.shape },
        uOpacity: { value: spec.opacity },
        uFreeze: freeze,
        uAdditive: { value: spec.additive ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: spec.additive ? AdditiveBlending : NormalBlending,
      premultipliedAlpha: true,
      toneMapped: false,
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 30;
  }

  /** How many of `max` this tier draws (a share, 0..1). */
  setShare(share: number) {
    this.geometry.setDrawRange(0, Math.round(this.spec.max * Math.min(1, Math.max(0, share))));
  }

  /**
   * One frame: the box ahead of `camera`, the treadmill offset (metres
   * along the world's flow), the pointer (NDC and presence) and the
   * drawing buffer height (device pixels) for the point sizes.
   */
  update(
    camera: PerspectiveCamera,
    flowOffset: Vector3,
    pointer: Readonly<{ x: number; y: number; on: number }>,
    bufferHeight: number,
    aspect: number,
  ) {
    const u = this.material.uniforms;
    camera.getWorldDirection(this.forward);
    (u.uCentre.value as Vector3)
      .copy(camera.position)
      .addScaledVector(this.forward, this.spec.ahead);
    (u.uFlowOffset.value as Vector3).copy(flowOffset);
    (u.uPointer.value as Vector3).set(pointer.x, pointer.y, pointer.on);
    u.uAspect.value = aspect;
    const tanV = Math.tan((camera.fov * Math.PI) / 360);
    u.uScale.value = bufferHeight / (2 * tanV);
  }

  setOpacity(opacity: number) {
    this.material.uniforms.uOpacity.value = opacity;
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
